'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,BookX,FilePenLine,Gamepad2,HardDrive,Headphones,PencilLine,RotateCw,Sun} from 'lucide-react';
import './primary.css';
import type {PrimaryGrade,PrimaryWord,PrimaryWordsResponse} from '@/lib/primary-types';
import {getPrimaryGrade} from '@/lib/learning-stage';
import {useSpeech} from '../learn/use-speech';
import {useProgress} from '../learn/progress';
import {getJson,errorText,isAbort} from '../learn/api';
import {PrimaryWords} from './primary-words';
import {PrimaryDictation} from './primary-dictation';
import {PrimaryPractice} from './primary-practice';
import {PrimaryRecords} from './primary-records';
import {CorrectionView} from '../learn/correction-view';
import GameHub from '../learn/game-hub';
import {MistakesView} from '../learn/mistakes-view';
import {getSkillFocus} from '@/lib/primary-skills';

type Tab='today'|'words'|'dictation'|'practice'|'mistakes'|'games'|'correction'|'records';
const GRADES:PrimaryGrade[]=[3,4,5,6];
const GRADE_LABEL:Record<PrimaryGrade,string>={3:'三年级',4:'四年级',5:'五年级',6:'六年级'};
const GRADE_KEY='lexigo.primary.grade.v1';
const HASH:Record<Tab,string>={today:'today',words:'vocab',dictation:'dictation',practice:'practice',mistakes:'mistakes',games:'game',correction:'writing',records:'records'};
const NAV:{id:Tab;label:string;Icon:typeof Sun}[]=[
  {id:'today',label:'今天',Icon:Sun},{id:'words',label:'单词',Icon:BookOpen},{id:'dictation',label:'听写',Icon:Headphones},
  {id:'practice',label:'小练习',Icon:PencilLine},{id:'mistakes',label:'错题本',Icon:BookX},{id:'games',label:'游戏',Icon:Gamepad2},{id:'correction',label:'写作与批改',Icon:FilePenLine},{id:'records',label:'记录备份',Icon:HardDrive}];
const LAUNCH:{id:Tab;title:string;desc:string;Icon:typeof Sun}[]=[
  {id:'words',title:'认识新单词',desc:'听发音，读例句',Icon:BookOpen},{id:'dictation',title:'听一听，写一写',desc:'听读音，拼出单词',Icon:Headphones},
  {id:'practice',title:'读短文，练句子',desc:'小短文和句子练习',Icon:PencilLine},{id:'games',title:'去英语游乐场',desc:'用小游戏复习单词',Icon:Gamepad2}];

