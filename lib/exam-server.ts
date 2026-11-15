import {randomInt, randomUUID} from 'node:crypto';
import {z} from 'zod';
import {papers as bankPapers} from './learning-data';
import {hideAnswers} from './learning-core';
import {ApiError, bodyOf, json, openPaper, userOf} from './learning-server';
import {analyzeExam} from './exam-analysis';
import {EXAM_SECTION_LIMITS, EXAM_TYPES, EXAM_TYPE_LABELS} from './exam-types';
import type {CustomExam, ExamConfig, ExamGradeInput} from './exam-types';
import type {Paper} from './learning-types';

const countsSchema = z.object({
  reading: z.number().int().min(0).max(4), grammar: z.number().int().min(0).max(2),
  seven: z.number().int().min(0).max(2), cloze: z.number().int().min(0).max(2),
}).strict().refine(counts => {const total = Object.values(counts).reduce((sum, value) => sum + value, 0); return total >= 1 && total <= 8;}, '请选择 1–8 段题目。');

export const examConfigSchema = z.object({
  source: z.enum(['bank', 'ai']), level: z.enum(['基础', '标准', '挑战']),
  topic: z.string().trim().max(150), minutes: z.number().int().min(5).max(180),
  counts: countsSchema, targeted: z.boolean().optional(),
}).strict();

export const examAssembleSchema = z.object({config: examConfigSchema,
  weaknesses: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
}).strict();

const identifier = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const examGradeSchema = z.object({
  examId: identifier,
  sections: z.array(z.object({paperId: identifier, sealed: z.string().min(1).max(180000).optional()}).strict()).min(1).max(8),
  answers: z.record(identifier, z.record(z.string().min(1).max(100), z.string().max(500))
    .refine(value => Object.keys(value).length <= 60, '单段答案过多。'))
    .refine(value => Object.keys(value).length <= 8, '试卷答案过多。'),
  elapsedSeconds: z.number().int().min(0).max(86400), minutes: z.number().int().min(5).max(180),
}).strict();

const topicAliases: Record<string, string[]> = {
  '学校': ['school', 'student', 'education'], '校园': ['school', 'student'], '教育': ['education', 'school', 'learning'],
  '环保': ['environment', 'sustainable', 'garden', 'climate'], '环境': ['environment', 'sustainable', 'climate'],
  '科技': ['science', 'scientific', 'technology', 'digital'], '科学': ['science', 'scientific', 'observation'],
  '文化': ['culture', 'cultural', 'traditional', 'arts'], '传统': ['traditional', 'culture', 'arts'],
  '健康': ['healthy', 'health', 'habit'], '运动': ['sport', 'exercise', 'teamwork'],
  '志愿': ['volunteer', 'community'], '阅读': ['reading', 'book'], '旅行': ['travel', 'journey'],
};

function topicTerms(topic: string): string[] {
  const value = topic.toLocaleLowerCase().trim();
  if (!value || /^(不限|综合|综合训练|任意|all)$/.test(value)) return [];
  return [...new Set([value, ...value.split(/[\s,，、/]+/).filter(term => term.length > 1),
    ...Object.entries(topicAliases).filter(([key]) => value.includes(key)).flatMap(([, terms]) => terms)])];
}

function matchesTopic(paper: Paper, terms: string[]) {
  const description = `${paper.topic} ${paper.title} ${paper.passage}`.toLocaleLowerCase();
  return terms.length > 0 && terms.some(term => description.includes(term));
}

function matchesWeakness(paper: Paper, weaknesses: string[]) {
  return weaknesses.some(weakness => paper.questions.some(question => {
    const label = question.knowledge?.trim().toLocaleLowerCase() || '';
    const wanted = weakness.toLocaleLowerCase();
    return label.length > 0 && (label.includes(wanted) || wanted.includes(label));
  }));
}

