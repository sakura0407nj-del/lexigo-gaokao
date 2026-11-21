import original from '../data/primary-words.json';
import expanded from '../data/primary-expanded-words.json';
import directory from '../data/primary-textbook-index.json';
import variants from '../data/primary-spelling-variants.json';
import type {PrimaryBook,PrimaryGrade,PrimaryWord} from './primary-types';
import {primaryCsv} from './primary-csv';

type IndexBook={id:string;grade:number;term:string;editionId:string;title?:string;status:string;note?:string;sourceIds:string[];units:{id:string;title:string;wordIds:string[];sourceIds?:string[];note?:string}[]};
const editionNames=new Map(directory.editions.map(e=>[e.id,e.title]));
const sourcesById=new Map(directory.sources.map(s=>[s.id,{title:s.title,url:s.url,kind:s.kind}]));
const lookupSources=(ids:string[])=>ids.flatMap(id=>sourcesById.has(id)?[sourcesById.get(id)!]:[]);
const acceptedSpellings:Record<string,string[]>=variants;
const words:PrimaryWord[]=([...original,...expanded] as unknown as PrimaryWord[]).map(raw=>({
  ...raw,...(acceptedSpellings[raw.id]?{accepted:acceptedSpellings[raw.id]}:{}),
  phonetic:raw.phonetic||'',frequency:'high',frequencyKnown:false,frequencyBand:'unknown',rank:0,inGaokao:false
}));
const byId=new Map(words.map(w=>[w.id,w]));
export const primaryBooks:PrimaryBook[]=(directory.books as IndexBook[]).map(book=>({
  id:book.id,grade:book.grade as PrimaryGrade,title:['三','四','五','六'][book.grade-3]+'年级'+(book.term==='upper'?'上册':'下册'),
  edition:editionNames.get(book.editionId)||book.editionId,status:book.status,
  sources:lookupSources(book.sourceIds),note:book.note,
  units:book.units.map(unit=>({id:unit.id,title:unit.title,wordIds:unit.wordIds,sources:lookupSources(unit.sourceIds||[]),note:unit.note}))
}));

export function primaryGradeCatalog(grade:PrimaryGrade){
  const books=primaryBooks.filter(book=>book.grade===grade);
  const ids=new Set(words.filter(word=>word.grade===grade).map(word=>word.id));
  for(const book of books)for(const unit of book.units)for(const id of unit.wordIds)ids.add(id);
  // A word can be revisited in another grade. Keep its stable ID inside each grade's progress store.
  const items=Array.from(ids,id=>({...byId.get(id)!,grade}));
  return {items,grade,books,total:items.length,topics:[...new Set(items.map(word=>word.topic))],
    note:'年级词库包含按主题编排的练习词和已收录的教材词目。选择册次可查看对应单元与来源。'};
}

export function primaryDirectoryCsv(grade?:PrimaryGrade){
  const rows=[['版本','册次','单元','英文词目','中文释义','收录情况','目录参考','词目参考']];
  for(const book of primaryBooks.filter(book=>!grade||book.grade===grade)){
    const prefix=[book.edition,book.title],source=book.sources.find(s=>s.kind==='official-directory')?.url||book.sources[0]?.url||'';
    if(!book.units.length)rows.push([...prefix,'','','','待核对单元',source,'']);
    for(const unit of book.units){
      const evidence=unit.sources?.filter(s=>s.url!==source).map(s=>s.url).join(' ')||'';
      if(!unit.wordIds.length)rows.push([...prefix,unit.title,'','','已收录单元名，词目待核对',source,evidence]);
      for(const id of unit.wordIds){
        const word=byId.get(id)!;
        rows.push([...prefix,unit.title,word.word,word.translation,'本单元已收录的部分学习词目',source,evidence]);
      }
    }
  }
  return primaryCsv(rows);
}

export function primaryWordlistCsv(grade?:PrimaryGrade){
  const sorted=words.filter(w=>!grade||w.grade===grade).sort((a,b)=>a.grade-b.grade||a.word.localeCompare(b.word,'en'));
  return primaryCsv([['建议年级','主题','英文词目','中文释义','英文例句','中文对照'],
    ...sorted.map(w=>[String(w.grade),w.topic,w.word,w.translation,w.example,w.exampleZh])]);
}
