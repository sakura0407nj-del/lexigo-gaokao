'use client';
import {useEffect, useRef, useState, type ChangeEvent} from 'react';
import {AlertTriangle, CheckCircle2, Download, Upload, X} from 'lucide-react';
import type {PrimaryGrade} from '@/lib/primary-types';
import {useProgress, parseProgress, type Progress} from '../learn/progress';
import {downloadText, formatDate} from '../learn/ui';

const KIND = 'lexigo-primary-progress';
const MAX_BYTES = 10 * 1024 * 1024;
type Pending = {progress: Progress; exportedAt: string};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validatePrimaryBackup(raw: unknown, grade: PrimaryGrade): {progress: unknown; exportedAt: string} | string {
  if (!isObj(raw) || raw.kind !== KIND || raw.version !== 1) return '不是小学学习记录备份（高中记录或未知格式不能导入）';
  if (raw.grade !== grade) return `年级不匹配，这里只能导入小学${grade}年级的备份`;
  const p = raw.progress;
  if (!isObj(p) || p.version !== 1) return '备份中的记录版本不受支持';
  if (!Array.isArray(p.learned) || !Array.isArray(p.starred)) return '备份缺少已学或收藏数据';
  if (!isObj(p.words) || !isObj(p.wrongbook) || !isObj(p.mistakes)) return '备份中的单词或错题数据格式不正确';
  if (!Array.isArray(p.dictation) || !Array.isArray(p.practice) || !Array.isArray(p.corrections)) return '备份中的练习记录格式不正确';
  return {progress: p, exportedAt: typeof raw.exportedAt === 'string' && raw.exportedAt.length <= 80 && Number.isFinite(Date.parse(raw.exportedAt)) ? raw.exportedAt : ''};
}

const recent = <T extends {at: string}>(list: T[]) => [...list].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 6);

function counts(p: Progress) {
  return [
    {label: '已学单词', value: p.learned.length},
    {label: '收藏', value: p.starred.length},
    {label: '错词', value: Object.keys(p.wrongbook).length},
    {label: '待巩固错题', value: Object.values(p.mistakes).filter(m => !m.masteredAt).length},
  ];
}

function Stats({p}: {p: Progress}) {
  return (
    <div className='primary-stats'>
      {counts(p).map(s => <div key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>)}
    </div>
  );
}

export function PrimaryRecords({grade}: {grade: PrimaryGrade}) {
  const {progress, hydrated, storageAvailable, replaceAll} = useProgress();
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const gen = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    gen.current++;
    setPending(null); setError(''); setNotice(''); setBusy(false);
    return () => { gen.current++; };
  }, [grade]);

  const exportBackup = () => {
    const envelope = {kind: KIND, version: 1, grade, exportedAt: new Date().toISOString(), progress};
    const day = new Date().toISOString().slice(0, 10);
    downloadText(`lexigo-小学${grade}年级-${day}.json`, JSON.stringify(envelope, null, 2), 'application/json;charset=utf-8');
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const id = ++gen.current;
    setPending(null); setError(''); setNotice(''); setBusy(true);
    try {
      if (file.size > MAX_BYTES) throw new Error('文件超过 10MB，无法导入');
      const text = await file.text();
      if (id !== gen.current) return;
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { throw new Error('文件不是有效的 JSON'); }
      const result = validatePrimaryBackup(raw, grade);
      if (typeof result === 'string') throw new Error(result);
      setPending({progress: parseProgress(result.progress), exportedAt: result.exportedAt});
    } catch (err) {
      if (id === gen.current) setError(err instanceof Error ? err.message : '读取备份失败，原有记录未改动');
    } finally {
      if (id === gen.current) setBusy(false);
    }
  };

  const confirmRestore = () => {
    if (!pending) return;
    try {
      replaceAll(pending.progress);
      setPending(null);
      setNotice('已恢复本年级记录；其他年级和高中记录未改动');
    } catch {
      setError('恢复失败，原有记录未改动');
    }
  };

  const cancel = () => { gen.current++; setPending(null); setBusy(false); };

  if (!hydrated) return <section className='primary-records'><p className='primary-note'>正在读取学习记录…</p></section>;

  return (
    <section className='primary-records'>
      <h2>{`${grade}年级 · 学习记录`}</h2>
      {!storageAvailable && (
        <p className='primary-error'><AlertTriangle size={18} aria-hidden /> 浏览器存储不可用，最新记录不会保存。请及时导出备份。</p>
      )}
      <Stats p={progress} />
      <div className='primary-record-grid'>
        <div className='primary-panel'>
          <h3>最近听写</h3>
          {progress.dictation.length === 0 ? <p className='primary-empty'>还没有听写记录</p> : (
            <ul className='primary-record-list'>
              {recent(progress.dictation).map((d, i) => <li key={`${d.at}-${i}`}><span>{formatDate(d.at)}</span> <span>答对 {d.correct}/{d.total}</span></li>)}
            </ul>
          )}
        </div>
        <div className='primary-panel'>
          <h3>最近练习</h3>
          {progress.practice.length === 0 ? <p className='primary-empty'>还没有练习记录</p> : (
            <ul className='primary-record-list'>
              {recent(progress.practice).map((r, i) => <li key={`${r.at}-${i}`}><span>{formatDate(r.at)}</span> <span>{r.title}</span> <span>{r.score}/{r.maxScore}</span></li>)}
            </ul>
          )}
        </div>
        <div className='primary-panel'>
          <h3>最近批改</h3>
          {progress.corrections.length === 0 ? <p className='primary-empty'>还没有批改记录</p> : (
            <ul className='primary-record-list'>
              {recent(progress.corrections).map((c, i) => <li key={`${c.at}-${i}`}><span>{formatDate(c.at)}</span> <span>{c.summary}</span> <span>{c.score}/{c.maxScore}</span></li>)}
            </ul>
          )}
        </div>
      </div>
      <div className='primary-panel'>
        <h3>备份与恢复</h3>
        <p className='primary-note'>仅当前小学年级；不包含未完成答题草稿或游戏现场</p>
        <div className='primary-backup-actions'>
          <button type='button' className='primary-button' onClick={exportBackup}><Download size={18} aria-hidden /> 导出备份</button>
          <button type='button' className='primary-button' disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload size={18} aria-hidden /> {busy ? '正在读取…' : '选择备份文件'}
          </button>
          <input ref={fileRef} type='file' accept='application/json,.json' hidden onChange={onFile} />
        </div>
        {error && <p className='primary-error' role='alert'>{error}</p>}
        {notice && <p className='primary-note' role='status'><CheckCircle2 size={18} aria-hidden /> {notice}</p>}
        {pending && (
          <div className='primary-panel'>
            <p>备份预览{pending.exportedAt ? `（导出于 ${formatDate(pending.exportedAt)}）` : ''}：听写 {pending.progress.dictation.length} 次，练习 {pending.progress.practice.length} 次，批改 {pending.progress.corrections.length} 次</p>
            <Stats p={pending.progress} />
            <div className='primary-actions'>
              <button type='button' className='primary-button primary-button-primary' onClick={confirmRestore}>用此备份替换本年级记录</button>
              <button type='button' className='primary-button' onClick={cancel}><X size={18} aria-hidden /> 取消</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
