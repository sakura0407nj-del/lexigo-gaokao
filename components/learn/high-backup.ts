import {parseProgress, type Progress} from './progress';

export const HIGH_BACKUP_KIND = 'lexigo-high-progress';
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export interface HighBackupPreview {
  progress: Progress;
  source: 'high' | 'legacy';
  exportedAt: string;
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const primaryId = /(?:^|:)(?:p[3-6]-|(?:ai-)?primary-(?:g[3-6]|grade-[3-6])(?:-|:|$))/i;
const unsafeKey = (key: string) => key === '__proto__' || key === 'prototype' || key === 'constructor';

function assertHighScope(progress: Record<string, unknown>) {
  if (progress.stage === 'primary' || owns(progress, 'grade') || owns(progress, 'primaryGrade')) throw new Error('这是小学记录，请切换到对应年级恢复，不能导入高中模式');
  // Inspect identifiers and explicit scope metadata, never ordinary passage/answer text.
  const stack: unknown[] = [progress];
  while (stack.length) {
    const value = stack.pop();
    if (Array.isArray(value)) { for (const item of value) if (item && typeof item === 'object') stack.push(item); continue; }
    if (!record(value)) continue;
    if (value.stage === 'primary' || value.primaryGrade !== undefined || ([3, 4, 5, 6].includes(value.grade as number))) throw new Error('文件含有小学年级记录，不能覆盖高中记录');
    for (const [key, item] of Object.entries(value)) {
      if (unsafeKey(key)) throw new Error('备份包含无效的记录标识');
      if (primaryId.test(key) || (['id', 'paperId', 'wordId', 'band'].includes(key) && typeof item === 'string' && primaryId.test(item))) throw new Error('文件含有小学词条或练习记录，请到小学模式恢复');
      if (item && typeof item === 'object') stack.push(item);
    }
  }
  for (const key of ['learned', 'starred']) if (Array.isArray(progress[key]) && progress[key].some(id => typeof id === 'string' && primaryId.test(id))) throw new Error('文件含有小学词条，不能导入高中模式');
}

function validateShape(raw: Record<string, unknown>) {
  if (raw.version !== 1) throw new Error('不支持的学习记录版本');
  for (const key of ['learned', 'starred', 'days', 'dictation', 'practice', 'corrections']) {
    if (!Array.isArray(raw[key])) throw new Error(`备份缺少有效的 ${key} 列表，未更改当前记录`);
  }
  for (const key of ['words', 'wrongbook']) if (!record(raw[key])) throw new Error(`备份缺少有效的 ${key} 数据`);
  for (const key of ['mistakes', 'review', 'log']) if (owns(raw, key) && !record(raw[key])) throw new Error(`备份中的 ${key} 格式不正确`);
  for (const key of ['words', 'wrongbook', 'mistakes', 'review', 'log']) {
    if (record(raw[key]) && !Object.values(raw[key]).every(record)) throw new Error(`备份中的 ${key} 条目格式不正确`);
  }
  for (const key of ['learned', 'starred', 'days', 'examAttempts']) {
    if (!owns(raw, key)) continue;
    if (!Array.isArray(raw[key]) || !raw[key].every(item => typeof item === 'string' && item.length > 0 && !unsafeKey(item))) throw new Error(`备份中的 ${key} 标识不正确`);
  }
  if (owns(raw, 'dailyGoal') && ![10, 20, 40].includes(raw.dailyGoal as number)) throw new Error('每日目标格式不正确');
  const nonnegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (record(raw.log)) for (const item of Object.values(raw.log)) {
    if (!record(item) || !['newWords', 'reviews', 'again'].every(key => nonnegative(item[key]) && Number.isInteger(item[key]))) throw new Error('学习日志的数量无效');
  }
  for (const item of raw.dictation as unknown[]) {
    if (!record(item) || !nonnegative(item.total) || !nonnegative(item.correct) || !Number.isInteger(item.total) || !Number.isInteger(item.correct) || (item.correct as number) > (item.total as number)) throw new Error('听写记录的数量无效');
  }
  for (const key of ['practice', 'corrections']) for (const item of raw[key] as unknown[]) {
    if (!record(item) || !nonnegative(item.score) || !nonnegative(item.maxScore) || (item.maxScore as number) <= 0 || (item.score as number) > (item.maxScore as number)) throw new Error('练习或批改记录的分数无效');
  }
}

/** A backup must be recognisable before the permissive local-storage migrator sees it. */
export function parseHighBackup(input: unknown): HighBackupPreview {
  if (!record(input)) throw new Error('文件内容不是学习记录备份');
  let source: HighBackupPreview['source'] = 'legacy';
  let raw: unknown = input;
  let exportedAt = '';
  if (owns(input, 'kind')) {
    if (input.kind === 'lexigo-primary-progress') throw new Error('这是小学备份，请切换到对应年级恢复，不能导入高中模式');
    if (input.kind !== HIGH_BACKUP_KIND || input.version !== 1 || (owns(input, 'stage') && input.stage !== 'high') || owns(input, 'grade') || owns(input, 'primaryGrade')) throw new Error('不是受支持的高中学习记录备份');
    source = 'high'; raw = input.progress;
    if (typeof input.exportedAt === 'string' && input.exportedAt.length <= 80 && Number.isFinite(Date.parse(input.exportedAt))) exportedAt = new Date(input.exportedAt).toISOString();
  } else if (owns(input, 'progress')) throw new Error('备份缺少学段标识，无法安全恢复');
  if (!record(raw)) throw new Error('备份缺少学习记录内容');
  assertHighScope(raw);
  validateShape(raw);
  const progress = parseProgress(raw);
  // Do not silently throw away corrupt entries, oversized histories or invalid dates.
  for (const key of ['words', 'wrongbook', 'mistakes', 'review', 'log'] as const) {
    if (record(raw[key]) && Object.keys(raw[key]).length !== Object.keys(progress[key]).length) throw new Error(`备份的 ${key} 含有无效记录，已停止恢复`);
  }
  for (const key of ['learned', 'starred', 'days', 'examAttempts'] as const) {
    if (Array.isArray(raw[key]) && new Set(raw[key]).size !== progress[key].length) throw new Error(`备份的 ${key} 含有无效或过多记录，已停止恢复`);
  }
  for (const key of ['dictation', 'practice', 'corrections'] as const) {
    const items = raw[key] as unknown[];
    if (items.length !== progress[key].length || !items.every(item => record(item) && typeof item.at === 'string' && Number.isFinite(Date.parse(item.at)))) throw new Error(`备份的 ${key} 含有无效或过多记录，已停止恢复`);
  }
  return {progress, source, exportedAt};
}

export function createHighBackup(progress: Progress, now = new Date()) {
  // Export all existing data for safekeeping; import still validates contents independently of this label.
  return {kind: HIGH_BACKUP_KIND, version: 1, stage: 'high', exportedAt: now.toISOString(), progress};
}

export function backupCounts(progress: Progress) {
  return [
    ['已掌握单词', progress.learned.length], ['收藏单词', progress.starred.length],
    ['听写错词', Object.keys(progress.wrongbook).length], ['错题（含已巩固）', Object.keys(progress.mistakes).length],
    ['听写记录', progress.dictation.length], ['练习记录', progress.practice.length],
    ['批改记录', progress.corrections.length], ['复习计划词条', Object.keys(progress.review).length], ['学习天数', progress.days.length],
  ] as const;
}
