'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,BookOpen,BookX,ChevronDown,FilePenLine,Gamepad2,HardDrive,Headphones,PencilLine,RotateCw,Sparkles,Sun} from 'lucide-react';
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
import PrimaryStudio,{StudyWeek} from './primary-studio';

type Tab='today'|'words'|'dictation'|'practice'|'mistakes'|'games'|'correction'|'records'|'studio';
const GRADES:PrimaryGrade[]=[3,4,5,6];
const GRADE_LABEL:Record<PrimaryGrade,string>={3:'三年级',4:'四年级',5:'五年级',6:'六年级'};
const GRADE_KEY='lexigo.primary.grade.v1';
const HASH:Record<Tab,string>={today:'today',words:'vocab',dictation:'dictation',practice:'practice',mistakes:'mistakes',games:'game',correction:'writing',records:'records',studio:'studio'};
const NAV:{id:Tab;label:string;Icon:typeof Sun}[]=[
  {id:'today',label:'今天',Icon:Sun},{id:'words',label:'单词',Icon:BookOpen},{id:'dictation',label:'听写',Icon:Headphones},
  {id:'practice',label:'小练习',Icon:PencilLine},{id:'studio',label:'练习室',Icon:Sparkles},{id:'mistakes',label:'错题本',Icon:BookX},{id:'games',label:'游戏',Icon:Gamepad2},{id:'correction',label:'写作与批改',Icon:FilePenLine},{id:'records',label:'记录备份',Icon:HardDrive}];
const MAIN_IDS:Tab[]=['today','words','dictation','practice'];
const NAV_MAIN=NAV.filter(n=>MAIN_IDS.indexOf(n.id)>=0);
const NAV_MORE=NAV.filter(n=>MAIN_IDS.indexOf(n.id)<0);
const MORE:{id:Tab;title:string;desc:string;Icon:typeof Sun}[]=[
  {id:'studio',title:'英语练习室',desc:'听音、配对和分级故事',Icon:Sparkles},
  {id:'mistakes',title:'错题本',desc:'把做错的再练一遍',Icon:BookX},
  {id:'games',title:'英语游戏',desc:'用小游戏复习单词',Icon:Gamepad2},
  {id:'correction',title:'写作与批改',desc:'写一段话或批改题目',Icon:FilePenLine}];
const PATH:{id:Tab;title:string;desc:string}[]=[
  {id:'words',title:'学单词',desc:'选好学习范围，听发音、读例句'},
  {id:'dictation',title:'听写',desc:'听音拼词，或看中文拼词'},
  {id:'practice',title:'小练习',desc:'读一篇短文，做几道题'},
  {id:'mistakes',title:'错题本',desc:'回头看看做错的地方'}];