function parseHash(h:string):Tab{
  const v=h.replace(/^#/,'');
  if(v==='vocab'||v==='words')return 'words';
  if(v==='game'||v.startsWith('game-'))return 'games';
  if(v==='writing'||v==='essay'||v==='questions')return 'correction';
  return (['today','dictation','practice','mistakes','records'] as string[]).includes(v)?v as Tab:'today';
}
function toIds(v:unknown):string[]{
  if(Array.isArray(v))return v.map(x=>typeof x==='string'?x:(x as {id?:string}|null)?.id??'').filter(Boolean);
  return v&&typeof v==='object'?Object.keys(v):[];
}

export function PrimaryApp(){
  const speech=useSpeech();
  const {progress,isLearned,hydrated}=useProgress();
  const [grade]=useState<PrimaryGrade>(()=>getPrimaryGrade());
  const [correctionKind,setCorrectionKind]=useState<'essay'|'questions'>(()=>typeof window!=='undefined'&&window.location.hash==='#questions'?'questions':'essay');
  const [ready,setReady]=useState(false);
  const [tab,setTab]=useState<Tab>('today');
  const [focusType,setFocusType]=useState<'reading'|'grammar'>();
  const [data,setData]=useState<PrimaryWordsResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  const [saveNote,setSaveNote]=useState('');
  const speechRef=useRef(speech);
  useEffect(()=>{speechRef.current=speech;});

  useEffect(()=>{
    try{localStorage.setItem(GRADE_KEY,String(grade));}
    catch{setSaveNote('年级偏好未能保存；当前网址仍会保留所选年级。');}
    setTab(parseHash(window.location.hash));
    setReady(true);
    const onHash=()=>setTab(parseHash(window.location.hash));
    window.addEventListener('hashchange',onHash);
    return()=>{window.removeEventListener('hashchange',onHash);speechRef.current.stop();};
  },[]);

  useEffect(()=>{
    if(!ready)return;
    const c=new AbortController();
    setData(null);setError('');setLoading(true);
    getJson<PrimaryWordsResponse>(`/api/primary/words?grade=${grade}`,c.signal)
      .then(r=>{if(!c.signal.aborted)setData({...r,items:(r.items??[]).filter(w=>w.grade===grade)});})
      .catch(e=>{if(!isAbort(e)&&!c.signal.aborted)setError(errorText(e));})
      .finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return()=>c.abort();
  },[grade,ready,reload]);

  const items=useMemo<PrimaryWord[]>(()=>data?.items??[],[data]);
  const stats=useMemo(()=>{
    const wrong=new Set(toIds(progress?.wrongbook));
    return {total:items.length,learned:items.filter(w=>isLearned(w.id)).length,review:items.filter(w=>wrong.has(w.id)).length};
  },[items,progress,isLearned]);

  const go=useCallback((t:Tab)=>{
    setFocusType(undefined);
    speechRef.current.stop();
    window.scrollTo({top:0});
    history.replaceState(null,'',`#${HASH[t]}`);
    if(t==='games')window.dispatchEvent(new HashChangeEvent('hashchange'));
    setTab(t);
  },[]);
  const pickGrade=useCallback((g:PrimaryGrade)=>{
    if(g===grade)return;
    speechRef.current.stop();
    try{localStorage.setItem(GRADE_KEY,String(g));setSaveNote('');}
    catch{setSaveNote('年级偏好未能保存；切换后的网址会保留选择。');}
    const url=new URL(window.location.href);url.searchParams.set('stage','primary');url.searchParams.set('grade',String(g));url.hash='today';
    window.location.assign(url.href);
  },[grade]);
  const retry=useCallback(()=>setReload(n=>n+1),[]);
  const onMistakeNav=useCallback((t:string)=>go(t==='dictation'?'dictation':t==='vocab'?'words':'practice'),[go]);
  const reviewType=(['reading','grammar'] as const).find(type=>getSkillFocus(progress.mistakes,type).length>0);
  const wordProps={grade,words:items,speech,loading,error,onRetry:retry};
  const num=(n:number)=>hydrated?n:'…';

  const today=(
    <>
      <section className='primary-hero'>
        <h2>{GRADE_LABEL[grade]}，今天也来练一练</h2>
        <p>每次花几分钟，听一听、读一读、写一写。</p>
      </section>
      {loading&&<p className='primary-note'>正在加载{GRADE_LABEL[grade]}单词…</p>}
      {error&&<div className='primary-error' role='alert'><p>单词暂时没有加载出来：{error}</p>
        <button type='button' className='primary-button' onClick={retry}><RotateCw size={16} aria-hidden/>再试一次</button></div>}
      {data&&<ul className='primary-stats'>
        <li><strong>{stats.total}</strong>当前收录词汇</li>
        <li><strong>{num(stats.learned)}</strong>我记住的单词</li>
        <li><strong>{num(stats.review)}</strong>待复习错词</li>
      </ul>}
      <div className='primary-launch-grid'>
        {LAUNCH.map(({id,title,desc,Icon})=>(
          <button key={id} type='button' className='primary-launch-card' onClick={()=>go(id)}>
            <Icon size={24} aria-hidden/><strong>{title}</strong><span>{desc}</span>
          </button>))}
      </div>
      <section className='primary-howto'>
        <h3>推荐顺序</h3>
        <ol>
          <li>先听后读：在「单词」里听发音、读例句</li>
          <li>听写：把听到的单词写出来</li>
          <li>短练习：读一篇小短文，完成几道题</li>
        </ol>
      </section>
      {data?.note&&<p className='primary-note'>{data.note}</p>}
      <p className='primary-note'>本机学习记录：保存在当前浏览器中，不会自动同步到其他设备。</p>
    </>
  );

  return (
    <div className='primary-app'>
      <header className='primary-header'>
        <span className='primary-badge'>小学通用版</span>
        <h1>每天一点，英语更近一点</h1>
        <p className='primary-note'>按年级选择单词、听写和小练习，一点点积累英语本领。</p>
        <div className='primary-grade-picker' role='group' aria-label='选择年级'>
          {GRADES.map(g=>(
            <button key={g} type='button' aria-pressed={grade===g} className={grade===g?'primary-button primary-button-primary':'primary-button'} onClick={()=>pickGrade(g)}>{GRADE_LABEL[g]}</button>))}
        </div>
        {saveNote&&<p className='primary-error' role='status'>{saveNote}</p>}
      </header>
      <nav className='primary-nav' aria-label='小学学习导航'>
        {NAV.map(({id,label,Icon})=>(
          <button key={id} type='button' aria-current={tab===id?'page':undefined} className={tab===id?'primary-button primary-button-primary':'primary-button'} onClick={()=>go(id)}>
            <Icon size={18} aria-hidden/>{label}
          </button>))}
      </nav>
      <main key={grade} className='primary-route'>
        {tab==='today'&&today}
        {tab==='words'&&<PrimaryWords {...wordProps}/>}
        {tab==='dictation'&&<PrimaryDictation {...wordProps}/>}
        {tab==='practice'&&<PrimaryPractice grade={grade} initialFocusType={focusType}/>}
        {tab==='mistakes'&&<MistakesView onNavigate={onMistakeNav} primary onTargetPractice={reviewType?()=>{go('practice');setFocusType(reviewType);}:undefined}/>}
        {tab==='games'&&<GameHub speech={speech} primaryGrade={grade}/>}
        {tab==='correction'&&<><div className='primary-tabs' role='group' aria-label='写作与批改方式'><button type='button' className='primary-button' aria-pressed={correctionKind==='essay'} onClick={()=>setCorrectionKind('essay')}>写作小老师</button><button type='button' className='primary-button' aria-pressed={correctionKind==='questions'} onClick={()=>setCorrectionKind('questions')}>题目批改</button></div><CorrectionView key={correctionKind} kind={correctionKind} primaryGrade={grade}/></>}
        {tab==='records'&&<PrimaryRecords grade={grade}/>}
      </main>
    </div>
  );
}

export default PrimaryApp;
