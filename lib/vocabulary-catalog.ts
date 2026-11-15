import genericData from '../data/words.json';
import textbookData from '../data/textbooks.json';
import topicData from '../data/vocabulary-topics.json';
import type { Frequency, Word } from './learning-types';

export type VocabularyPos = 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition' | 'conjunction' | 'pronoun' | 'determiner' | 'number' | 'phrase' | 'other';
export type VocabularySource = 'gaokao' | 'textbook' | 'all';
export type VocabularySort = 'frequency' | 'alpha' | 'textbook';
export type VocabularyBand = Frequency | 'unknown';
export interface TextbookMembership { bookId: string; bookTitle: string; unitId: string; unitTitle: string; originalId: string }
export type CatalogWord = Word & { pos: VocabularyPos[]; topics: string[]; textbooks: TextbookMembership[]; inGaokao: boolean; aliasIds: string[]; frequencyKnown:boolean; frequencyBand:VocabularyBand };
export interface VocabularyQuery {
  band?: string; q?: string; page?: number | string; limit?: number | string;
  book?: string; unit?: string; pos?: string; topic?: string;
  source?: VocabularySource | string; sort?: VocabularySort | string;
  ids?: string[]; sample?: number | string;
}

const positions: {id: VocabularyPos; label: string}[] = [
  {id:'noun',label:'名词'}, {id:'verb',label:'动词'}, {id:'adjective',label:'形容词'},
  {id:'adverb',label:'副词'}, {id:'preposition',label:'介词'}, {id:'conjunction',label:'连词'},
  {id:'pronoun',label:'代词'}, {id:'determiner',label:'冠词 / 限定词'},
  {id:'number',label:'数词'}, {id:'phrase',label:'短语 / 多词表达'}, {id:'other',label:'其他 / 专名'},
];
const bands: VocabularyBand[]=['high','medium','low','unknown'];
const labels=(topicData as unknown as {labels: Record<string,string[]>}).labels;
export const vocabularyNote='词库默认展示 ECDICT 的 3,677 个 gk 标签词条；选择教材时会加入该册特有的词语、短语和专名。高/中/低频来自一般英语语料排名，不是高考试卷出现次数；缺少排名的词单列“未标频”，不据此判断词语是否少见。词性根据词典标注整理，主题按释义归类，一词可属于多类。';
const canonical=(value:string)=>value.normalize('NFKC').trim().toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g,' ');
const searchKey=(value:string)=>canonical(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
export function frequencyMetadata(word:Word):{frequencyKnown:boolean;frequencyBand:VocabularyBand}{
  const frequencyKnown=Number.isFinite(word.rank)&&word.rank>0;
  return {frequencyKnown,frequencyBand:frequencyKnown?word.frequency:'unknown'};
}

function wordPositions(word:Word):VocabularyPos[]{
  const text=word.translation.toLowerCase();
  const result:VocabularyPos[]=[];
  const patterns:[VocabularyPos,RegExp][]=[
    ['noun',/(?:^|[\s;,；，/(])(?:n|pl)\./],['verb',/\b(?:v|vi|vt|vbl|aux)\./],
    ['adjective',/\b(?:a|adj)\./],['adverb',/\b(?:ad|adv)\./],['preposition',/\bprep\./],
    ['conjunction',/\b(?:conj|cnj)\./],['pronoun',/\bpron\./],['determiner',/\b(?:art|det)\./],['number',/\bnum\./],
  ];
  for(const [id,pattern] of patterns)if(pattern.test(text))result.push(id);
  const proper=/人名|地名|国家名|城市名|作品名|画作名|人物姓名/.test(word.translation);
  if(/\s/.test(word.word)&&!proper)result.push('phrase');
  return result.length?result:['other'];
}

const byKey=new Map<string,CatalogWord>();
const idKeys=new Map<string,string>();
const bookKeys=new Map<string,Set<string>>();
const unitKeys=new Map<string,Set<string>>();
const bookOrder=new Map<string,Map<string,number>>();
const textbookVariants=new Map<string,Map<string,Word>>();
// The upstream case-insensitive dictionary combines these distinct senses.
// Keep the lower-case textbook meanings and pronunciation in their own context.
function textbookContext(word:Word):Word {
  if(word.book==='pep2019-compulsory-3'&&word.unit==='u3'&&word.word==='china')return {...word,translation:'n. 瓷；瓷器',phonetic:'ˈtʃaɪnə'};
  if(word.book==='pep2019-optional-3'&&word.unit==='u5'&&word.word==='polish')return {...word,translation:'vt. 修改；润色；擦亮\nn. 擦光剂；擦亮',phonetic:'ˈpɒlɪʃ'};
  return word;
}
const core=(genericData as Word[]).map(word=>{
  const key=canonical(word.word);
  const entry:CatalogWord={...word,...frequencyMetadata(word),pos:wordPositions(word),topics:labels[key]||[],textbooks:[],inGaokao:true,aliasIds:[word.id]};
  byKey.set(key,entry);idKeys.set(word.id,key);return entry;
});
for(const book of textbookData.books){
  const seen=new Set<string>();bookKeys.set(book.id,seen);
  const order=new Map<string,number>();bookOrder.set(book.id,order);
  const variants=new Map<string,Word>();textbookVariants.set(book.id,variants);
  for(const unit of book.units){
    const unitSeen=new Set<string>();unitKeys.set(`${book.id}/${unit.id}`,unitSeen);
    for(const raw of unit.words){
      const word=textbookContext(raw as Word),key=canonical(word.word);
      let entry=byKey.get(key);
      if(!entry){entry={...word,...frequencyMetadata(word),pos:wordPositions(word),topics:labels[key]||[],textbooks:[],inGaokao:false,aliasIds:[word.id]};byKey.set(key,entry);}
      idKeys.set(word.id,key);
      if(!entry.aliasIds.includes(word.id))entry.aliasIds.push(word.id);
      if(!entry.textbooks.some(m=>m.bookId===book.id&&m.unitId===unit.id))entry.textbooks.push({bookId:book.id,bookTitle:book.title,unitId:unit.id,unitTitle:unit.title,originalId:word.id});
      if(!order.has(key))order.set(key,order.size);
      if(!variants.has(key))variants.set(key,word);
      variants.set(`${unit.id}/${key}`,word);
      seen.add(key);unitSeen.add(key);
    }
  }
}
const combined=[...byKey.values()];
const aliases:Record<string,string>={};
for(const [id,key] of idKeys){const stable=byKey.get(key)!.id;if(id!==stable)aliases[id]=stable;}
/** Only changed IDs: small enough for a one-time progress migration request. */
export function aliasIndex(){return aliases;}
function inTextbookContext(entry:CatalogWord,book:string,unit='all'):CatalogWord {
  const variants=textbookVariants.get(book),key=canonical(entry.word);
  const contextual=variants?.get(`${unit}/${key}`)||variants?.get(key);
  return contextual?{...entry,...contextual,...frequencyMetadata(contextual),id:entry.id,pos:wordPositions(contextual),topics:entry.topics,textbooks:entry.textbooks,inGaokao:entry.inGaokao,aliasIds:entry.aliasIds}:entry;
}
const allTextbook=combined.filter(word=>word.textbooks.length).map(word=>inTextbookContext(word,word.textbooks[0].bookId,word.textbooks[0].unitId));
const books=textbookData.books.map(book=>({
  id:book.id,title:book.title,edition:book.edition,wordCount:bookKeys.get(book.id)?.size??0,entryCount:book.wordCount,
  units:book.units.map(unit=>({id:unit.id,title:unit.title,count:unitKeys.get(`${book.id}/${unit.id}`)?.size??0,entryCount:unit.count})),
}));
const topics=(topicData.topics as {id:string;label:string}[]);
function countsOf(words:CatalogWord[]){return Object.fromEntries(bands.map(band=>[band,words.filter(word=>word.frequencyBand===band).length])) as Record<VocabularyBand,number>}
function posCounts(words:CatalogWord[]){return Object.fromEntries(positions.map(pos=>[pos.id,words.filter(word=>word.pos.includes(pos.id)).length]))}
function topicCounts(words:CatalogWord[]){return Object.fromEntries(topics.map(topic=>[topic.id,words.filter(word=>word.topics.includes(topic.id)).length]))}
const integer=(value:unknown,fallback:number,max:number)=>Math.min(max,Math.max(1,Number.parseInt(String(value??''),10)||fallback));

export function metadata(){
  return {
    total:core.length,combinedWords:combined.length,textbookEntries:textbookData.books.reduce((sum,book)=>sum+book.wordCount,0),textbookWords:allTextbook.length,
    books,counts:countsOf(core),pos:positions.map(pos=>({...pos,count:core.filter(word=>word.pos.includes(pos.id)).length})),
    topics:topics.map(topic=>({...topic,count:core.filter(word=>word.topics.includes(topic.id)).length})),
    sources:[{id:'gaokao',label:'高考词库',count:core.length},{id:'textbook',label:'七册教材',count:allTextbook.length},{id:'all',label:'全部词条',count:combined.length}],
    topicNote:topicData.note,note:vocabularyNote,
  };
}

export function searchWords(params:VocabularyQuery={}){
  const book=params.book||'all',unit=params.unit||'all',hasBook=book!=='all';
  const source=params.source==='all'?'all':params.source==='textbook'?'textbook':'gaokao';
  const query=searchKey(params.q||'').slice(0,100);
  let pool=hasBook?combined:source==='all'?combined:source==='textbook'?allTextbook:core;
  if(hasBook){
    const keys=unit==='all'?bookKeys.get(book):unitKeys.get(`${book}/${unit}`);
    pool=pool.filter(word=>keys?.has(canonical(word.word))).map(entry=>inTextbookContext(entry,book,unit));
  }
  if(params.ids){const keys=new Set(params.ids.map(id=>idKeys.get(id)).filter(Boolean));pool=pool.filter(word=>keys.has(canonical(word.word)));}
  if(query)pool=pool.filter(word=>searchKey(word.word).includes(query)||searchKey(word.translation).includes(query)||(word.accepted||[]).some(v=>searchKey(v).includes(query)));
  const pos=params.pos||'all',topic=params.topic||'all';
  const byPos=pool.filter(word=>pos==='all'||word.pos.includes(pos as VocabularyPos));
  const byTopic=pool.filter(word=>topic==='all'||word.topics.includes(topic));
  const scoped=byPos.filter(word=>topic==='all'||word.topics.includes(topic));
  const counts=countsOf(scoped);
  const matchesBand=(word:CatalogWord)=>!params.band||params.band==='all'||word.frequencyBand===params.band;
  const filtered=scoped.filter(matchesBand);
  const sort=params.sort|| (hasBook?'textbook':'frequency');
  filtered.sort((a,b)=>{
    if(sort==='textbook'&&hasBook){const order=bookOrder.get(book);return (order?.get(canonical(a.word))??Infinity)-(order?.get(canonical(b.word))??Infinity);}
    if(sort==='alpha'||sort==='textbook')return a.word.localeCompare(b.word,'en',{sensitivity:'base'});
    return (a.rank||Infinity)-(b.rank||Infinity)||a.word.localeCompare(b.word,'en',{sensitivity:'base'});
  });
  const limit=integer(params.limit,30,200),pages=Math.max(1,Math.ceil(filtered.length/limit)),page=Math.min(integer(params.page,1,100000),pages);
  let items=filtered.slice((page-1)*limit,page*limit);
  if(params.sample!==undefined){
    const shuffled=[...filtered];for(let index=shuffled.length-1;index>0;index--){const random=globalThis.crypto?.getRandomValues(new Uint32Array(1))[0]??Math.floor(Math.random()*4294967296);const selected=random%(index+1);[shuffled[index],shuffled[selected]]=[shuffled[selected],shuffled[index]];}
    items=shuffled.slice(0,integer(params.sample,10,50));
  }
  return {items,total:filtered.length,page,pages,counts,note:vocabularyNote,
    facets:{pos:posCounts(byTopic.filter(matchesBand)),topics:topicCounts(byPos.filter(matchesBand))},
    scope:hasBook?`${books.find(item=>item.id===book)?.title||book}${unit!=='all'?` · ${books.find(item=>item.id===book)?.units.find(item=>item.id===unit)?.title||unit}`:''}`:source==='all'?'全部词条':source==='textbook'?'七册教材':'高考词库',
  };
}
