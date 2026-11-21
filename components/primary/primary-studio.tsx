import {useState} from 'react';
import {AudioLines,BookOpen,CalendarDays,Layers,RotateCcw,Sparkles} from 'lucide-react';
import type {PrimaryBook,PrimaryGrade,PrimaryWord} from '@/lib/primary-types';
import {todayKey,useProgress} from '../learn/progress';
import {isDue} from '../learn/review';
import type {SpeechState} from '../learn/use-speech';
import {PrimaryFlashcards,readPrimaryFlashDraft,type PrimaryFlashDraft} from './primary-flashcards';
import {unfinishedPrimaryDictation} from './primary-dictation';
import {BookSelector,useBookScope} from './book-scope';
import {buildMatch,buildSkillQuestions,dailyRandom} from './study-activities';
import {skillQuestions,storyQuestions,StudyRound,toMistakes,type Answer,type Question} from './study-round';
import {StudyMatch} from './study-match';
import {StoryLesson} from './study-story';
import {stories,type StudyStory} from './study-stories';
import './study-studio.css';

const ACTIVITY=[
  {id:'daily',label:'每日五题',description:'词义和例句填空，每天换一组',icon:Sparkles},
  {id:'listening',label:'听音选词',description:'按课本、收藏或错词出题',icon:AudioLines},
  {id:'match',label:'中英配对',description:'选两张卡，找出对应的词义',icon:Layers},
  {id:'stories',label:'分级故事',description:'读故事或先听后答，答完看原句',icon:BookOpen}
] as const;
type Activity=typeof ACTIVITY[number]['id'];
type WordFilter='all'|'starred'|'wrong'|'due';
type Run=
  | {kind:'quiz';key:string;id:string;title:string;questions:Question[];story?:StudyStory;hideTranscript?:boolean}
  | {kind:'match';key:string;board:ReturnType<typeof buildMatch>}
  | {kind:'story';story:StudyStory};
const runKey=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
const studyPrefix=(grade:PrimaryGrade)=>`primary-g${grade}-studio-`;
const dailyId=(grade:PrimaryGrade,day=todayKey())=>studyPrefix(grade)+'daily-'+day;

export function StudyWeek({grade,words,speech,onOpen}:{grade:PrimaryGrade;words:PrimaryWord[];speech:SpeechState;onOpen:()=>void}){
  const {progress,hydrated}=useProgress();
  const [selected,setSelected]=useState<string>();
  const [deck,setDeck]=useState<PrimaryWord[]>();
  const now=new Date(),today=todayKey(now),start=new Date(now);
  start.setDate(start.getDate()-(start.getDay()+6)%7);
  const days=Array.from({length:7},(_,i)=>{
    const date=new Date(start);date.setDate(date.getDate()+i);
    const key=todayKey(date);
    return {key,label:['一','二','三','四','五','六','日'][i],studied:hydrated&&progress.days.includes(key)};
  });
  const count=days.filter(day=>day.studied).length;
  const completed=hydrated&&progress.practice.some(p=>p.paperId===dailyId(grade,today));
  const isSelectedDay=(at:string)=>Number.isFinite(Date.parse(at))&&todayKey(new Date(at))===selected;
  const log=selected?progress.log[selected]:undefined;
  const namedActivities=selected?Array.from(new Set(progress.practice.filter(p=>isSelectedDay(p.at)).map(p=>p.title))):[];
  if(selected&&progress.dictation.some(p=>isSelectedDay(p.at)))namedActivities.push('听写与拼词');
  if(selected&&progress.corrections.some(p=>isSelectedDay(p.at)))namedActivities.push('写作与批改');
  const unresolved=selected?words.filter(w=>progress.review[w.id]?.known===false&&isSelectedDay(progress.review[w.id].lastReviewed)):[];
  if(deck)return <PrimaryFlashcards grade={grade} words={deck} title={selected+' · 当日待巩固词'} speech={speech}
    onExit={()=>{speech.stop();setDeck(undefined);}}/>;
  return <section className="primary-panel study-week" aria-labelledby="study-week-title">
    <div className="study-week-header">
      <div><h3 id="study-week-title" className="primary-section-title"><CalendarDays size={19} aria-hidden/> 本周学习</h3>
      <p>{hydrated?`已学习 ${count} 天`:'正在读取学习记录…'}</p></div>
      <button type="button" className="primary-button" onClick={onOpen}>{completed?'再练每日五题':'开始每日五题'}</button>
    </div>
    <ul className="study-calendar" aria-label="本周每天的学习记录">
      {days.map(day=><li key={day.key} aria-current={day.key===today?'date':undefined} data-done={day.studied}>
        <button type="button" aria-label={`星期${day.label}${day.studied?'有学习记录':'暂无学习记录'}`} aria-pressed={selected===day.key}
          disabled={!day.studied} onClick={()=>setSelected(selected===day.key?undefined:day.key)}>{day.label}</button>
      </li>)}
    </ul>
    {selected&&<div className="study-day-detail">
      <h4>{selected} 学习记录</h4>
      <p>新记住 {log?.newWords??0} 词 · 复习 {log?.reviews??0} 次 · 标记还不熟 {log?.again??0} 次</p>
      {namedActivities.length>0&&<ul>{namedActivities.map(name=><li key={name}>{name}</li>)}</ul>}
      {unresolved.length>0&&<button type="button" className="primary-button" onClick={()=>setDeck(unresolved.slice(0,10))}>复习当日待巩固词（{Math.min(10,unresolved.length)}/{unresolved.length}）</button>}
    </div>}
  </section>;
}

