import data from '@/data/textbooks.json';
import {json} from '@/lib/learning-server';
import {searchWords} from '@/lib/vocabulary-catalog';
export function GET(req:Request){
  const params=new URL(req.url).searchParams,book=data.books.find(b=>b.id===params.get('book'));
  if(!book)return json({error:'请选择有效的教材册次。'},400);
  const ids=(params.get('units')||'all').split(','),units=book.units.filter(u=>ids.includes('all')||ids.includes(u.id));
  if(!units.length)return json({error:'请至少选择一个单元。'},400);
  // Use the same reviewed textbook context and stable IDs as the vocabulary view.
  // Raw source entries remain intact so legacy IDs can still resolve through aliasIndex.
  const seen=new Set<string>();let items=units.flatMap(u=>searchWords({book:book.id,unit:u.id,limit:200,sort:'textbook'}).items).filter(w=>{if(seen.has(w.id)||params.get('includePhrases')==='0'&&/\s/.test(w.word))return false;seen.add(w.id);return true});
  const total=items.length;
  if(params.get('order')==='random'){items=[...items];for(let i=items.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[items[i],items[j]]=[items[j],items[i]]}}
  const n=params.get('count')==='all'?500:Math.min(500,Math.max(1,Number.parseInt(params.get('count')||'10',10)||10));
  return json({items:items.slice(0,n),total,scope:`${book.title} · ${units.length===book.units.length?'全册':units.map(u=>u.title).join('、')}`,note:data.note});
}
