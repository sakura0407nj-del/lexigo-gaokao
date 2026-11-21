import source from '@/data/fish-words.json';
import type {Word} from '@/lib/learning-types';

// Entries were written for a specific headword and part of speech. Keep that
// sense with the sentence when the learner's card has a broader dictionary gloss.
const usage=new Map(source.words.map(item=>[item.word,item]));
const parts:Record<string,string>={noun:'名词',verb:'动词',adjective:'形容词',adverb:'副词'};
export function wordExample(word:Word):{english:string;note?:string}|undefined {
  if(word.example)return {english:word.example,note:word.exampleZh};
  const entry=usage.get(word.word);
  if(!entry || (word.pos?.length && !word.pos.includes(entry.pos)))return;
  return {english:entry.example,note:`本句中用作${parts[entry.pos]}，意思是「${entry.meaning}」。`};
}