function parseHash(h:string):Tab{
  const v=h.replace(/^#/,'');
  if(v==='vocab'||v==='words')return 'words';
  if(v==='game'||v.startsWith('game-'))return 'games';
  if(v==='writing'||v==='essay'||v==='questions')return 'correction';
  return (['today','dictation','practice','mistakes','records','studio'] as string[]).includes(v)?v as Tab:'today';
}
function toIds(v:unknown):string[]{
  if(Array.isArray(v))return v.map(x=>typeof x==='string'?x:(x as {id?:string}|null)?.id??'').filter(Boolean);
  return v&&typeof v==='object'?Object.keys(v):[];
}

function BrandMark(){
  return (
    <svg className='primary-brand-mark' viewBox='0 0 40 40' width='40' height='40' aria-hidden='true' focusable='false'>
      <rect x='1' y='1' width='38' height='38' rx='11' fill='#2f5d46'/>
      <path d='M9 13c4-1.6 7.6-1.2 11 1.2V30c-3.4-2.2-7-2.6-11-1.2z' fill='#fbf6e8'/>
      <path d='M31 13c-4-1.6-7.6-1.2-11 1.2V30c3.4-2.2 7-2.6 11-1.2z' fill='#f4e58c'/>
      <circle cx='29' cy='9.5' r='3' fill='#f4e58c'/>
    </svg>
  );
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
  const [navTick,setNavTick]=useState(0);
  const [moreOpen,setMoreOpen]=useState(false);
  const speechRef=useRef(speech);
  const mainRef=useRef<HTMLElement>(null);
  const activeTab=useRef<Tab>('today');
  const wordScroll=useRef(0);
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

  useEffect(()=>{
    if(navTick===0)return;
    const m=mainRef.current;
    if(m)m.focus({preventScroll:true});
    if(tab==='words')window.scrollTo({top:wordScroll.current});
  },[navTick,tab]);
  useEffect(()=>{activeTab.current=tab;},[tab]);

  const items=useMemo<PrimaryWord[]>(()=>data?.items??[],[data]);
  const stats=useMemo(()=>{
    const wrong=new Set(toIds(progress?.wrongbook));
    return {total:items.length,learned:items.filter(w=>isLearned(w.id)).length,review:items.filter(w=>wrong.has(w.id)).length};
  },[items,progress,isLearned]);

  const go=useCallback((t:Tab)=>{
    if(activeTab.current==='words')wordScroll.current=window.scrollY;
    setFocusType(undefined);
    setMoreOpen(false);
    speechRef.current.stop();
    window.scrollTo({top:0});
    history.replaceState(null,'',`#${HASH[t]}`);
    if(t==='games')window.dispatchEvent(new HashChangeEvent('hashchange'));
    setTab(t);
    setNavTick(n=>n+1);
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
  const skipToMain=useCallback(()=>{const m=mainRef.current;if(m)m.focus();},[]);
  const onMistakeNav=useCallback((t:string)=>go(t==='dictation'?'dictation':t==='vocab'?'words':'practice'),[go]);
  const reviewType=(['reading','grammar'] as const).find(type=>getSkillFocus(progress.mistakes,type).length>0);
  const wordProps={grade,words:items,speech,loading,error,onRetry:retry,books:data?.books,onOpenDictation:()=>go('dictation')};
  const num=(n:number)=>hydrated?n:'…';
  const pct=hydrated&&stats.total>0?Math.round(stats.learned/stats.total*100):0;
  const currentLabel=(NAV.find(n=>n.id===tab)||NAV[0]).label;

  const navButton=({id,label,Icon}:{id:Tab;label:string;Icon:typeof Sun})=>(
    <li key={id} className='primary-nav-item'>
      <button type='button' aria-current={tab===id?'page':undefined} className={tab===id?'primary-nav-link primary-nav-link-active':'primary-nav-link'} onClick={()=>go(id)}>
        <Icon size={18} aria-hidden/><span className='primary-nav-text'>{label}</span>
      </button>
    </li>
  );

  const today=(
    <div className='primary-today'>
      <section className='primary-hero' aria-labelledby='primary-today-title'>
        <p className='primary-eyebrow'>{GRADE_LABEL[grade]} · 今日学习桌</p>
        <h2 id='primary-today-title' className='primary-hero-title'>先学单词，再来听写</h2>
        <p className='primary-hero-text'>每次几分钟：听发音、读例句，再把单词写出来。</p>
        <div className='primary-hero-actions'>
          <button type='button' className='primary-action primary-action-main' onClick={()=>go('words')}>
            <span className='primary-action-layout'>
            <span className='primary-action-icon'><BookOpen size={26} aria-hidden/></span>
            <span className='primary-action-text'><strong>学单词</strong><span>选词书、主题或单元</span></span>
            <ArrowRight className='primary-action-arrow' size={20} aria-hidden/>
            </span>
          </button>
          <button type='button' className='primary-action primary-action-second' onClick={()=>go('dictation')}>
            <span className='primary-action-layout'>
            <span className='primary-action-icon'><Headphones size={26} aria-hidden/></span>
            <span className='primary-action-text'><strong>去听写</strong><span>听音或看中文拼词</span></span>
            <ArrowRight className='primary-action-arrow' size={20} aria-hidden/>
            </span>
          </button>
        </div>
      </section>

      <StudyWeek grade={grade} words={items} speech={speech} onOpen={()=>go('studio')}/>
      {loading&&<p className='primary-note primary-status' role='status'>正在加载{GRADE_LABEL[grade]}单词…</p>}
      {error&&<div className='primary-error' role='alert'><p>单词暂时没有加载出来：{error}</p>
        <button type='button' className='primary-button' onClick={retry}><RotateCw size={16} aria-hidden/>再试一次</button></div>}

      {data&&<section className='primary-progress' aria-labelledby='primary-progress-title'>
        <div className='primary-progress-head'>
          <h3 id='primary-progress-title' className='primary-section-title'>我的进度</h3>
          <p className='primary-progress-caption'>{stats.total===0?'这个年级暂时没有收录单词。':hydrated?`已记住 ${stats.learned} / ${stats.total} 个单词`:'正在读取本机学习记录…'}</p>
        </div>
        {stats.total>0&&<div className='primary-progress-bar' aria-hidden='true'><span className='primary-progress-fill' style={{width:`${pct}%`}}/></div>}
        <ul className='primary-stats'>
          <li className='primary-stat'><strong>{stats.total}</strong><span>当前收录词汇</span></li>
          <li className='primary-stat'><strong>{num(stats.learned)}</strong><span>我记住的单词</span></li>
          <li className='primary-stat primary-stat-review'><strong>{num(stats.review)}</strong><span>待复习错词</span></li>
        </ul>
      </section>}

      <div className='primary-today-grid'>
        <section className='primary-path' aria-labelledby='primary-path-title'>
          <h3 id='primary-path-title' className='primary-section-title'>建议顺序</h3>
          <ol className='primary-path-list'>
            {PATH.map(({id,title,desc},i)=>(
              <li key={id} className='primary-path-step'>
                <button type='button' className='primary-path-link' onClick={()=>go(id)}>
                  <span className='primary-path-layout'>
                  <span className='primary-path-num' aria-hidden='true'>{i+1}</span>
                  <span className='primary-path-text'><strong>{title}</strong><span>{desc}</span></span>
                  </span>
                </button>
              </li>))}
          </ol>
        </section>
        <section className='primary-more' aria-labelledby='primary-more-title'>
          <h3 id='primary-more-title' className='primary-section-title'>更多练习</h3>
          <div className='primary-more-grid'>
            {MORE.map(({id,title,desc,Icon})=>(
              <button key={id} type='button' className='primary-more-card' onClick={()=>go(id)}>
                <Icon size={20} aria-hidden/><strong>{title}</strong><span>{desc}</span>
              </button>))}
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <div className='primary-app'>
      <button type='button' className='primary-skip' onClick={skipToMain}>跳到学习内容</button>
      <header className='primary-header'>
        <div className='primary-brand'>
          <BrandMark/>
          <h1 className='primary-title'><span className='primary-title-name'>拾词 LexiGo</span><span className='primary-title-sub'>小学英语 · {GRADE_LABEL[grade]}</span></h1>
        </div>
        <div className='primary-grade' role='group' aria-label='选择年级，切换后会重新载入该年级的学习记录'>
          <span className='primary-grade-label' aria-hidden='true'>年级</span>
          {GRADES.map(g=>(
            <button key={g} type='button' aria-pressed={grade===g} className={grade===g?'primary-grade-btn primary-grade-btn-active':'primary-grade-btn'} onClick={()=>pickGrade(g)}>{GRADE_LABEL[g]}</button>))}
        </div>
        {saveNote&&<p className='primary-error primary-save-note' role='status'>{saveNote}</p>}
      </header>
      <div className='primary-shell'>
        <nav className='primary-nav' aria-label='小学学习导航'>
          <ul className='primary-nav-main'>{NAV_MAIN.map(navButton)}</ul>
          <p className='primary-nav-heading'>更多</p>
          <button type='button' className='primary-nav-toggle' aria-expanded={moreOpen} aria-controls='primary-more-navigation' onClick={()=>setMoreOpen(value=>!value)}>
            <span>更多功能{MAIN_IDS.indexOf(tab)<0?` · ${currentLabel}`:''}</span><ChevronDown size={17} aria-hidden/>
          </button>
          <ul id='primary-more-navigation' className={moreOpen?'primary-nav-more primary-nav-more-open':'primary-nav-more'}>{NAV_MORE.map(navButton)}</ul>
        </nav>
        <main key={grade} ref={mainRef} id='primary-main' tabIndex={-1} aria-label={currentLabel} className={`primary-route primary-route-${tab}`}>
          {tab==='today'&&today}
          {tab==='words'&&<PrimaryWords {...wordProps}/>}
          {tab==='dictation'&&<PrimaryDictation {...wordProps}/>}
          {tab==='practice'&&<PrimaryPractice grade={grade} initialFocusType={focusType}/>}
          {tab==='studio'&&<PrimaryStudio {...wordProps} onOpenWords={()=>go('words')}/>}
          {tab==='mistakes'&&<MistakesView onNavigate={onMistakeNav} primary onTargetPractice={reviewType?()=>{go('practice');setFocusType(reviewType);}:undefined}/>}
          {tab==='games'&&<GameHub speech={speech} primaryGrade={grade}/>}
          {tab==='correction'&&<><div className='primary-tabs primary-segment' role='group' aria-label='写作与批改方式'><button type='button' className={correctionKind==='essay'?'primary-button primary-segment-btn primary-segment-btn-active':'primary-button primary-segment-btn'} aria-pressed={correctionKind==='essay'} onClick={()=>setCorrectionKind('essay')}>写作小老师</button><button type='button' className={correctionKind==='questions'?'primary-button primary-segment-btn primary-segment-btn-active':'primary-button primary-segment-btn'} aria-pressed={correctionKind==='questions'} onClick={()=>setCorrectionKind('questions')}>题目批改</button></div><CorrectionView key={correctionKind} kind={correctionKind} primaryGrade={grade}/></>}
          {tab==='records'&&<PrimaryRecords grade={grade}/>}
        </main>
      </div>
      <footer className='primary-footer'>
        {data?.note&&<p className='primary-note'>{data.note}</p>}
        <p className='primary-note'>本机学习记录：保存在当前浏览器中，不会自动同步到其他设备。</p>
      </footer>
    </div>
  );
}

export default PrimaryApp;