export default function PrimaryStudio({grade,words,books,speech,loading,error,onRetry,onOpenDictation,onOpenWords}:{
  grade:PrimaryGrade;words:PrimaryWord[];books?:PrimaryBook[];speech:SpeechState;
  loading:boolean;error:string;onRetry:()=>void;onOpenDictation?:()=>void;onOpenWords:()=>void;
}){
  const {progress,recordExam,storageAvailable}=useProgress();
  const scope=useBookScope(grade,books,words);
  const [activity,setActivity]=useState<Activity>('daily');
  const [filter,setFilter]=useState<WordFilter>('all');
  const [run,setRun]=useState<Run|null>(null);
  const [flash,setFlash]=useState<{draft:PrimaryFlashDraft;restart:boolean}>();
  const [message,setMessage]=useState('');
  const audio=speech.supported&&speech.hasEnglish;
  const scoped=scope.items.filter(word=>filter==='all'||(filter==='starred'?progress.starred.includes(word.id):filter==='wrong'?!!progress.wrongbook[word.id]:!!progress.review[word.id]&&isDue(progress.review[word.id])));
  const results=progress.practice.filter(p=>p.paperId===dailyId(grade));
  const best=results.length?Math.max(...results.map(p=>p.score)):undefined;
  const prefix=studyPrefix(grade);

  function startMatch(){
    const board=buildMatch(scoped);
    if(board.pairs.length<2){setMessage('当前范围至少需要两个词义不同的词。可以换一个范围。');return;}
    setMessage('');
    setRun({kind:'match',key:runKey(),board});
  }
  function startQuiz(mode:'daily'|'listening'){
    const id=mode==='daily'?dailyId(grade):prefix+'listening';
    const questions=skillQuestions(buildSkillQuestions(mode,mode==='daily'?words:scoped,words,mode==='daily'?dailyRandom(id):undefined));
    if(!questions.length){setMessage('当前范围没有可用题目。可以换一个范围。');return;}
    setMessage('');
    setRun({kind:'quiz',key:runKey(),id,title:mode==='daily'?'每日五题':'听音选词',questions});
  }
  function finishQuiz(active:Extract<Run,{kind:'quiz'}>,answers:Answer[]){
    recordExam(prefix+active.key,[{
      paperId:active.id,title:active.title,type:active.story?'reading':'cloze',origin:'original',
      score:answers.filter(a=>a.value===a.question.answer).length,maxScore:answers.length
    }],toMistakes(grade,active.title,answers));
  }
  const exit=()=>setRun(null);
  if(flash)return <PrimaryFlashcards grade={grade} title={flash.draft.title} words={flash.draft.words}
    speech={speech} initial={flash.restart?undefined:flash.draft.snapshot} onExit={()=>{speech.stop();setFlash(undefined);}}/>;
  if(run?.kind==='match')return <StudyMatch key={run.key} {...run.board} onReplay={startMatch} onExit={exit} onComplete={score=>{
    recordExam(prefix+run.key,[{paperId:prefix+'match',title:'中英配对',type:'cloze',origin:'original',score,maxScore:run.board.pairs.length}],[]);
  }}/>;
  if(run?.kind==='story')return <StoryLesson story={run.story} words={words} speech={speech} onExit={exit} onStart={hideTranscript=>{
    setRun({kind:'quiz',key:runKey(),id:prefix+'story-'+run.story.id,title:run.story.title,questions:storyQuestions(run.story),story:run.story,hideTranscript});
  }}/>;
  if(run?.kind==='quiz')return <StudyRound key={run.key} title={run.title} questions={run.questions} speech={speech}
    onExit={exit} onFinish={answers=>finishQuiz(run,answers)}
    onRetry={questions=>setRun({...run,key:runKey(),id:run.id+'-retry',title:'错题复练',questions})}
    renderContext={run.story?()=> <details className="study-transcript">
      <summary>{run.hideTranscript?'打开故事原文提示':'查看故事原文'}</summary>
      {run.story!.lines.map(([english])=><p key={english} lang="en">{english}</p>)}
    </details>:undefined}/>;

  const savedFlash=readPrimaryFlashDraft(grade,words);
  const savedDictation=unfinishedPrimaryDictation(grade);
  return <section className="study-room" aria-labelledby="study-room-heading">
    <header className="study-room-header">
      <h2 id="study-room-heading">英语练习室</h2>
      <p>选一种练习，完成后可在学习记录里查看成绩。</p>
    </header>
    {(savedFlash||savedDictation)&&<div className="primary-panel study-resume">
      <h3>继续上次练习</h3>
      {savedFlash&&<div className="study-resume-flash">
        <button type="button" className="primary-button primary-button-primary" onClick={()=>setFlash({draft:savedFlash,restart:false})}>
          继续闪卡 · 第 {savedFlash.snapshot.outcomes.length+1-Number(savedFlash.snapshot.paused)}/{savedFlash.words.length} 张
        </button>
        <details className="study-resume-options">
          <summary>闪卡其他操作</summary>
          <div className="study-actions">
            <button type="button" className="primary-button" onClick={()=>setFlash({draft:savedFlash,restart:true})}>从头练这组</button>
            <button type="button" className="primary-button" onClick={onOpenWords}>另选一组词</button>
          </div>
        </details>
      </div>}
      {savedDictation&&onOpenDictation&&<button type="button" className="primary-button" onClick={onOpenDictation}>
        继续听写或拼词 · 第 {savedDictation.index}/{savedDictation.total} 题
      </button>}
    </div>}
    <div className="study-activity-grid" role="group" aria-label="选择练习">
      {ACTIVITY.map(({id,label,description,icon:Icon})=><button type="button" key={id} aria-pressed={activity===id} onClick={()=>{setActivity(id);setMessage('');}}>
        <span className="study-activity-layout"><Icon size={22} aria-hidden/><span><strong>{label}</strong><span>{description}</span></span></span>
      </button>)}
    </div>
    {!storageAvailable&&<p className="primary-note" role="status">当前浏览器无法保存新的学习记录。</p>}
    {activity==='stories'?<section className="primary-panel study-session">
      <h3>{grade} 年级故事</h3>
      <div className="study-story-grid">
        {stories[grade].map(story=><button type="button" className="study-choice" key={story.id} onClick={()=>setRun({kind:'story',story})}>
          <span><strong lang="en">{story.title}</strong><span className="study-story-subtitle">{story.subtitle}</span></span>
        </button>)}
      </div>
    </section>:<section className="primary-panel study-session">
      <h3>{ACTIVITY.find(item=>item.id===activity)?.label}</h3>
      {loading?<p className="primary-note" role="status">正在加载词库…</p>:error?<div role="alert">
        <p className="primary-error">{error}</p>
        <button type="button" className="primary-button" onClick={onRetry}><RotateCcw size={17} aria-hidden/> 重新加载词库</button>
      </div>:activity==='daily'?<>
        <p className="study-instruction">{best===undefined?'从本年级词库出五道题。答错后可以单独重练。':`今天已完成，最佳成绩 ${best}/5。`}</p>
        <button type="button" className="primary-button primary-button-primary" disabled={!words.length} onClick={()=>startQuiz('daily')}>{best===undefined?'开始今日练习':'再练今天这组'}</button>
      </>:<>
        <BookSelector scope={scope} compact/>
        <label className="study-filter">词单筛选<select className="primary-select" value={filter} onChange={e=>{setFilter(e.target.value as WordFilter);setMessage('');}}>
          <option value="all">当前范围全部</option><option value="starred">我的收藏</option><option value="wrong">听写错词</option><option value="due">到期复习</option>
        </select></label>
        <p className="study-instruction">当前可练 {scoped.length} 个词。</p>
        {activity==='listening'&&!audio&&<p className="primary-note">{speech.ready?'当前设备的英语语音不可用，可以改练配对或读故事。':'正在检查设备的英语语音…'}</p>}
        <button type="button" className="primary-button primary-button-primary"
          disabled={activity==='match'?scoped.length<2:!audio||!scoped.length}
          onClick={activity==='match'?startMatch:()=>startQuiz('listening')}>{activity==='match'?'开始配对':'开始听音练习'}</button>
      </>}
      {message&&<p className="primary-note" role="status">{message}</p>}
    </section>}
  </section>;
}
