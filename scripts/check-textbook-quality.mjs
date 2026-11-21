import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
mkdirSync('work/checks',{recursive:true});
await build({entryPoints:['lib/public-router.ts','lib/vocabulary-catalog.ts','lib/dictation-text.ts'],outdir:'work/checks/textbook-quality',bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},logLevel:'silent'});
const {handlePublicRequest}=require('../work/checks/textbook-quality/public-router.cjs');
const {searchWords,aliasIndex}=require('../work/checks/textbook-quality/vocabulary-catalog.cjs');
const {dictationSpeechText}=require('../work/checks/textbook-quality/dictation-text.cjs');
const data=JSON.parse(readFileSync('data/textbooks.json','utf8'));
const glosses=JSON.parse(readFileSync('data/textbook-glosses.json','utf8'));
const all=data.books.flatMap(book=>book.units.flatMap(unit=>unit.words));
let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
async function get(path){const response=await handlePublicRequest(new Request('https://lexigo.example'+path));assert.equal(response.status,200,path);return response.json();}

await check('reviewed meanings propagate from source entries to real catalog and public dictation',async()=>{
  const selected=['fifa','make it','make a proposal','straighten up','get involved in','shopping mall','at last','prefer ... to ...','no matter who','no matter what','sign up','in charge of','date back','clean up','check out','even though','even if'];
  for(const spelling of selected){
    const raw=all.filter(word=>word.word.toLowerCase()===spelling);assert.ok(raw.length,spelling);
    for(const word of raw){
      assert.equal(word.translation,glosses[spelling],word.id);
      const catalog=searchWords({book:word.book,unit:word.unit,q:word.word,limit:200}).items.find(item=>item.word===word.word);assert.ok(catalog,word.id);assert.equal(catalog.translation,glosses[spelling]);
      const unit=await get(`/api/dictation?book=${word.book}&units=${word.unit}&count=all&order=list`);
      const item=unit.items.find(item=>item.word===word.word);assert.ok(item,word.id);assert.equal(item.translation,glosses[spelling]);assert.equal(item.id,catalog.id);
    }
  }
  assert.ok(!all.find(word=>word.word==='FIFA').translation.includes('核'));assert.ok(!all.find(word=>word.word==='make it').translation.includes('性交'));
});
await check('unknown dictionary POS markers are removed without inventing a replacement category',()=>{
  assert.ok(all.every(word=>!/(?:^|[\n;；])\s*(?:na|un)\./i.test(word.translation)));
  assert.ok(all.every(word=>word.translation.trim().length>0));
  assert.equal(all.find(word=>word.word==='Los Angeles').translation,'洛杉矶');
  assert.equal(searchWords({book:'pep2019-compulsory-1',q:'even though'}).items[0].pos.includes('conjunction'),true);
});
await check('every unit dictation pool is unique and UI counts equal the actual returned pool',async()=>{
  const metadata=await get('/api/textbooks');assert.equal(metadata.books.length,7);
  for(const book of data.books)for(const unit of book.units){
    const response=await get(`/api/dictation?book=${book.id}&units=${unit.id}&count=all&order=list`);
    assert.equal(response.items.length,response.total);assert.equal(new Set(response.items.map(word=>word.id)).size,response.total,`${book.id}/${unit.id}`);
    const list=metadata.books.find(item=>item.id===book.id).units.find(item=>item.id===unit.id);assert.equal(list.count,response.total);
    const catalog=searchWords({book:book.id,unit:unit.id,limit:200,sort:'textbook'});assert.deepEqual(response.items.map(word=>[word.id,word.word,word.translation]),catalog.items.map(word=>[word.id,word.word,word.translation]));
  }
});
await check('legacy repeated inflection IDs resolve to the same retained word without deleting raw entries',async()=>{
  const aliases=aliasIndex();
  for(const [word,ids] of [['swept',['pep2019-compulsory-1:u4:59','pep2019-compulsory-1:u4:60']],['struck',['pep2019-compulsory-1:u4:64','pep2019-compulsory-1:u4:65']]]){
    assert.ok(ids.every(id=>all.some(item=>item.id===id&&item.word===word)));
    const canonical=ids.map(id=>aliases[id]??id);assert.equal(canonical[0],canonical[1]);
    const pool=await get('/api/dictation?book=pep2019-compulsory-1&units=u4&count=all');assert.equal(pool.items.filter(item=>item.word===word).length,1);assert.equal(pool.items.find(item=>item.word===word).id,canonical[0]);
  }
  assert.equal(all.length,2731);assert.equal(new Set(all.map(word=>word.id)).size,2731);
});
await check('context-specific meanings and phrase selection survive the shared catalog path',async()=>{
  const china=(await get('/api/dictation?book=pep2019-compulsory-3&units=u3&count=all')).items.find(word=>word.word==='china');assert.ok(china.translation.includes('瓷器'));assert.ok(!china.translation.includes('中国'));
  const polish=(await get('/api/dictation?book=pep2019-optional-3&units=u5&count=all')).items.find(word=>word.word==='polish');assert.ok(polish.translation.includes('润色'));assert.ok(!polish.translation.includes('波兰'));
  const single=await get('/api/dictation?book=pep2019-compulsory-1&units=u3&count=all&includePhrases=0');assert.ok(single.items.every(word=>!/^\s|\s/.test(word.word)));assert.ok(!single.items.some(word=>word.word==='make it'));
});
await check('speech skips placeholder dots but preserves actual text, spelling and answer data',()=>{
  const before=JSON.stringify(data);
  for(const [input,expected] of [['leave ... alone','leave alone'],['compare … with …','compare with'],['prefer ... to ...','prefer to'],['in addition to sb.','in addition to somebody'],["on sb.'s behalf","on somebody's behalf"],['proceed to sth.','proceed to something'],['3.14','3.14'],['Dr. Brown','Dr. Brown'],['FIFA','FIFA'],['well-known','well-known']])assert.equal(dictationSpeechText(input),expected,input);
  for(const word of all.filter(word=>/\.{2,}|…/.test(word.word)))assert.ok(!/\.{2,}|…/.test(dictationSpeechText(word.word)),word.id);
  assert.equal(JSON.stringify(data),before);
});
await check('50-card sampling is not confused with the 30-item pagination default',async()=>{
  const response=await get('/api/words?sample=50&limit=50');assert.equal(response.items.length,50);assert.equal(new Set(response.items.map(word=>word.id)).size,50);
});
console.log(JSON.stringify({passed:checks,rawEntries:all.length,units:36,legacyIdsRetained:true}));
