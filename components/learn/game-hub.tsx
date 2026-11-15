"use client";

import { ArrowLeft, ArrowRight, Check, Fish, Gamepad2, MousePointer2, Timer, Users, Waves } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { SpeechState } from './use-speech';
import type {PrimaryGrade} from '@/lib/primary-types';
import { SectionHeader } from './ui';
import './game-hub.css';

const RunnerView=lazy(()=>import('./game-view').then(module=>({default:module.GameView})));
const OceanView=lazy(()=>import('./fish-view').then(module=>({default:module.FishView})));
type GameMode='hub'|'runner'|'fish';
export function gameModeFromHash(hash:string):GameMode{return hash==='#game-fish'?'fish':hash==='#game-runner'?'runner':'hub';}

export function GameHub({speech,primaryGrade}:{speech:SpeechState;primaryGrade?:PrimaryGrade}){
 const [mode,setMode]=useState<GameMode>(()=>typeof window==='undefined'?'hub':gameModeFromHash(window.location.hash));
 const {stop}=speech;
 useEffect(()=>{const update=()=>setMode(gameModeFromHash(window.location.hash));update();window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update)},[]);
 useEffect(()=>{stop();return()=>stop()},[mode,stop]);
 if(mode!=='hub')return <div className="game-hub-playing">
  <div className="game-hub-return"><a href="#game"><ArrowLeft size={17} aria-hidden/>返回英语游乐场</a><span><Gamepad2 size={15} aria-hidden/>{mode==='fish'?'词性海洋 · 大鱼吃小鱼':'Sky Run · 英语闯关'}</span></div>
  <Suspense key={`${mode}-${primaryGrade||'high'}`} fallback={<div className="game-hub-loading" role="status"><Gamepad2 size={28} aria-hidden/><p>{mode==='fish'?'正在准备词性海洋…':'正在准备英语闯关…'}</p></div>}>
   {mode==='fish'?<OceanView primaryGrade={primaryGrade}/>:<RunnerView speech={speech} primaryGrade={primaryGrade}/>}
  </Suspense>
 </div>;
 return <section className="view game-hub">
  <SectionHeader eyebrow="Play & learn" title={primaryGrade?`小学 ${primaryGrade} 年级游乐场`:'英语游乐场'} description={primaryGrade?'本年级通用词汇的小练习，边观察、边游泳、边记单词。':'选一个喜欢的玩法，让词汇、词性和语境练习变得更有参与感。'}/>
  <div className="game-hub-banner"><span><Gamepad2 size={18} aria-hidden/>两种玩法，随时切换</span><small>无需 AI 任务 · 手机、电脑都能玩</small></div>
  <div className="game-hub-grid">
   <a href="#game-fish" className="game-hub-card game-hub-ocean" aria-label="进入词性海洋，大鱼吃小鱼游戏">
    <div className="game-hub-art game-hub-ocean-art" aria-hidden="true">
     <span className="game-hub-art-kicker">WORD OCEAN</span><span className="game-hub-new">新玩法</span>
     <div className="game-hub-waterline"/><div className="game-hub-seabed"/>
     <i className="game-hub-bubble bubble-one"/><i className="game-hub-bubble bubble-two"/><i className="game-hub-bubble bubble-three"/>
     <div className="game-hub-big-fish"><span className="game-hub-fish-eye"/><span className="game-hub-fish-fin"/><strong>{primaryGrade?'swim':'discover'}</strong><small>v. 动词</small></div>
     <div className="game-hub-small-fish fish-one">v.</div><div className="game-hub-small-fish fish-two">n.</div><div className="game-hub-small-fish fish-three">adj.</div>
     <div className="game-hub-ocean-caption"><Waves size={16}/>寻找属于你的词性海域</div>
    </div>
    <div className="game-hub-card-body"><div className="game-hub-tags"><span>词性辨认</span><span><Timer size={12} aria-hidden/>每10秒换词</span></div><h2>词性海洋<span>大鱼吃小鱼</span></h2><p>看清当前单词的词性，在游动的鱼群中判断目标，让英语知识成为你的方向感。</p><ul><li><Check size={15} aria-hidden/>在动态场景中练习词性判断</li><li><Check size={15} aria-hidden/>单词定时更换，保持观察与思考</li><li><MousePointer2 size={15} aria-hidden/>进入游戏查看操作与规则</li></ul><div className="game-hub-card-foot"><span><Fish size={18} aria-hidden/>潜入词性海洋</span><ArrowRight size={21} aria-hidden/></div></div>
   </a>
   <a href="#game-runner" className="game-hub-card game-hub-runner" aria-label="进入Sky Run英语闯关游戏">
    <div className="game-hub-art game-hub-runner-art" aria-hidden="true">
     <span className="game-hub-art-kicker">LEXIGO · SKY RUN</span><span className="game-hub-classic">继续经典</span>
     <i className="game-hub-cloud cloud-one"/><i className="game-hub-cloud cloud-two"/><div className="game-hub-run-road"/>
     <div className="game-hub-gate gate-left"><small>A</small><strong>{primaryGrade?'apple':'achieve'}</strong><span>选对英语之门</span></div><div className="game-hub-gate gate-right"><small>B</small><strong>{primaryGrade?'school':'receive'}</strong><span>看清每次选择</span></div>
     <div className="game-hub-crew">{Array.from({length:12},(_,i)=><i key={i}/>)}</div><div className="game-hub-runner-caption"><Users size={16}/>带着知识小队，一起向前</div>
    </div>
    <div className="game-hub-card-body"><div className="game-hub-tags"><span>{primaryGrade?'本年级词义辨析':'词义 · 语境 · 搭配'}</span><span>左右选门</span></div><h2>Sky Run<span>英语闯关</span></h2><p>判断左右两扇门中的正确表达，壮大自己的学习小队；每次选择后都有讲解与复盘。</p><ul><li><Check size={15} aria-hidden/>{primaryGrade?'使用本年级通用词汇、收藏与听写错词':'支持教材词库、收藏与听写错词'}</li><li><Check size={15} aria-hidden/>自由思考或开启12秒冲刺</li><li><Check size={15} aria-hidden/>答错自动入库，可只重练错题</li></ul><div className="game-hub-card-foot"><span><Users size={18} aria-hidden/>召集小队，出发</span><ArrowRight size={21} aria-hidden/></div></div>
   </a>
  </div>
  <p className="game-hub-note">进入任一游戏后，都可以通过顶部按钮回到这里。离开时会暂停当前游戏；学习记录保存在这台设备的浏览器中。{primaryGrade?'本区记录与高中及其他年级分开保存；词库为通用练习，不宣称对应指定教材。':''}</p>
 </section>;
}

export default GameHub;
