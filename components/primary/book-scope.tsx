import {useState} from 'react';
import type {PrimaryBook,PrimaryGrade,PrimaryWord} from '@/lib/primary-types';

type Choice={book:string;unit:string};
const all:Choice={book:'',unit:''};
const remembered=new Map<PrimaryGrade,Choice>();
const key=(grade:PrimaryGrade)=>`lexigo.primary.book-scope.g${grade}.v1`;
function readChoice(grade:PrimaryGrade):Choice {
  const cached=remembered.get(grade);
  if(cached)return cached;
  try{
    const value=JSON.parse(localStorage.getItem(key(grade))||'null');
    if(value&&typeof value.book==='string'&&typeof value.unit==='string')return {book:value.book,unit:value.unit};
  }catch{}
  return all;
}
export function useBookScope(grade:PrimaryGrade,books:PrimaryBook[]=[],words:PrimaryWord[]){
  const [choice,setChoice]=useState(()=>readChoice(grade));
  const book=books.find(b=>b.grade===grade&&b.id===choice.book);
  const unit=book?.units.find(u=>u.id===choice.unit);
  const ids=book?new Set((unit?[unit]:book.units).flatMap(u=>u.wordIds)):null;
  const gradeWords=words.filter(w=>w.grade===grade);
  const byId=new Map(gradeWords.map(w=>[w.id,w]));
  const items=ids?Array.from(ids).map(id=>byId.get(id)).filter((w):w is PrimaryWord=>!!w):gradeWords;
  const label=book?[book.title,book.edition,unit?.title].filter(Boolean).join(' · '):`${grade}年级全部词汇`;
  function choose(bookId:string,unitId=''){
    const next={book:bookId,unit:unitId};
    remembered.set(grade,next);setChoice(next);
    try{localStorage.setItem(key(grade),JSON.stringify(next));}catch{}
  }
  return {books,book,unit,items,label,choose};
}
export function BookSelector({scope}:{scope:ReturnType<typeof useBookScope>}){
  if(!scope.books.length)return null;
  const {book,unit,choose}=scope;
  const official=book?.sources.find(s=>s.kind==='official-directory');
  return <div className="primary-book-select">
    <label>学习范围<select className="primary-select" value={book?.id??''} onChange={e=>choose(e.target.value)}>
      <option value="">本年级全部词汇</option>
      {scope.books.map(b=><option key={b.id} value={b.id}>{b.title} · {b.edition}</option>)}
    </select></label>
    {book&&<label>单元<select className="primary-select" value={unit?.id??''} onChange={e=>choose(book.id,e.target.value)}>
      <option value="">全册已核对词目</option>
      {book.units.map(u=><option key={u.id} value={u.id}>{u.title}（{u.wordIds.length} 词）</option>)}
    </select></label>}
    {book&&<div className="primary-book-source"><span>当前范围收录 {scope.items.length} 个词。请对照课本的单元名选版本。</span>
      {official&&<a href={official.url} target="_blank" rel="noreferrer">查看人教社目录</a>}
      {(unit?.note||book.note)&&<details><summary>词目与版本说明</summary><p>{unit?.note||book.note}</p></details>}
    </div>}
    <a className="primary-catalog-download" href="/api/primary/directory.csv" download="LexiGo-PEP-primary-directory.csv">下载各册学习目录（CSV）</a>
  </div>;
}
