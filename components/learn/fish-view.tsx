"use client";

import {useCallback,useEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,Download,Fish,Pause,Play,RotateCcw,Trophy} from 'lucide-react';
import {advanceFishRun,createFishRun,fishResult,POS_LABEL,TARGET_INTERVAL} from '@/lib/fish-engine';
import type {FishEvent,FishInput,FishPoint,FishPos,FishRun} from '@/lib/fish-types';
import {FishScene} from './fish-scene';
import {useProgress} from './progress';
import type {MistakeDraft} from './mistakes';
import type {PrimaryGrade} from '@/lib/primary-types';
import {downloadText} from './ui';
import {addFishResult,fishHistoryCsv,readFishHistory,readFishSave,unhandledFishEvents,writeFishSave,type FishSave} from './fish-storage';
import './fish.css';

const POS:FishPos[]=['noun','verb','adjective','adverb'];
const formatTime=(seconds:number)=>{const whole=Math.ceil(Number.isFinite(seconds)?Math.max(0,seconds):0);return `${Math.floor(whole/60).toString().padStart(2,'0')}:${(whole%60).toString().padStart(2,'0')}`;};
const keyDirection:Record<string,FishPoint>={ArrowLeft:{x:-1,y:0},a:{x:-1,y:0},ArrowRight:{x:1,y:0},d:{x:1,y:0},ArrowUp:{x:0,y:-1},w:{x:0,y:-1},ArrowDown:{x:0,y:1},s:{x:0,y:1}};

function fishEventMistakes(events:readonly FishEvent[]):MistakeDraft[] {
  return events.filter(event=>event.type==='wrong').map(event=>({id:`fish-pos:${event.word.id}`,kind:'game',title:'词性海洋 · 词性辨析',prompt:`在句子“${event.word.example}”中，${event.word.word} 是什么词性？`,context:`${event.word.word}：${event.word.meaning}。当时你的目标词是 ${event.target.word}（${POS_LABEL[event.target.pos]}）。`,options:POS.map((pos,i)=>`${'ABCD'[i]}. ${POS_LABEL[pos]}`),correctAnswer:'ABCD'[POS.indexOf(event.word.pos)],yourAnswer:'ABCD'[POS.indexOf(event.target.pos)],explanation:`${event.word.word} 在例句中用作${POS_LABEL[event.word.pos]}，与目标词 ${event.target.word} 的${POS_LABEL[event.target.pos]}不同。词性应结合当前语境判断。`,knowledge:`词性辨析 · ${POS_LABEL[event.word.pos]}`}));
}

