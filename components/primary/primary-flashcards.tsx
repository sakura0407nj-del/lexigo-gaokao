import {useCallback} from 'react';
import {scopedStorageKey} from '@/lib/learning-stage';
import type {PrimaryGrade,PrimaryWord} from '@/lib/primary-types';
import {Flashcards,type FlashcardSnapshot} from '../learn/flashcards';
import type {SpeechState} from '../learn/use-speech';

export interface PrimaryFlashDraft {
  title:string;
  words:PrimaryWord[];
  snapshot:FlashcardSnapshot;
}

const key=(grade:PrimaryGrade)=>scopedStorageKey('lexigo.flash-deck.v1',grade);

export function readPrimaryFlashDraft(grade:PrimaryGrade,words:PrimaryWord[]):PrimaryFlashDraft|undefined{
  try{
    const data=JSON.parse(localStorage.getItem(key(grade))||'null');
    if(!data||data.version!==1||data.grade!==grade||typeof data.title!=='string'||data.title.length>240||
      !Number.isFinite(data.saved)||Date.now()-data.saved>14*86400000||data.saved>Date.now()+300000)return;
    const s=data.snapshot as FlashcardSnapshot|undefined;
    if(!s||!Array.isArray(s.ids)||s.ids.length<1||s.ids.length>50||new Set(s.ids).size!==s.ids.length||
      !Array.isArray(s.outcomes)||s.outcomes.length>s.ids.length||typeof s.paused!=='boolean'||typeof s.flipped!=='boolean'||
      !Number.isSafeInteger(s.round)||s.round<1||s.round>10000)return;
    const index=s.outcomes.length-Number(s.paused);
    if(index<0||index>=s.ids.length||(s.paused&&(!s.flipped||s.outcomes[s.outcomes.length-1]?.known!==false)))return;
    if(!s.outcomes.every((o,i)=>o?.id===s.ids[i]&&typeof o.known==='boolean'))return;
    const byId=new Map(words.filter(w=>w.grade===grade).map(w=>[w.id,w]));
    const restored=s.ids.map(id=>byId.get(id)).filter((w):w is PrimaryWord=>Boolean(w));
    if(restored.length!==s.ids.length)return;
    return {title:data.title,words:restored,snapshot:s};
  }catch{return;}
}

export function PrimaryFlashcards({grade,title,words,speech,initial,onExit,onOpenUnfamiliar}:{
  grade:PrimaryGrade;title:string;words:PrimaryWord[];speech:SpeechState;initial?:FlashcardSnapshot;
  onExit:()=>void;onOpenUnfamiliar?:()=>void;
}){
  const save=useCallback((snapshot:FlashcardSnapshot|null)=>{
    try{
      if(snapshot)localStorage.setItem(key(grade),JSON.stringify({version:1,grade,title,saved:Date.now(),snapshot}));
      else localStorage.removeItem(key(grade));
    }catch{/* Session remains usable when local storage is unavailable. */}
  },[grade,title]);
  return <Flashcards words={words} title={title} speech={speech} primary initial={initial}
    onSnapshot={save} onExit={onExit} onOpenUnfamiliar={onOpenUnfamiliar}/>;
}
