"use client";
import {newRequestId} from './request-id';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Volume2, Trophy, Users, Zap} from 'lucide-react';
import {applyAnswer, buildGameQuestions, createGameState, gameResult} from '@/lib/game-engine';
import type {GameAnswer, GameChoice, GameConfig, GameQuestion, GameState} from '@/lib/game-types';
import type {Word} from '@/lib/learning-types';
import type {PrimaryGrade, PrimaryWord, PrimaryWordsResponse} from '@/lib/primary-types';
import {scopedStorageKey} from '@/lib/learning-stage';
import bank from '@/data/game-sentences.json';
import {api, getJson, errorText, type CatalogResponse} from '@/components/learn/api';
import {useProgress} from '@/components/learn/progress';
import type {SpeechState} from '@/components/learn/use-speech';
import {GameScene} from './game-scene';
import './game.css';

type Run = {id: string; questions: GameQuestion[]; state: GameState; answers: GameAnswer[]; index: number; feedback: GameAnswer | null; phase: 'play' | 'result'; remaining: number; timed: boolean; paused: boolean; scope: string; reviewSaved?: boolean; primaryGrade?: PrimaryGrade};
const STORE = 'lexigo.game-run.v1';
const HISTORY = 'lexigo.game-history.v1';
const BEST = 'lexigo.game-best.v1';
const labels = {word: '词义快选', sentence: '语境填空', phrase: '短语搭配', mix: '综合闯关'};
function restore(primaryGrade?: PrimaryGrade): Run | null {
  try {const raw = localStorage.getItem(scopedStorageKey(STORE,primaryGrade)); if (!raw || raw.length > 250000) return null; const r = JSON.parse(raw) as Run;
    if (!r || !Array.isArray(r.questions) || !r.questions.length || r.questions.length > 20 || !Array.isArray(r.answers) || !r.state || !Number.isInteger(r.index) || r.index < 0 || r.index >= r.questions.length || !['play', 'result'].includes(r.phase)) return null;
    if (r.primaryGrade !== primaryGrade || r.questions.some(q => typeof q.id !== 'string' || q.id.length > 150 || typeof q.prompt !== 'string' || q.prompt.length > 3000 || !Array.isArray(q.options) || q.options.length !== 2 || q.options.some(option => typeof option !== 'string' || option.length > 2000) || ![0, 1].includes(q.answerIndex) || !['word', 'sentence', 'phrase'].includes(q.kind) || typeof q.explanation !== 'string' || typeof q.knowledge !== 'string' || primaryGrade && (q.kind !== 'word' || (q.word as PrimaryWord | undefined)?.grade !== primaryGrade))) return null;
    if (new Set(r.questions.map(q => q.id)).size !== r.questions.length || r.answers.length > r.questions.length || r.answers.length !== r.index + (r.feedback ? 1 : 0)) return null;
    let state = createGameState(r.questions.length); const answers: GameAnswer[] = [];
    for (const [index, prior] of r.answers.entries()) {if (!prior || prior.questionId !== r.questions[index].id || ![null, 0, 1].includes(prior.selectedIndex) || state.finished) return null; const result = applyAnswer(state, r.questions[index], prior.selectedIndex); state = result.state; answers.push(result.answer);}
    if ((r.phase === 'result' && !state.finished) || (state.finished && !r.feedback)) return null;
    return {...r, id: typeof r.id === 'string' ? r.id : newRequestId(), state, answers, feedback: r.feedback ? answers[answers.length-1] || null : null, scope: typeof r.scope === 'string' ? r.scope.slice(0, 1000) : '已保存关卡', paused: r.phase === 'play', remaining: Number.isFinite(r.remaining) ? Math.max(0, Math.min(12, r.remaining)) : 12};
  } catch {return null;}
}
function replayQuestions(answers: readonly GameAnswer[]): GameQuestion[] {
  const wrong = answers.filter(answer => !answer.correct).map(answer => answer.question);
  const start = Math.random() < .5 ? 0 : 1;
  const sides = wrong.map((_, index) => (index + start) % 2 as GameChoice);
  for (let index = sides.length - 1; index > 0; index--) {const other = Math.floor(Math.random() * (index + 1)); [sides[index], sides[other]] = [sides[other], sides[index]];}
  return wrong.map((question, index) => {
    const answerIndex = sides[index], correct = question.options[question.answerIndex], distractor = question.options[question.answerIndex === 0 ? 1 : 0];
    return {...question, answerIndex, options: answerIndex === 0 ? [correct, distractor] : [distractor, correct]};
  });
}
function primaryRunnerPool(items: readonly PrimaryWord[], grade: PrimaryGrade, selectedIds?: readonly string[]): PrimaryWord[] {
  const ids = selectedIds ? new Set(selectedIds) : null;
  return items.filter(word => word.grade === grade && (!ids || ids.has(word.id)));
}
export function GameView({speech, primaryGrade}: {speech: SpeechState; primaryGrade?: PrimaryGrade}) {
  const {progress, addMistakes, reviewWord, markStudyDay, storageAvailable} = useProgress();
  const storageKey = scopedStorageKey(STORE,primaryGrade), historyKey = scopedStorageKey(HISTORY,primaryGrade), bestKey = scopedStorageKey(BEST,primaryGrade);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null), [kind, setKind] = useState<GameConfig['kind']>(primaryGrade ? 'word' : 'mix');
  const [source, setSource] = useState('all'), [book, setBook] = useState(''), [unit, setUnit] = useState('');
  const [length, setLength] = useState<10 | 15 | 20>(15), [difficulty, setDifficulty] = useState<GameConfig['difficulty']>('all'), [timed, setTimed] = useState(false);
  const [run, setRun] = useState<Run | null>(()=>restore(primaryGrade)), [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState(''), [confirm, setConfirm] = useState(false), [saved, setSaved] = useState(false);
  const [best, setBest] = useState(() => {try {const value = Number(localStorage.getItem(bestKey)); return Number.isInteger(value) && value >= 0 && value <= 200 ? value : 0;} catch {return 0;}});
  const current = useRef(run), locked = useRef(false), active = useRef(true), dialog = useRef<HTMLDialogElement>(null); current.current = run;
  const update = useCallback((next: Run | null) => {current.current = next; setRun(next); try {if (next) localStorage.setItem(storageKey, JSON.stringify(next)); else localStorage.removeItem(storageKey);} catch {setNote('浏览器未能保存本局；请在离开前完成练习。');}}, [storageKey]);
  useEffect(() => {active.current = true; const controller = new AbortController(); if (!primaryGrade) api.catalog(controller.signal).then(setCatalog).catch(() => {}); return () => {active.current = false; controller.abort();};}, [primaryGrade]);
  useEffect(() => {const hide = () => {const r = current.current; if (document.hidden && r?.phase === 'play') update({...r, paused: true});}; const leave = () => {const r = current.current; if (r?.phase === 'play') {try {localStorage.setItem(storageKey, JSON.stringify({...r, paused: true}));} catch {}}}; document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', leave); return () => {document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave); leave();};}, [update,storageKey]);
  const answer = useCallback((choice: GameChoice | null) => {
    const r = current.current;
    if (!r || r.phase !== 'play' || r.feedback || r.paused || document.hidden || locked.current) return;
    locked.current = true; const question = r.questions[r.index], result = applyAnswer(r.state, question, choice);
    if (!result.answer.correct) {
      addMistakes([{id: `game:${question.id}`, kind: 'game', title: `英语闯关 · ${labels[question.kind]}`, prompt: question.prompt, context: question.evidence || '', options: question.options.map((option, i) => `${i ? 'B' : 'A'}. ${option}`), correctAnswer: question.answerIndex ? 'B' : 'A', yourAnswer: choice === null ? '未作答' : choice ? 'B' : 'A', explanation: question.explanation, knowledge: question.knowledge}]);
      if (question.word) reviewWord(question.word, false);
    }
    markStudyDay(); update({...r, remaining: choice === null ? 0 : r.remaining, state: result.state, answers: [...r.answers, result.answer], feedback: result.answer});
  }, [addMistakes, reviewWord, markStudyDay, update]);
  useEffect(() => {if (!run || run.phase !== 'play' || !run.timed || run.paused || run.feedback) return; let last = performance.now(); const timer = setInterval(() => {const r = current.current; const now = performance.now(), delta = Math.max(0, (now - last) / 1000); last = now; if (!r || r.paused || r.feedback || document.hidden) return; if (r.remaining <= delta) {answer(null); return;} const next = {...r, remaining: r.remaining - delta}; current.current = next; setRun(next);}, 200); return () => clearInterval(timer);}, [run?.index, run?.paused, run?.phase, run?.timed, Boolean(run?.feedback), answer]);
  useEffect(() => {const key = (event: KeyboardEvent) => {if (event.repeat || confirm || (event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable))) return; if (['ArrowLeft', 'a', 'A', 'ArrowRight', 'd', 'D'].includes(event.key)) {event.preventDefault(); answer(['ArrowLeft', 'a', 'A'].includes(event.key) ? 0 : 1);}}; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);}, [answer, confirm]);
  useEffect(() => {if (confirm && dialog.current && !dialog.current.open) dialog.current.showModal();}, [confirm]);
  const begin = async () => {
    setBusy(true); setError(''); setNote(''); setSaved(false);
    try {
      let words: Word[] = [], scope = '通用高中句子与短语';
      if (primaryGrade) {
        const response = await getJson<PrimaryWordsResponse>(`/api/primary/words?grade=${primaryGrade}`);
        if (response.grade !== primaryGrade) throw new Error('返回的词库年级不正确，请稍后重试。');
        const ids = source === 'favorites' ? progress.starred : source === 'wrong' ? Object.values(progress.wrongbook).map(item=>item.word.id) : undefined;
        words = primaryRunnerPool(response.items,primaryGrade,ids);
        scope = `小学 ${primaryGrade} 年级词汇${source === 'favorites' ? ' · 我的收藏' : source === 'wrong' ? ' · 我的听写错词' : ''}`;
        if (!words.length) throw new Error('当前年级和所选范围暂无词语，请先收藏或听写，或改选本年级词库。');
      } else if (kind === 'word' || kind === 'mix') {
        if (source === 'wrong') {words = Object.values(progress.wrongbook).map(item => item.word); scope = '我的听写错词';}
        else {const ids = source === 'favorites' ? progress.starred : undefined; if (source === 'favorites' && !ids?.length) throw new Error('收藏夹暂无单词，请先收藏词语。');
          if (source === 'book' && !book) throw new Error('请先选择教材册次。');
          words = (await api.words({band: 'all', source: 'all', sample: 50, limit: 200, ...(ids ? {ids} : {}), ...(source === 'book' ? {book, ...(unit ? {unit} : {})} : {})})).items;
          const selectedBook = catalog?.books.find(item => item.id === book);
          scope = source === 'favorites' ? '我的收藏词' : source === 'book' ? `${selectedBook?.title || '所选教材'} · ${unit ? selectedBook?.units.find(item => item.id === unit)?.title || unit : '全册'}` : '完整词库随机抽取的可用词';
        }
        if (!buildGameQuestions(words, bank, {kind: 'word', length, seed: Date.now()}).length) throw new Error('所选范围中没有足够可区分的词语；请扩大范围或切换句子模式。');
      }
      const questions = buildGameQuestions(words, primaryGrade ? [] : bank, {kind: primaryGrade ? 'word' : kind, length, difficulty, seed: newRequestId()});
      if (!questions.length) throw new Error('当前设置没有可用题目，请更换题型或难度。');
      if (!active.current) return;
      if (questions.length < length) setNote(`当前范围仅有 ${questions.length} 道可用题，本局按实际题数进行，未混入其他来源的词语。`);
      if (!primaryGrade && kind === 'mix') scope += '；句子/短语来自通用高中题库，不按教材单元编排';
      locked.current = false; update({id: newRequestId(), questions, state: createGameState(questions.length), answers: [], index: 0, feedback: null, phase: 'play', remaining: 12, timed, paused: false, scope, ...(primaryGrade ? {primaryGrade} : {})});
    } catch (e) {if (active.current) setError(e instanceof Error ? e.message : errorText(e));} finally {if (active.current) setBusy(false);}
  };
  const next = () => {const r = current.current; if (!r?.feedback || r.phase !== 'play') return; locked.current = false; if (r.state.finished) {update({...r, phase: 'result'}); const highest = Math.max(best, r.state.peakCrowd); setBest(highest); try {const raw = localStorage.getItem(historyKey); const parsed: unknown = raw && raw.length < 40000 ? JSON.parse(raw) : []; const history = Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string' && item.id !== r.id).slice(-29) : []; localStorage.setItem(historyKey, JSON.stringify([...history, {id: r.id, at: new Date().toISOString(), ...gameResult(r.state)}])); localStorage.setItem(bestKey, String(highest));} catch {setNote('本局总结未能写入本地历史；当前结果仍可查看。');} return;} update({...r, index: r.index + 1, feedback: null, remaining: 12});};
  const replayWrong = () => {if (!run) return; const questions = replayQuestions(run.answers); if (!questions.length) return; locked.current = false; setSaved(false); update({id: newRequestId(), questions, state: createGameState(questions.length), answers: [], index: 0, feedback: null, phase: 'play', remaining: 12, paused: false, timed: false, scope: '上一局答错/未答题重练；选项已重新排列，左右正确门数量均衡', ...(primaryGrade ? {primaryGrade} : {})});};
  const question = run?.questions[run.index], result = run ? gameResult(run.state) : null;
  return <section className="english-game">
    <header className="game-heading"><div><p>LEXIGO · SKY RUN</p><h1>让知识，带队向前</h1><span>选对英语之门，壮大你的学习小队。{best > 0 ? ` 本机最高队伍 ${best} 人。` : ''}</span></div><span className="game-free">无需 AI · 不消耗额度</span></header>
    {(!storageAvailable || note) && <p className="game-note" role="status">{note || '浏览器存储不可用，学习记录可能无法保留。'}</p>}
    {!run && <><div className="game-preview"><GameScene crowd={28} lane={null} feedback={null} /><div><span>WORD RUNNER</span><strong>一次选择，一步进步。</strong><p>{primaryGrade ? `小学 ${primaryGrade} 年级 · 词义练习` : '词义 · 语境 · 搭配'}<br />让英语复习多一点动感。</p></div></div>
      <div className="game-setup"><div className="game-kind-grid">{(primaryGrade ? ['word'] as const : Object.keys(labels) as GameConfig['kind'][]).map(item => <button type="button" key={item} className={kind === item ? 'selected' : ''} onClick={() => setKind(item)}><span>{labels[item]}</span><small>{item === 'word' ? '中文释义 → 英语' : item === 'sentence' ? '放回句子看语境' : item === 'phrase' ? '常见搭配辨析' : '三类轮换训练'}</small></button>)}</div>
        <div className="game-fields">{(kind === 'word' || kind === 'mix') && <><label>单词来源<select value={source} onChange={e => setSource(e.target.value)}><option value="all">{primaryGrade ? `小学 ${primaryGrade} 年级词库` : '全部词库随机抽取'}</option>{!primaryGrade && <option value="book">人教版 2019 教材</option>}<option value="favorites">我的收藏</option><option value="wrong">我的听写错词</option></select></label>{source === 'book' && <><label>教材册次<select value={book} onChange={e => {setBook(e.target.value); setUnit('');}}><option value="">请选择</option>{catalog?.books.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>单元<select value={unit} onChange={e => setUnit(e.target.value)}><option value="">全册</option>{catalog?.books.find(item => item.id === book)?.units.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></>}</>}
          <label>本局关卡<select value={length} onChange={e => setLength(Number(e.target.value) as 10 | 15 | 20)}>{[10, 15, 20].map(n => <option key={n} value={n}>{n} 关</option>)}</select></label>{!primaryGrade && <label>句子与短语难度<select disabled={kind === 'word'} value={difficulty} onChange={e => setDifficulty(e.target.value as GameConfig['difficulty'])}><option value="all">全部难度</option><option value="foundation">基础</option><option value="standard">标准</option><option value="challenge">挑战</option></select></label>}</div>
        <label className="game-toggle"><input type="checkbox" checked={timed} onChange={e => setTimed(e.target.checked)} /><span>开启 12 秒冲刺<small>默认自由思考；离开页面自动暂停。</small></span></label>
        <p className="game-scope">{primaryGrade ? `从小学 ${primaryGrade} 年级词库中出题，可用收藏或听写错词单独练习。` : '单词取自所选词库；句子与短语为通用高中原创练习，不与教材单元逐一对应。二选一练习用于巩固，不代表已完全掌握。'}</p>
        {error && <p role="alert" className="game-error">{error}</p>}<button type="button" className="game-primary" disabled={busy} onClick={begin}><Play size={18} />{busy ? '正在准备关卡…' : '召集小队，出发'}</button>
      </div></>}
    {run && question && <><div className="game-scorebar"><span><Users size={17} /><strong>{run.state.crowd}</strong> 队员</span><span><Zap size={17} /><strong>{run.state.combo}</strong> 连对</span><span>{run.state.answered} / {run.questions.length} 关</span>{run.phase === 'play' && <button type="button" onClick={() => update({...run, paused: !run.paused})}>{run.paused ? <Play size={17} /> : <Pause size={17} />}{run.paused ? '继续' : '暂停'}</button>}<button type="button" onClick={() => {if (run.phase === 'result') update(null); else {setConfirm(true); update({...run, paused: true});}}}>结束本局</button></div>
      <div className="game-arena"><GameScene crowd={run.state.crowd} lane={run.feedback?.selectedIndex ?? null} feedback={run.feedback ? run.feedback.correct ? 'good' : 'bad' : null} paused={run.paused} finished={run.phase === 'result'} />{run.paused && run.phase === 'play' && <div className="game-paused"><Pause size={26} /><strong>已暂停 · 思考时间保留</strong><button type="button" onClick={() => update({...run, paused: false})}>继续前进</button></div>}</div>
      {run.phase === 'play' ? <div className="game-play"><div className="game-round"><span>{labels[question.kind]} · 第 {run.index + 1} 关</span><span>{run.timed ? `剩余 ${Math.ceil(run.remaining)} 秒` : '自由思考 · 不限时'}</span></div>{run.timed && <progress max={12} value={run.remaining} aria-label="本关剩余时间" />}
        <h2>{question.prompt}</h2><div className="game-gates">{question.options.map((option, i) => <button type="button" key={i} disabled={Boolean(run.feedback) || run.paused || confirm} className={run.feedback ? i === question.answerIndex ? 'correct' : i === run.feedback.selectedIndex ? 'incorrect' : '' : ''} onClick={() => answer(i as GameChoice)}><span>{i ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}{i ? 'B · 右门' : 'A · 左门'}</span><strong>{option}</strong></button>)}</div>
        {run.feedback && <div className={`game-feedback ${run.feedback.correct ? 'good' : 'bad'}`} role="status"><strong>{run.feedback.correct ? `选对了！队伍 +${run.feedback.crowdDelta}` : run.feedback.selectedIndex === null ? '时间到了，本关未作答' : '这一次走错了，看看依据'}</strong><p>{question.explanation}</p><small>{question.knowledge} · 错题自动进入专属错题集</small><div><button type="button" disabled={!speech.hasEnglish} onClick={() => speech.speak(question.options[question.answerIndex], {rate: .9})}><Volume2 size={17} />听正确表达</button><button type="button" className="game-primary" onClick={next}>{run.state.finished ? '查看本局总结' : '前往下一关'}<ArrowRight size={17} /></button></div></div>}
        <p className="game-help">电脑可按 ← / A 或 → / D；手机直接轻触选项。答对 +5，每连续答对 3 题额外 +2；答错 -4，队员归零则本局结束。</p>
      </div> : result && <div className="game-results"><Trophy size={34} /><h2>{result.completed ? '这一程，知识已收获' : '小队暂时休息，复习后再出发'}</h2><p>已答 {result.answered} / {result.total} 关 · 正确 {result.correct} 题 · 已答正确率 {Math.round(result.accuracy * 100)}%</p><div className="game-result-stats"><span><strong>{result.finalCrowd}</strong>最终队员</span><span><strong>{result.bestCombo}</strong>最高连对</span><span><strong>{result.peakCrowd}</strong>队伍峰值</span></div><div className="game-kind-results">{(['word', 'sentence', 'phrase'] as const).map(item => {const rows = run.answers.filter(a => a.question.kind === item); return rows.length ? <span key={item}>{labels[item]} {rows.filter(a => a.correct).length}/{rows.length}</span> : null;})}</div>
        <div className="game-result-actions"><button type="button" className="game-primary" disabled={!run.answers.some(item => !item.correct)} onClick={replayWrong}><RotateCcw size={17} />只重练错题</button><button type="button" onClick={() => update(null)}>重新选择新关卡</button><button type="button" disabled={saved || run.reviewSaved || !run.answers.some(a => a.correct && a.question.word)} onClick={() => {run.answers.filter(a => a.correct && a.question.word).forEach(a => reviewWord(a.question.word!, true)); setSaved(true); update({...run, reviewSaved: true});}}>{saved || run.reviewSaved ? '已加入复习计划' : '将答对单词加入复习计划'}</button></div>
        <div className="game-wrong-list">{run.answers.filter(a => !a.correct).map((item, i) => <article key={i}><span>{labels[item.question.kind]}</span><h3>{item.question.prompt}</h3><p>你的选择：{item.selectedAnswer} → 正确表达：<strong>{item.correctAnswer}</strong></p><p>{item.question.explanation}</p></article>)}</div><p className="game-scope">闯关答对不会自动清除旧错题，请到错题挑战验证掌握。</p></div>}
      <p className="game-scope">本局来源：{run.scope}。进度仅保存在当前浏览器。</p></>}
    {confirm && <dialog ref={dialog} className="game-confirm" aria-label="结束本局确认" onCancel={() => {setConfirm(false); if (run) update({...run, paused: false});}}><strong>要结束这一局吗？</strong><p>本局尚未完成，已答错题已保留；退出会清除本局续玩进度。</p><div><button type="button" autoFocus onClick={() => {setConfirm(false); if (run) update({...run, paused: false});}}>继续本局</button><button type="button" className="game-primary" onClick={() => {setConfirm(false); update(null);}}>确认结束</button></div></dialog>}
  </section>;
}