export function FishView({primaryGrade}:{primaryGrade?:PrimaryGrade}={}){
  const {addMistakes,markStudyDay}=useProgress();
  const [save,setSave]=useState<FishSave|null>(()=>readFishSave(primaryGrade)),[paused,setPaused]=useState(true);
  const [duration,setDuration]=useState<60|120|180>(120),[history,setHistory]=useState(()=>readFishHistory(primaryGrade));
  const [notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false),[feedback,setFeedback]=useState<FishEvent|null>(null);
  const latest=useRef(save),pausedRef=useRef(true),input=useRef<FishInput>({}),keys=useRef(new Set<string>()),dialog=useRef<HTMLDialogElement>(null),arena=useRef<HTMLDivElement>(null);
  const historyRef=useRef(history);
  const handled=useRef(save?.handledEvent||0),lastPersist=useRef(0);
  const best=Math.max(0,...history.filter(r=>r.completed&&r.duration===duration).map(r=>r.score));
  const persist=useCallback((next:FishSave|null)=>{if(!writeFishSave(next,primaryGrade))setNotice('浏览器未能保存本局。请先完成游戏并导出积分记录，再关闭页面。');},[primaryGrade]);
  const publish=useCallback((next:FishSave|null,store=true)=>{latest.current=next;setSave(next);if(store)persist(next);},[persist]);
  const pause=useCallback(()=>{pausedRef.current=true;setPaused(true);input.current={};keys.current.clear();if(latest.current)persist(latest.current);},[persist]);
  const resume=()=>{input.current={};keys.current.clear();pausedRef.current=false;setPaused(false);};
  const finish=useCallback((run:FishRun)=>{
    if(latest.current?.phase==='result')return;
    pausedRef.current=true;setPaused(true);input.current={};keys.current.clear();
    const result=fishResult(run,new Date().toISOString());const recorded=addFishResult(result,historyRef.current,primaryGrade);historyRef.current=recorded.history;setHistory(recorded.history);
    if(!recorded.saved)setNotice('积分暂时未能保存，可先导出本页记录。');
    publish({version:1,run,phase:'result',handledEvent:handled.current,updatedAt:new Date().toISOString(),result});markStudyDay();
  },[publish,markStudyDay,primaryGrade]);
  const processEvents=useCallback((run:FishRun)=>{
    const fresh=unhandledFishEvents(run,handled.current);
    if(!fresh.length)return false;
    handled.current=Math.max(handled.current,...fresh.map(e=>e.id));
    setFeedback(fresh.at(-1)||null);
    const wrong=fishEventMistakes(fresh);if(wrong.length)addMistakes(wrong);
    return true;
  },[addMistakes]);

  useEffect(()=>{
    const leave=()=>{pausedRef.current=true;input.current={};keys.current.clear();if(latest.current)writeFishSave(latest.current,primaryGrade);};
    const hidden=()=>{if(document.hidden)pause();};
    const releaseKey=(event:KeyboardEvent)=>{const key=event.key.length===1?event.key.toLowerCase():event.key;if(!keys.current.has(key))return;keys.current.delete(key);const direction={x:0,y:0};keys.current.forEach(k=>{direction.x+=keyDirection[k]?.x||0;direction.y+=keyDirection[k]?.y||0;});input.current={direction};};
    window.addEventListener('pagehide',leave);window.addEventListener('blur',pause);window.addEventListener('keyup',releaseKey);document.addEventListener('visibilitychange',hidden);
    return()=>{leave();window.removeEventListener('pagehide',leave);window.removeEventListener('blur',pause);window.removeEventListener('keyup',releaseKey);document.removeEventListener('visibilitychange',hidden);};
  },[pause,primaryGrade]);
  useEffect(()=>{
    if(!save||save.phase!=='play'||paused)return;
    let frameId=0,last=performance.now(),lastPaint=last;
    const frame=(now:number)=>{
      const previous=latest.current;
      if(!previous||previous.phase!=='play'||pausedRef.current||document.hidden)return;
      const dt=Math.max(0,(now-last)/1000);last=now;
      const run=advanceFishRun(previous.run,dt,input.current),changed=processEvents(run);
      const next:FishSave={...previous,run,handledEvent:handled.current};latest.current=next;
      if(run.finished){finish(run);return;}
      if(now-lastPaint>=1000/30||changed){setSave(next);lastPaint=now;}
      if(changed||now-lastPersist.current>2000){persist(next);lastPersist.current=now;}
      frameId=requestAnimationFrame(frame);
    };
    frameId=requestAnimationFrame(frame);return()=>cancelAnimationFrame(frameId);
  },[Boolean(save),save?.phase,paused,processEvents,finish,persist]);
  useEffect(()=>{const restored=latest.current;if(!restored)return;if(processEvents(restored.run)){const next={...restored,handledEvent:handled.current};publish(next);}if(restored.phase==='result'&&restored.result){const recorded=addFishResult(restored.result,historyRef.current,primaryGrade);historyRef.current=recorded.history;setHistory(recorded.history);if(!recorded.saved)setNotice('本局积分尚未写入浏览器，请导出备份。');}},[processEvents,publish,primaryGrade]);
  useEffect(()=>{if(confirm&&!dialog.current?.open)dialog.current?.showModal();},[confirm]);

  const begin=()=>{
    handled.current=0;setFeedback(null);setNotice('');input.current={};keys.current.clear();
    let run:FishRun;try{run=createFishRun({duration,...(primaryGrade?{primaryGrade}:{})},crypto.randomUUID());}catch(error){setNotice(error instanceof Error?error.message:'当前年级鱼词库尚未准备好，请稍后再试。');return;}publish({version:1,run,phase:'play',handledEvent:0,updatedAt:new Date().toISOString()});
    pausedRef.current=false;setPaused(false);markStudyDay();
    window.setTimeout(()=>arena.current?.querySelector<HTMLCanvasElement>('canvas')?.focus({preventScroll:true}),0);
  };
  const setPointer=useCallback((target:FishPoint|null)=>{if(!pausedRef.current){keys.current.clear();input.current={target};}},[]);
  const onKey=(event:ReactKeyboardEvent<HTMLDivElement>,down:boolean)=>{
    if(event.target instanceof HTMLElement&&(event.target.matches('input,select,textarea')||event.target.isContentEditable))return;
    const key=event.key.length===1?event.key.toLowerCase():event.key;
    if(!keyDirection[key]||latest.current?.phase!=='play'||pausedRef.current)return;
    event.preventDefault();if(down)keys.current.add(key);else keys.current.delete(key);
    const direction={x:0,y:0};keys.current.forEach(k=>{direction.x+=keyDirection[k]?.x||0;direction.y+=keyDirection[k]?.y||0;});input.current={direction};
  };
  const nudge=(direction:FishPoint)=>{if(!pausedRef.current&&latest.current)input.current={target:{x:latest.current.run.player.x+direction.x*100,y:latest.current.run.player.y+direction.y*100}};};
  const run=save?.run,result=save?.result,remaining=run?Math.max(0,run.duration-run.elapsed):duration;
  const switchIn=run?Math.max(0,Math.ceil(run.nextChangeAt-run.elapsed)):TARGET_INTERVAL;
  const wrongExamples=run?[...new Map(run.events.filter(e=>e.type==='wrong').map(e=>[e.word.id,e])).values()].slice(-8):[];
  return <section className="fish-view">
    <header className="fish-heading"><div><p>LEXIGO · WORD OCEAN</p><h1>{primaryGrade?`小学 ${primaryGrade} 年级词性海洋`:'词性海洋'}</h1><p>操控你的小鱼，每 {TARGET_INTERVAL} 秒换词，吃对同词性的鱼，慢慢长大。</p></div><span className="fish-free">无需 AI · 不消耗额度</span></header>
    {notice&&<p className="fish-note" role="alert">{notice}</p>}
    {!save&&<div className="fish-setup">
      <div className="fish-invitation"><Fish size={64}/><span>SWIM · THINK · GROW</span><h2>游向正确的单词。</h2><p>名词、动词、形容词、副词。把词性判断，变成一场海底探索。</p><div className="fish-pos-tags">{POS.map(pos=><span key={pos}>{POS_LABEL[pos]}</span>)}</div></div>
      <div className="fish-settings"><h3>准备潜入海底</h3><label>本局时间<select value={duration} onChange={e=>setDuration(Number(e.target.value) as 60|120|180)}><option value={60}>1 分钟 · 热身</option><option value={120}>2 分钟 · 标准</option><option value={180}>3 分钟 · 耐力</option></select></label><p className="fish-best"><Trophy size={20}/> 此时长最高分 <strong>{best}</strong></p><ul><li>吃对同词性：+10 分，并长大。</li><li>每连续吃对 5 条：额外 +10 分。</li><li>误吃不同词性：−5 分，最低为 0，连击归零。</li><li>每 10 秒自动换词；刚换词有 1 秒保护。</li></ul><button type="button" className="fish-primary" onClick={begin}><Play size={18}/>开始游泳</button><p className="fish-storage-note">{primaryGrade?`仅使用小学 ${primaryGrade} 年级通用词汇；词性按所给例句判断，不对应指定教材单元。`:'词性按所给例句判断；所用词为通用英语词汇，本玩法不对应某一教材单元。'}</p></div>
    </div>}
    {save&&run&&<>
      <div className="fish-scorebar"><span><small>积分</small><strong>{run.score}</strong></span><span><small>剩余</small><strong>{formatTime(remaining)}</strong></span><span><small>连击</small><strong>{run.combo}</strong></span><span><small>体型</small><strong>{run.growth.toFixed(2)}×</strong></span>{save.phase==='play'&&<button type="button" onClick={paused?resume:pause}>{paused?<Play size={17}/>:<Pause size={17}/>} {paused?'继续':'暂停'}</button>}{save.phase==='play'&&<button type="button" className="fish-end" onClick={()=>{pause();setConfirm(true);}}>结束</button>}</div>
      {save.phase==='play'&&<div className={`fish-target ${switchIn<=3?'changing':''}`}><div><span>我的单词 · 找同类</span><strong>{run.target.word}</strong><small>{run.target.meaning} · {POS_LABEL[run.target.pos]}</small></div><div className="fish-switch"><b>{switchIn}s</b><span>后换词</span><progress value={Math.max(0,run.nextChangeAt-run.elapsed)} max={TARGET_INTERVAL} aria-label="距离更换单词的时间"/></div><p>{run.target.example}</p></div>}
      <div ref={arena} className="fish-play-area" onKeyDown={e=>onKey(e,true)} onKeyUp={e=>onKey(e,false)}>
        <div className="fish-stage"><FishScene state={run} onPointerTarget={setPointer} paused={paused||save.phase==='result'}/>{paused&&save.phase==='play'&&<div className="fish-pause-overlay"><Pause size={28}/><h2>海洋已暂停</h2><p>倒计时和换词均暂停。刷新后也能接着游。</p><button type="button" className="fish-primary" onClick={resume}>继续游泳</button></div>}</div>
        {save.phase==='play'&&<><div className="fish-controls"><p>手机：按住海面，拖动引导小鱼。<br/>电脑：点击海面后按方向键 / WASD；也可按住鼠标引导。</p><div className="fish-dpad" aria-label="方向控制">{[{label:'上',x:0,y:-1,Icon:ArrowUp},{label:'左',x:-1,y:0,Icon:ArrowLeft},{label:'下',x:0,y:1,Icon:ArrowDown},{label:'右',x:1,y:0,Icon:ArrowRight}].map(({label,x,y,Icon})=><button key={label} type="button" aria-label={`向${label}游动`} disabled={paused} className={`fish-dir fish-dir-${label}`} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);input.current={direction:{x,y}};}} onPointerUp={()=>{input.current={};}} onPointerCancel={()=>{input.current={};}} onLostPointerCapture={()=>{input.current={};}} onClick={e=>{if(e.detail===0)nudge({x,y});}}><Icon size={21}/></button>)}</div></div>
          <details className="fish-word-context"><summary>场上单词与例句（不显示词性）</summary><p>可先暂停，阅读句子后再判断；以下为当前鱼群的文字版本。</p><ul>{run.fish.map(fish=><li key={fish.id}><strong>{fish.word.word}</strong><span> — {fish.word.example}</span></li>)}</ul></details>
          <div className={`fish-feedback ${feedback?.type||''}`} role="status">{feedback?feedback.type==='change'?<><strong>换词啦：{feedback.target.word}</strong><span>现在寻找{POS_LABEL[feedback.target.pos]}。1 秒保护期间不会误吃。</span></>:<><strong>{feedback.type==='correct'?`吃对了！+${feedback.scoreDelta} 分${feedback.comboBonus?' · 连击奖励':''}`:`词性不同 ${feedback.scoreDelta} 分`}</strong><span>{feedback.word.word}：{feedback.word.meaning} · {POS_LABEL[feedback.word.pos]}</span><em>{feedback.word.example}</em></>:<><strong>看准单词再出发</strong><span>小鱼的颜色不代表词性。误吃会显示例句，并进入错题集。</span></>}</div>
        </>}
      </div>
      {save.phase==='result'&&result&&<div className="fish-results"><Trophy size={36}/><p>{result.completed?'本局完成':'已提前结束 · 不参与最高分比较'}</p><h2>{result.score}<small> 分</small></h2><div className="fish-result-grid"><span>吃对 <b>{result.correct}</b></span><span>误吃 <b>{result.wrong}</b></span><span>最高连击 <b>{result.bestCombo}</b></span><span>正确率 <b>{Math.round(result.accuracy*100)}%</b></span></div><p>得分反映这一局的游戏表现，不代表词性已完全掌握。误吃的词可去错题集复习。</p><div className="fish-result-actions"><button type="button" className="fish-primary" onClick={()=>{setDuration(run.duration);publish(null);}}><RotateCcw size={18}/>再玩一局</button><button type="button" onClick={()=>downloadText('词性海洋-积分记录.csv',fishHistoryCsv(history,primaryGrade),'text/csv;charset=utf-8')}><Download size={18}/>导出积分</button></div>{wrongExamples.length>0&&<div className="fish-review"><h3>这几组词性值得再看看</h3>{wrongExamples.map(event=><article key={event.word.id}><strong>{event.word.word} · {POS_LABEL[event.word.pos]}</strong><p>{event.word.meaning}</p><p>{event.word.example}</p><small>你当时在寻找：{event.target.word} · {POS_LABEL[event.target.pos]}</small></article>)}</div>}</div>}
    </>}
    {(!save||save.phase==='result')&&<section className="fish-history"><div><h2>我的积分记录</h2><button type="button" disabled={!history.length} onClick={()=>downloadText('词性海洋-积分记录.csv',fishHistoryCsv(history,primaryGrade),'text/csv;charset=utf-8')}><Download size={16}/>导出</button></div><p>保留本浏览器最近 100 局，展示最近 10 局。不同时间分别比较最高分；不会自动跨设备同步。</p>{history.length?<div className="fish-table-wrap"><table><thead><tr><th>日期</th><th>时长</th><th>积分</th><th>吃对 / 误吃</th><th>状态</th></tr></thead><tbody>{history.slice(0,10).map(row=><tr key={row.id}><td>{new Date(row.completedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td>{row.duration/60} 分钟</td><td><strong>{row.score}</strong></td><td>{row.correct} / {row.wrong}</td><td>{row.completed?'完成':'提前结束'}</td></tr>)}</tbody></table></div>:<div className="fish-history-empty">完成第一局，就会在这里留下你的记录。</div>}</section>}
    {confirm&&<dialog ref={dialog} className="fish-confirm" aria-label="结束鱼游戏确认" onCancel={()=>setConfirm(false)}><h2>提前结束这一局？</h2><p>本局积分会保留并标记“提前结束”，不参与最高分比较。</p><div><button type="button" autoFocus onClick={()=>setConfirm(false)}>继续休息</button><button type="button" className="fish-primary" onClick={()=>{setConfirm(false);if(latest.current)finish(latest.current.run);}}>结束并保存积分</button></div></dialog>}
  </section>;
}
