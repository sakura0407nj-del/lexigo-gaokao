import {fishResult, parseFishResult, parseFishRun} from '@/lib/fish-engine';
import type {FishEvent, FishResult, FishRun} from '@/lib/fish-types';
import type {PrimaryGrade} from '@/lib/primary-types';
import {scopedStorageKey} from '@/lib/learning-stage';

export const FISH_SAVE = 'lexigo.fish-run.v1';
export const FISH_HISTORY = 'lexigo.fish-history.v1';
export interface FishSave {version:1; run:FishRun; phase:'play'|'result'; handledEvent:number; updatedAt:string; result?:FishResult}

export function unhandledFishEvents(run:FishRun, handledEvent:number):FishEvent[] {
  return run.events.filter(event=>event.id>handledEvent);
}

export function parseFishSave(value:unknown, now=Date.now(), primaryGrade?:PrimaryGrade):FishSave|null {
  if (!value || typeof value!=='object') return null;
  const v=value as FishSave, run=parseFishRun(v.run,primaryGrade??'high'), at=Date.parse(v.updatedAt);
  if(v.version!==1||!run||!['play','result'].includes(v.phase)||!Number.isFinite(at)||at>now+300000||now-at>7*86400000||!Number.isInteger(v.handledEvent)||v.handledEvent<0||v.handledEvent>run.eventSerial)return null;
  const phase=run.finished?'result':v.phase;
  const completed=typeof v.result?.completedAt==='string'?Date.parse(v.result.completedAt):NaN;
  const result=phase==='result'?fishResult(run, Number.isFinite(completed)&&completed>=0&&completed<=now+300000?v.result!.completedAt:v.updatedAt):undefined;
  return {version:1,run,phase,handledEvent:v.handledEvent,updatedAt:v.updatedAt,...(result?{result}:{})};
}
export function readFishSave(primaryGrade?:PrimaryGrade):FishSave|null {
  try {const raw=localStorage.getItem(scopedStorageKey(FISH_SAVE,primaryGrade));return raw&&raw.length<350000?parseFishSave(JSON.parse(raw),Date.now(),primaryGrade):null;}catch{return null;}
}
export function writeFishSave(save:FishSave|null,primaryGrade?:PrimaryGrade):boolean {
  try {const key=scopedStorageKey(FISH_SAVE,primaryGrade);if(!save)localStorage.removeItem(key);else{const clean=parseFishSave({...save,updatedAt:new Date().toISOString()},Date.now(),primaryGrade);if(!clean)return false;const value=JSON.stringify(clean);if(value.length>350000)return false;localStorage.setItem(key,value);}return true;}catch{return false;}
}
export function parseFishHistory(value:unknown,now=Date.now(),primaryGrade?:PrimaryGrade):FishResult[] {
  if(!Array.isArray(value))return [];
  const unique=new Map<string,FishResult>();
  // Newest in-memory values precede disk values. A duplicated stale row cannot replace them.
  for(const raw of value.slice(0,400)){const item=parseFishResult(raw,primaryGrade??'high');if(!item||unique.has(item.id))continue;const at=Date.parse(item.completedAt);if(at<0||at>now+300000)continue;unique.set(item.id,{...item,completedAt:new Date(at).toISOString()});}
  return [...unique.values()].sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt)).slice(0,100);
}
export function readFishHistory(primaryGrade?:PrimaryGrade):FishResult[]{try{const raw=localStorage.getItem(scopedStorageKey(FISH_HISTORY,primaryGrade));return raw&&raw.length<100000?parseFishHistory(JSON.parse(raw),Date.now(),primaryGrade):[];}catch{return [];}}
export function addFishResult(result:FishResult,current:readonly FishResult[]=[],primaryGrade?:PrimaryGrade):{history:FishResult[];saved:boolean}{
  const history=parseFishHistory([result,...current,...readFishHistory(primaryGrade)],Date.now(),primaryGrade);
  if(!parseFishResult(result,primaryGrade??'high'))return {history,saved:false};
  try {localStorage.setItem(scopedStorageKey(FISH_HISTORY,primaryGrade),JSON.stringify(history));return {history,saved:true};}catch{return {history,saved:false};}
}
export function fishHistoryCsv(history:FishResult[],primaryGrade?:PrimaryGrade):string {
  const cell=(value:string|number)=>`"${String(value).replace(/"/g,'""')}"`;
  return '\uFEFF日期,时长秒,实际秒,得分,吃对,误吃,最高连击,状态\n'+parseFishHistory(history,Date.now(),primaryGrade).map(r=>[r.completedAt,r.duration,Math.round(r.elapsed),r.score,r.correct,r.wrong,r.bestCombo,r.completed?'完成':'提前结束'].map(cell).join(',')).join('\n');
}
