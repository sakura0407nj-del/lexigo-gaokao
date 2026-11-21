'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Check,Download,RotateCcw,SkipForward,Turtle,Volume2} from 'lucide-react';
import type {PrimaryGrade,PrimaryWord} from '@/lib/primary-types';
import type {SpeechState} from '../learn/use-speech';
import {captureWrongbookSnapshot,useProgress,type DictationAttempt,type WrongbookSnapshot} from '../learn/progress';
import {normalizeAnswer} from '@/lib/learning-core';
import {downloadText} from '../learn/ui';

type Result={word:PrimaryWord;answer:string;correct:boolean;skipped:boolean};
type Cfg={rate:number;repeat:number;hint:boolean};
interface Run extends Cfg{v:1;id:string;grade:PrimaryGrade;items:PrimaryWord[];index:number;results:Result[];input:string;startedAt:number;savedAt:number;recorded:boolean;source?:'wrongbook';wrongbookSnapshot?:WrongbookSnapshot}
const TTL=14*864e5;
const keyOf=(g:PrimaryGrade)=>`lexigo.primary.dictation.${g}.v1`;
const isStr=(x:unknown):x is string=>typeof x==='string';
const fin=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
function okWord(w:unknown,g:PrimaryGrade):w is PrimaryWord{
  const o=w as Record<string,unknown>|null;
  if(!o||typeof o!=='object'||Array.isArray(o)||o.grade!==g)return false;
  for(const [name,max] of Object.entries({id:160,word:150,phonetic:250,translation:1200,topic:150,example:1500,exampleZh:1500})){const value=o[name];if(!isStr(value)||value.length>max)return false;}
  return !!o.id&&!!o.word&&['high','medium','low'].includes(String(o.frequency))&&fin(o.rank)&&(o.rank as number)>=0&&(o.accepted===undefined||(Array.isArray(o.accepted)&&o.accepted.length<=20&&o.accepted.every(v=>isStr(v)&&v.length<=150)))&&(o.pos===undefined||(Array.isArray(o.pos)&&o.pos.length<=20&&o.pos.every(v=>isStr(v)&&v.length<=100)));
}
export function parsePrimaryDictationDraft(raw:string|null,g:PrimaryGrade,now=Date.now()):Run|null{
  if(!raw||raw.length>250000)return null;
  let r:Run;
  try{r=JSON.parse(raw)}catch{return null}
  if(!r||typeof r!=='object'||r.v!==1||r.grade!==g||!isStr(r.id)||!r.id||r.id.length>160||!Array.isArray(r.items)||r.items.length<1||r.items.length>20||!r.items.every(w=>okWord(w,g))||new Set(r.items.map(w=>w.id)).size!==r.items.length)return null;
  if(!Array.isArray(r.results)||r.results.length>r.items.length||!r.results.every((x,i)=>!!x&&okWord(x.word,g)&&x.word.id===r.items[i].id&&x.word.word===r.items[i].word&&isStr(x.answer)&&x.answer.length<=200&&typeof x.correct==='boolean'&&typeof x.skipped==='boolean'&&(!x.skipped||(!x.correct&&!x.answer))))return null;
  if(!Number.isInteger(r.index)||r.index<0||r.index>r.items.length||(r.results.length!==r.index&&r.results.length!==r.index+1))return null;
  if(!isStr(r.input)||r.input.length>200||![.7,.85,1].includes(r.rate)||![1,2].includes(r.repeat)||typeof r.hint!=='boolean'||typeof r.recorded!=='boolean')return null;
  if(!fin(r.startedAt)||!fin(r.savedAt)||r.startedAt<0||r.savedAt<r.startedAt||r.savedAt>now+300000||now-r.savedAt>TTL||r.recorded&&r.index!==r.items.length)return null;
  if(r.source!==undefined&&r.source!=='wrongbook')return null;
  if(r.wrongbookSnapshot!==undefined){
    const entries=r.wrongbookSnapshot;
    if(r.source!=='wrongbook'||!entries||typeof entries!=='object'||Array.isArray(entries)||Object.keys(entries).length>r.items.length)return null;
    for(const [id,entry] of Object.entries(entries)){
      if(!r.items.some(w=>w.id===id)||!entry||typeof entry!=='object'||Array.isArray(entry)||!Number.isSafeInteger(entry.misses)||entry.misses<1||!isStr(entry.lastWrong)||!Number.isFinite(Date.parse(entry.lastWrong))||Date.parse(entry.lastWrong)>r.startedAt||(entry.revision!==undefined&&(!isStr(entry.revision)||!entry.revision||entry.revision.length>200)))return null;
    }
  }
  // Cached correctness is derived data, not a source of truth after a reload.
  return {...r,results:r.results.map((x,i)=>{const word=r.items[i];return {...x,word,correct:!x.skipped&&!!x.answer.trim()&&[word.word,...(word.accepted??[])].some(a=>normalizeAnswer(a)===normalizeAnswer(x.answer))};})};
}
function attemptOf(r:Run):Omit<DictationAttempt,'at'>{
  return {attemptId:r.id,band:'primary-grade-'+r.grade,total:r.results.length,correct:r.results.filter(x=>x.correct).length,scope:r.grade+'年级'+(r.source==='wrongbook'?'错词听写专项':'通用听写'),planned:r.items.length,...(r.source==='wrongbook'?{source:'wrongbook' as const}:{})};
}
function shuffle<T>(a:T[]):T[]{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function wrongIdSet(wb:unknown):Set<string>{
  const s=new Set<string>();
  const add=(x:unknown)=>{if(isStr(x))s.add(x);else if(x&&typeof x==='object'){const o=x as {id?:unknown;wordId?:unknown};if(isStr(o.wordId))s.add(o.wordId);else if(isStr(o.id))s.add(o.id)}};
  if(Array.isArray(wb))wb.forEach(add);else if(wb&&typeof wb==='object')Object.keys(wb).forEach(k=>s.add(k));
  return s;
}

export function PrimaryDictation({grade,words,speech,loading,error,onRetry}:{grade:PrimaryGrade;words:PrimaryWord[];speech:SpeechState;loading?:boolean;error?:string;onRetry?:()=>void}){
  const {progress,recordDictation,hydrated}=useProgress();
  const [run,setRun]=useState<Run|null>(null);
  const runRef=useRef<Run|null>(null);
  const speechRef=useRef(speech);
  const [played,setPlayed]=useState(false);
  const [msg,setMsg]=useState('');
  const [saveErr,setSaveErr]=useState('');
  const [audioError,setAudioError]=useState('');
  const [count,setCount]=useState(10);
  const [topic,setTopic]=useState('all');
  const [order,setOrder]=useState<'random'|'list'>('random');
  const [cfg,setCfg]=useState<Cfg>({rate:.85,repeat:1,hint:true});
  const [wrongOnly,setWrongOnly]=useState(false);
  useEffect(()=>{speechRef.current=speech},[speech]);
  useEffect(()=>{
    let r:Run|null=null,err='';
    try{r=parsePrimaryDictationDraft(localStorage.getItem(keyOf(grade)),grade)}catch{err='无法读取本地保存的听写进度。'}
    runRef.current=r;setRun(r);setPlayed(false);setMsg('');setSaveErr(err);
    return()=>speechRef.current.stop();
  },[grade]);
  useEffect(()=>{if(!hydrated||!run||run.index!==run.items.length||run.results.length!==run.items.length)return;recordDictation(attemptOf(run),run.results,run.wrongbookSnapshot);},[hydrated,run,recordDictation]);
  const gradeWords=useMemo(()=>words.filter(w=>w.grade===grade),[words,grade]);
  const topics=useMemo(()=>[...new Set(gradeWords.map(w=>w.topic).filter(Boolean))].sort(),[gradeWords]);
  const wrongIds=useMemo(()=>wrongIdSet((progress as {wrongbook?:unknown}|undefined)?.wrongbook),[progress]);
  const topicSel=topics.includes(topic)?topic:'all';
  const pool=gradeWords.filter(w=>(topicSel==='all'||w.topic===topicSel)&&(!wrongOnly||wrongIds.has(w.id)));
  const canSpeak=speech.supported&&speech.hasEnglish;
  const actual=Math.min(count,pool.length);

  const commit=(r:Run|null)=>{
    const next=r&&{...r,savedAt:Date.now()};
    try{if(next)localStorage.setItem(keyOf(grade),JSON.stringify(next));else localStorage.removeItem(keyOf(grade));setSaveErr('')}
    catch{setSaveErr('本地保存失败（可能是隐私模式或存储已满），刷新后本次进度会丢失。')}
    runRef.current=next;setRun(next);
  };
  const say=(w:PrimaryWord,slow=false)=>{const r=runRef.current;if(!r||!canSpeak)return;setAudioError('');speech.prime();const ok=speech.speak(w.word,{rate:slow ? .65 : r.rate,repeat:slow?1:r.repeat,onError:()=>setAudioError('这次朗读没有成功，请再点一次“听一遍”，并检查设备音量。')});setPlayed(ok);if(!ok)setAudioError('朗读暂时未能开始，请再次点按朗读按钮。');};
  const begin=(items:PrimaryWord[],c:Cfg,source?:'wrongbook')=>{
    if(!canSpeak||!items.length)return;
    speech.stop();speech.prime();
    const now=Date.now();
    commit({v:1,id:now.toString(36)+Math.random().toString(36).slice(2,8),grade,items,index:0,results:[],input:'',rate:c.rate,repeat:c.repeat,hint:c.hint,startedAt:now,savedAt:now,recorded:false,...(source?{source,wrongbookSnapshot:captureWrongbookSnapshot(progress.wrongbook,items.map(w=>w.id))}:{})});
    setMsg('');say(items[0]);
  };
  const start=()=>begin((order==='random'?shuffle(pool):pool).slice(0,actual),cfg,wrongOnly?'wrongbook':undefined);
  const check=(skip:boolean)=>{
    const r=runRef.current;
    if(!r||r.index>=r.items.length||r.results.length>r.index)return;
    const w=r.items[r.index];const ans=r.input.trim();
    if(!skip&&!ans){setMsg('请先输入单词，或点击“跳过”。');return}
    const n=normalizeAnswer(ans);
    const correct=!skip&&[w.word,...(w.accepted??[])].some(a=>normalizeAnswer(a)===n);
    setMsg('');commit({...r,results:[...r.results,{word:w,answer:skip?'':ans,correct,skipped:skip}]});
  };
  const finish=(r:Run)=>{
    commit({...r,index:r.items.length,input:'',recorded:true});
    recordDictation(attemptOf(r),r.results,r.wrongbookSnapshot);
  };
  const next=()=>{
    const r=runRef.current;
    if(!r||r.index>=r.items.length||r.results.length<=r.index)return;
    speech.stop();
    const i=r.index+1;
    if(i>=r.items.length){finish(r);return}
    commit({...r,index:i,input:''});setPlayed(false);setMsg('');say(r.items[i]);
  };
  const reset=()=>{
    const r=runRef.current;
    if(r&&r.index<r.items.length&&(r.results.length>0||r.input.trim())&&!window.confirm('本次听写还没完成，确定放弃并重新设置吗？'))return;
    speech.stop();setPlayed(false);setMsg('');commit(null);
  };
  const download=(r:Run)=>{
    const ok=r.results.filter(x=>x.correct).length;
    const lines=[`LexiGo 小学${grade}年级通用听写`,`得分：${ok}/${r.results.length}`,'',...r.results.map((x,i)=>`${i+1}. ${x.word.word}  ${x.word.translation}  你的答案：${x.skipped?'（跳过）':x.answer}  ${x.correct?'正确':'错误'}`)];
    downloadText(`primary-dictation-grade${grade}.txt`,lines.join('\n'));
  };

  if(loading&&!run)return <section className='primary-dictation primary-panel'><p className='primary-note' role='status'>正在加载{grade}年级词汇…</p></section>;
  if(error&&!run)return <section className='primary-dictation primary-panel'><p className='primary-error' role='alert'>{error}</p>{onRetry&&<button className='primary-button' onClick={onRetry}><RotateCcw size={18}/>重试</button>}</section>;
  const errs=<>{saveErr&&<p className='primary-error' role='alert'>{saveErr}</p>}{audioError&&<p className='primary-error' role='alert'>{audioError}</p>}</>;
  const noVoice=<p className='primary-error'>当前浏览器没有可用的英语语音，无法听写。请换用 Chrome、Edge 或 Safari，或在系统设置中安装英语语音。</p>;

  if(!run)return <section className='primary-dictation primary-panel'>
    <h2>{grade}年级单词听写</h2>
    <p className='primary-note'>小学{grade}年级通用练习词汇，不与教材同步，也不代表完整课程。</p>{errs}
    <div className='primary-form-grid'>
      <label>数量<select className='primary-select' value={count} onChange={e=>setCount(Number(e.target.value))}>{[5,10,20].map(n=><option key={n} value={n}>{n} 个</option>)}</select></label>
      <label>主题<select className='primary-select' value={topicSel} onChange={e=>setTopic(e.target.value)}><option value='all'>全部主题</option>{topics.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
      <label>顺序<select className='primary-select' value={order} onChange={e=>setOrder(e.target.value==='list'?'list':'random')}><option value='random'>随机</option><option value='list'>按列表</option></select></label>
      <label>语速<select className='primary-select' value={cfg.rate} onChange={e=>setCfg({...cfg,rate:Number(e.target.value)})}>{[.7,.85,1].map(n=><option key={n} value={n}>{n}x</option>)}</select></label>
      <label>每次读<select className='primary-select' value={cfg.repeat} onChange={e=>setCfg({...cfg,repeat:Number(e.target.value)})}>{[1,2].map(n=><option key={n} value={n}>{n} 遍</option>)}</select></label>
      <label className='primary-check'><input type='checkbox' checked={cfg.hint} onChange={e=>setCfg({...cfg,hint:e.target.checked})}/>显示中文提示</label>
      <label className='primary-check'><input type='checkbox' checked={wrongOnly} onChange={e=>setWrongOnly(e.target.checked)}/>只练错词本里的词</label>
    </div>
    {wrongOnly&&<p className='primary-note'>错词专项完成后，答对的词会移出错词本；开始专项后又写错的词会继续保留。普通听写不会自动清除错词。</p>}
    {!canSpeak&&noVoice}
    {pool.length?<p className='primary-note'>可用 {pool.length} 个，本次实际听写 {actual} 个。</p>:<p className='primary-empty'>{wrongOnly?'错词本里还没有本年级的词。':'当前条件下没有可用单词。'}</p>}
    <div className='primary-actions'><button className='primary-button primary-button-primary' disabled={!canSpeak||!pool.length} onClick={start}><Volume2 size={18}/>开始听写</button></div>
  </section>;

  const ok=run.results.filter(x=>x.correct).length;
  if(run.index>=run.items.length){
    const wrong=run.results.filter(x=>!x.correct).map(x=>x.word);
    return <section className='primary-dictation primary-panel'>
      <h2>听写完成</h2>{errs}
      <p className='primary-dictation-progress'>本次答对 {ok}/{run.results.length} 个单词</p>
      {run.source==='wrongbook'&&run.wrongbookSnapshot&&<p className='primary-note'>本次专项只清理答对且未再次写错的词；答错、跳过或后来新增的错误会保留。</p>}
      <ol className='primary-results'>{run.results.map((x,i)=><li key={i}>{x.correct?'✓':'✗'} <b>{x.word.word}</b> {x.word.translation} · 你的答案：{x.skipped?'（跳过）':x.answer}</li>)}</ol>
      {!canSpeak&&wrong.length>0&&noVoice}
      <div className='primary-actions'>
        {wrong.length>0&&<button className='primary-button primary-button-primary' disabled={!canSpeak} onClick={()=>begin(shuffle(wrong),{rate:run.rate,repeat:run.repeat,hint:run.hint},'wrongbook')}><RotateCcw size={18}/>只练错词（{wrong.length}）</button>}
        <button className='primary-button' onClick={()=>download(run)}><Download size={18}/>下载结果</button>
        <button className='primary-button' onClick={reset}>重新设置</button>
      </div>
    </section>;
  }
  const w=run.items[run.index];const res=run.results[run.index];
  return <section className='primary-dictation primary-panel'>
    <p className='primary-dictation-progress'>第 {run.index+1}/{run.items.length} 题 · 已答对 {ok}</p>{errs}
    {!canSpeak&&noVoice}
    {!played&&!res&&<p className='primary-note'>点击听一遍开始</p>}
    <div className='primary-actions'>
      <button className='primary-audio-button' disabled={!canSpeak} onClick={()=>say(w)}><Volume2 size={20}/>听一遍</button>
      <button className='primary-audio-button' disabled={!canSpeak} onClick={()=>say(w,true)}><Turtle size={20}/>慢速</button>
    </div>
    {run.hint&&<p className='primary-note'>中文提示：{w.translation}</p>}
    {!res?<div className='primary-answer-box'>
      <input className='primary-input' style={{fontSize:16}} value={run.input} maxLength={200} autoComplete='off' autoCapitalize='none' autoCorrect='off' spellCheck={false} aria-label='输入听到的英文单词' onChange={e=>{const r=runRef.current;if(r){setMsg('');commit({...r,input:e.target.value.slice(0,200)})}}} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();check(false)}}}/>
      {msg&&<p className='primary-error' role='alert'>{msg}</p>}
      <div className='primary-actions'>
        <button className='primary-button primary-button-primary' onClick={()=>check(false)}><Check size={18}/>检查</button>
        <button className='primary-button' onClick={()=>check(true)}><SkipForward size={18}/>跳过</button>
      </div>
    </div>:<div className='primary-feedback' role='status'>
      <p><b>{res.correct?'✓ 正确':res.skipped?'已跳过':'✗ 不对'}</b></p>
      <p>你的答案：{res.skipped?'（跳过）':res.answer}</p>
      <p>正确拼写：<b>{w.word}</b> {w.phonetic} {w.translation}</p>
      {w.example&&<p>{w.example}</p>}
      {w.exampleZh&&<p>{w.exampleZh}</p>}
      <div className='primary-actions'>
        <button className='primary-audio-button' disabled={!canSpeak} onClick={()=>say(w)}><Volume2 size={18}/>再听正确读音</button>
        <button className='primary-button primary-button-primary' onClick={next}>{run.index+1>=run.items.length?'完成并查看结果':'下一个'}<ArrowRight size={18}/></button>
      </div>
    </div>}
    <div className='primary-actions'><button className='primary-button' onClick={reset}>重新设置</button></div>
  </section>;
}