export function assembleExam(raw: unknown, pool: Paper[] = bankPapers): CustomExam {
  const input = examAssembleSchema.parse(raw);
  const config: ExamConfig = input.config;
  if (config.source !== 'bank') throw new ApiError(400, 'AI 试卷请逐段命题；此接口只组合内置题库。');
  const weaknesses = config.targeted ? [...new Set(input.weaknesses || [])] : [];
  const terms = topicTerms(config.topic);
  const selected: Paper[] = [];
  const notes: string[] = ['本卷按所选客观题组合，不包含听力或作文，也不声称等同完整高考试卷。'];
  const uniquePool = [...new Map(pool.filter(paper => paper.origin !== 'ai').map(paper => [paper.id, paper])).values()];
  for (const type of EXAM_TYPES) {
    const count = config.counts[type];
    if (!count) continue;
    const candidates = uniquePool.filter(paper => paper.type === type);
    if (candidates.length < count) throw new ApiError(400, `${EXAM_TYPE_LABELS[type]}可用题目不足，请减少段数。`);
    const ranked = candidates.map(paper => ({paper,
      // Preserve the requested level first; otherwise clearly disclose the fallback below.
      score: (paper.level === config.level ? 1000 : 0) + (matchesWeakness(paper, weaknesses) ? 200 : 0)
        + (matchesTopic(paper, terms) ? 100 : 0) + (paper.origin === 'original' ? 50 : 0),
      tie: randomInt(0x7fffffff),
    })).sort((a, b) => b.score - a.score || a.tie - b.tie).slice(0, count).map(row => row.paper);
    selected.push(...ranked);
    const differentLevel = ranked.filter(paper => paper.level !== config.level).length;
    if (differentLevel) notes.push(`${EXAM_TYPE_LABELS[type]}中 ${differentLevel}/${count} 段未匹配“${config.level}”，已选用其他难度；请查看各段标签。`);
    const differentTopic = terms.length ? ranked.filter(paper => !matchesTopic(paper, terms)).length : 0;
    if (differentTopic) notes.push(`${EXAM_TYPE_LABELS[type]}中 ${differentTopic}/${count} 段未匹配主题“${config.topic}”，已用该题型的其他主题补齐。`);
    const differentWeakness = weaknesses.length ? ranked.filter(paper => !matchesWeakness(paper, weaknesses)).length : 0;
    if (differentWeakness) notes.push(`${EXAM_TYPE_LABELS[type]}中 ${differentWeakness}/${count} 段没有匹配所选错题知识点，属于普通练习。`);
  }
  if (config.targeted && !weaknesses.length) notes.push('尚未提供可用错题知识点，本次按普通题库组卷。');
  if (weaknesses.length) {
    const missing = weaknesses.filter(weakness => !selected.some(paper => matchesWeakness(paper, [weakness])));
    if (missing.length) notes.push(`本卷未覆盖这些目标知识点：${missing.join('、')}。`);
    notes.push('针对性组卷仅按题目已有知识点标签匹配；一段文章内仍可能包含其他知识点。');
  }
  if (selected.some(paper => paper.origin === 'past')) notes.push('本卷包含开源数据转录的历年真题片段；年份、卷别和来源以各段标注为准。');
  return {id: `exam-${randomUUID()}`, title: `${config.level} · ${selected.length} 段英语自选模拟卷`,
    createdAt: new Date().toISOString(), config, sections: selected.map(hideAnswers), notes};
}

export async function gradeExam(raw: unknown, user: string, pool: Paper[] = bankPapers) {
  const input: ExamGradeInput = examGradeSchema.parse(raw);
  const ids = input.sections.map(section => section.paperId);
  if (new Set(ids).size !== ids.length) throw new ApiError(400, '同一份练习不能在一张试卷中重复计分。');
  if (Object.keys(input.answers).some(id => !ids.includes(id))) throw new ApiError(400, '答案中含有不属于本卷的练习。');
  const resolved: Paper[] = [];
  const counts = {reading: 0, grammar: 0, seven: 0, cloze: 0};
  for (const ref of input.sections) {
    const paper = ref.sealed ? await openPaper(ref.sealed, user) : pool.find(item => item.id === ref.paperId && item.origin !== 'ai');
    if (!paper || paper.id !== ref.paperId) throw new ApiError(404, '找不到本卷中的练习，请重新打开或生成。');
    if (!EXAM_TYPES.includes(paper.type) || !Array.isArray(paper.questions) || !paper.questions.length || paper.questions.length > 60
      || new Set(paper.questions.map(question => question.id)).size !== paper.questions.length
      || paper.questions.some(question => !question.answer || !Number.isFinite(question.points) || question.points <= 0)) {
      throw new ApiError(400, '试卷结构不完整，无法可靠评分，请重新生成。');
    }
    counts[paper.type]++;
    if (counts[paper.type] > EXAM_SECTION_LIMITS[paper.type]) throw new ApiError(400, `${EXAM_TYPE_LABELS[paper.type]}段数超过本卷上限。`);
    const questionIds = new Set(paper.questions.map(question => question.id));
    if (Object.keys(input.answers[paper.id] || {}).some(id => !questionIds.has(id))) throw new ApiError(400, '答案中含有不存在的题号。');
    resolved.push(paper);
  }
  return analyzeExam(input, resolved);
}

export async function assembleExamRequest(req: Request) {
  userOf(req);
  return json(assembleExam(await bodyOf(req, 24000)));
}

export async function gradeExamRequest(req: Request) {
  const user = userOf(req);
  return json(await gradeExam(await bodyOf(req, 2 * 1024 * 1024), user));
}
