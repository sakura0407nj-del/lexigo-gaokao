"use client";
import {Component,lazy,Suspense,useEffect,type ReactNode} from 'react';
import {GraduationCap,Sprout} from 'lucide-react';
import {LearnApp} from './learn-app';
import {ProgressProvider} from './progress';
import {getLearningStage,getPrimaryGrade} from '@/lib/learning-stage';
import './stage.css';
const PrimaryApp=lazy(()=>import('../primary/primary-app').then(module=>({default:module.PrimaryApp})));
class LearningBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div role="alert" className="primary-stage-loading"><h2>这一页暂时没有加载成功</h2><p>请检查网络后重新载入，已保存的学习记录会保留。</p><button className="btn btn-primary" onClick={()=>window.location.reload()}>重新加载</button></div>:this.props.children;}
}

export function StageApp(){
 const stage=getLearningStage(),grade=getPrimaryGrade();
 useEffect(()=>{document.title=stage==='primary'?`拾词 LexiGo · 小学${grade}年级英语`:'拾词 LexiGo · 高考英语学习室';},[stage,grade]);
 let rememberedGrade=3;try{const n=Number(localStorage.getItem('lexigo.primary.grade.v1'));if([3,4,5,6].includes(n))rememberedGrade=n;}catch{}
 return <div className={`stage-shell stage-${stage}`}><header className="learning-stage-bar"><span><GraduationCap size={18}/>选择学习阶段</span><nav aria-label="学习阶段"><a className={stage==='primary'?'selected':''} href={`?stage=primary&grade=${stage==='primary'?grade:rememberedGrade}#today`} aria-current={stage==='primary'?'page':undefined}><Sprout size={16}/>小学版 <small>3—6年级</small></a><a className={stage==='high'?'selected':''} href="?stage=high#today" aria-current={stage==='high'?'page':undefined}><GraduationCap size={16}/>高中版</a></nav><small>各学段、年级的记录独立保存</small></header><LearningBoundary>{stage==='primary'?<ProgressProvider><Suspense fallback={<p role="status" className="primary-stage-loading">正在准备小学英语学习室…</p>}><PrimaryApp/></Suspense></ProgressProvider>:<LearnApp/>}</LearningBoundary></div>;
}
