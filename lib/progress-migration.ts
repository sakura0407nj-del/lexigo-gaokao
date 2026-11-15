import type {Word} from './learning-types';

export type WordAliases = Readonly<Record<string,string>>;
export interface MigratableReview {
  step:number; interval:number; reviewCount:number; lapses:number; lastReviewed:string; dueAt:string; known?:boolean;
}
export interface MigratableWrong {
  word:Word; misses:number; lastAnswer:string; lastWrong:string;
}
export interface MigratableProgress {
  learned:string[]; starred:string[]; words:Record<string,Word>;
  wrongbook:Record<string,MigratableWrong>; review:Record<string,MigratableReview>;
}

/** Resolve legacy scoped IDs without depending on, or shipping, the full word list. */
export function canonicalWordId(id:string,aliases:WordAliases):string {
  const seen=new Set<string>();let next=id;
  while(Object.hasOwn(aliases,next)){
    if(seen.has(next))return id;
    seen.add(next);
    const target=aliases[next];
    if(typeof target!=='string'||!target||target===next)return next;
    next=target;
  }
  return next;
}

/** Keep textbook spelling, pronunciation, accepted answers and unit context. */
export function canonicalizeWord<T extends {id:string}>(word:T,aliases:WordAliases):T {
  const id=canonicalWordId(word.id,aliases);
  return id===word.id?word:{...word,id};
}

const time=(value:string)=>Number.isFinite(Date.parse(value))?Date.parse(value):-Infinity;

/** Idempotent migration. Call inside the store's functional update after aliases load. */
export function migrateProgress<T extends MigratableProgress>(progress:T,aliases:WordAliases,now=new Date()):{progress:T;changed:boolean} {
  const unique=(ids:string[])=>[...new Set(ids.map(id=>canonicalWordId(id,aliases)))];
  const learned=unique(progress.learned),starred=unique(progress.starred);
  const words:Record<string,Word>={};
  for(const [key,word] of Object.entries(progress.words)){
    const id=canonicalWordId(key,aliases),normalized=canonicalizeWord(word,aliases);
    // Prefer an existing contextual cache over a bare generic dictionary entry.
    if(!words[id]?.book||normalized.book)words[id]={...normalized,id};
  }
  const wrongbook:Record<string,MigratableWrong>={};
  for(const [key,entry] of Object.entries(progress.wrongbook)){
    const id=canonicalWordId(key,aliases);
    const normalized={...entry,word:{...canonicalizeWord(entry.word,aliases),id}};
    const prior=wrongbook[id];
    if(!prior)wrongbook[id]=normalized;
    else {
      const latest=time(normalized.lastWrong)>=time(prior.lastWrong)?normalized:prior;
      wrongbook[id]={...latest,misses:Math.min(Number.MAX_SAFE_INTEGER,prior.misses+normalized.misses)};
    }
  }
  for(const [id,entry] of Object.entries(wrongbook))words[id]=entry.word;
  const review:Record<string,MigratableReview>={};
  for(const [key,entry] of Object.entries(progress.review)){
    const id=canonicalWordId(key,aliases),prior=review[id];
    if(!prior)review[id]={...entry};
    else {
      const newer=time(entry.lastReviewed)>time(prior.lastReviewed);
      const tied=time(entry.lastReviewed)===time(prior.lastReviewed);
      const latest=newer||(tied&&time(entry.dueAt)<time(prior.dueAt))?entry:prior;
      // Keep the latest outcome, including a lapse; counters may overlap across IDs.
      review[id]={...latest,reviewCount:Math.max(entry.reviewCount,prior.reviewCount),lapses:Math.max(entry.lapses,prior.lapses)};
    }
  }
  // Under the existing scheduler, a lapse resets step to zero and the next
  // successful review advances it. A stale alias must not re-master that word.
  const currentLearned=learned.filter(id=>{
    const entry=review[id];
    return !entry||!(entry.known===false||(entry.known===undefined&&entry.reviewCount>0&&entry.step===0&&entry.lapses>0));
  });
  const today=new Date(now);today.setHours(0,0,0,0);
  for(const id of currentLearned)if(!review[id]){
    review[id]={step:0,interval:1,reviewCount:0,lapses:0,lastReviewed:new Date(0).toISOString(),dueAt:today.toISOString()};
  }
  const migrated={...progress,learned:currentLearned,starred,words,wrongbook,review};
  const changed=JSON.stringify(migrated)!==JSON.stringify(progress);
  return {progress:changed?migrated:progress,changed};
}
