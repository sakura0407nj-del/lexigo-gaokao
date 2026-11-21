import type {PrimaryWord} from '@/lib/primary-types';
import {normalizeAnswer} from '@/lib/learning-core';

export type SkillQuestion={
  id:string;
  kind:'meaning'|'sentence'|'listening';
  word:PrimaryWord;
  prompt:string;
  context?:string;
  options:string[];
  answer:string;
};

export function studyShuffle<T>(input:readonly T[],random=Math.random):T[]{
  const items=[...input];
  for(let i=items.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [items[i],items[j]]=[items[j],items[i]];
  }
  return items;
}

export function dailyRandom(seed:string){
  // Seeded PRNG keeps the same grade's daily set stable across reloads.
  let state=2166136261;
  for(const char of seed)state=Math.imul(state^char.charCodeAt(0),16777619);
  return ()=>{
    state=(state+0x6D2B79F5)|0;
    let n=Math.imul(state^(state>>>15),1|state);
    n^=n+Math.imul(n^(n>>>7),61|n);
    return ((n^(n>>>14))>>>0)/4294967296;
  };
}

export function meaningLabel(word:PrimaryWord){
  return word.translation.replace(/^(?:(?:n|v|adj|adv|num|prep|conj|pron|det|phr)\.\s*)+/i,'').trim();
}

function equivalentTerms(word:PrimaryWord){
  return [word.word,...(word.accepted??[])].map(normalizeAnswer);
}

function meaningsOverlap(a:PrimaryWord,b:PrimaryWord){
  const first=meaningLabel(a).split(/[；;、，,\/]/).map(t=>t.trim());
  return meaningLabel(b).split(/[；;、，,\/]/).some(t=>first.includes(t.trim()));
}

function uniqueWords(words:readonly PrimaryWord[]){
  const used=new Set<string>();
  return words.filter(word=>{
    if(!meaningLabel(word)||equivalentTerms(word).some(t=>used.has(t)))return false;
    equivalentTerms(word).forEach(t=>used.add(t));
    return true;
  });
}

function blankExample(word:PrimaryWord){
  if(!word.exampleZh)return '';
  const escaped=word.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const expression=new RegExp('(^|[^A-Za-z])'+escaped+'(?![A-Za-z])','gi');
  const blank=word.example.replace(expression,'$1____');
  return blank===word.example||blank.split('____').length!==2?'':blank;
}

export function buildSkillQuestions(mode:'daily'|'listening',scope:readonly PrimaryWord[],distractors:readonly PrimaryWord[],random=Math.random){
  const pool=studyShuffle(uniqueWords(scope),random),choices=uniqueWords(distractors);
  const results:SkillQuestion[]=[];
  for(const word of pool){
    const usedMeanings=new Set<string>(),terms=equivalentTerms(word),different:PrimaryWord[]=[];
    for(const other of studyShuffle(choices,random)){
      const meaning=meaningLabel(other);
      if(other.id===word.id||usedMeanings.has(meaning)||meaningsOverlap(word,other)||equivalentTerms(other).some(term=>terms.includes(term)))continue;
      usedMeanings.add(meaning);different.push(other);
      if(different.length===3)break;
    }
    if(different.length<2)continue;
    const blank=mode==='daily'&&results.length%2===1?blankExample(word):'';
    const kind=mode==='listening'?'listening':blank?'sentence':'meaning';
    const display=kind==='meaning'?meaningLabel:(w:PrimaryWord)=>w.word;
    const answer=display(word);
    results.push({
      id:word.id+'-'+kind,kind,word,answer,
      prompt:kind==='meaning'?word.word:blank||'听发音，选出听到的单词',
      context:blank?word.exampleZh:undefined,
      options:studyShuffle([answer,...different.map(display)],random)
    });
    if(results.length===(mode==='daily'?5:8))break;
  }
  return results;
}

export function buildMatch(words:readonly PrimaryWord[],random=Math.random){
  const pairs:PrimaryWord[]=[];
  for(const word of studyShuffle(uniqueWords(words),random)){
    if(pairs.every(prior=>!meaningsOverlap(word,prior)))pairs.push(word);
    if(pairs.length===6)break;
  }
  return {pairs,meanings:studyShuffle(pairs,random)};
}
