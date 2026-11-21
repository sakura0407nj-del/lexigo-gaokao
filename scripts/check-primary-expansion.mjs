import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const read=path=>readFileSync(path,'utf8').replace(/\r\n/g,'\n'),json=path=>JSON.parse(read(path));
const base=json('data/primary-words.json'),extra=json('data/primary-expanded-words.json'),index=json('data/primary-textbook-index.json'),evidence=json('data/primary-textbook-evidence.json'),variants=json('data/primary-spelling-variants.json');
const all=[...base,...extra],byId=new Map(all.map(word=>[word.id,word])),checks=[];
function test(name,fn){try{fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:error.message});}}
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
test('all 240 original entries remain unchanged after line-ending normalization; new IDs are independent',()=>{
  assert.equal(createHash('sha256').update(read('data/primary-words.json')).digest('hex'),'4d0254a7977854817aded975ade350dbc82b4e71a6d82c482ba05a0a3bef00bf');
  assert.equal(base.length,240);assert.ok(extra.length>=300);assert.equal(byId.size,all.length);
  assert.equal(new Set(all.map(word=>word.word.toLowerCase())).size,all.length);
  assert.ok(extra.every(word=>/^px-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(word.id)));
});
test('authored examples use each exact target and its declared sense without empty placeholders',()=>{
  const topics=new Set(['家庭人物','学校学习','家居生活','食物饮品','动物世界','自然天气','身体健康','衣物用品','时间日常','活动爱好','地点出行','情绪特征']);
  const pos=new Set(['noun','verb','adjective','adverb','number','preposition','conjunction','pronoun','determiner','phrase','other']);
  const examples=new Set();
  for(const word of extra){
    assert.ok([3,4,5,6].includes(word.grade),word.id);assert.ok(topics.has(word.topic),word.id);assert.ok(word.pos.length>=1&&word.pos.length<=2);assert.ok(word.pos.every(value=>pos.has(value)),word.id);
    assert.ok(new RegExp(`\\b${escape(word.word)}\\b`,'i').test(word.example),`${word.id}: target missing from example`);
    assert.ok(/[\u3400-\u9fff]/.test(word.translation)&&/[\u3400-\u9fff]/.test(word.exampleZh),word.id);
    assert.ok(word.example.length>=15&&word.example.length<=115,`${word.id}: example length`);
    assert.ok(!examples.has(word.example),`${word.id}: repeated example`);examples.add(word.example);
    for(const field of ['translation','example','exampleZh'])assert.ok(!/\ufffd|\bTODO\b|\bPLACEHOLDER\b/.test(word[field]),word.id);
    assert.equal(word.frequency,undefined);assert.equal(word.rank,undefined);assert.equal(word.book,undefined);assert.equal(word.unit,undefined);
  }
  assert.ok(new Set([3,4,5,6].map(grade=>extra.filter(word=>word.grade===grade).length)).size>1,'No fabricated equal-sized grade buckets');
  assert.deepEqual(extra.find(word=>word.id==='px-over').pos,['adverb','adjective'],'Over in a finished-state predicate has accepted dictionary analyses; exclude it from a single-POS challenge.');
});
test('textbook membership is independent of recommended study grade and keeps existing IDs',()=>{
  const book=index.books.find(book=>book.id==='pep2024-g3-lower');assert.ok(book);
  assert.ok(book.units.find(unit=>unit.id==='u4').wordIds.includes('p5-breakfast'));
  assert.ok(book.units.find(unit=>unit.id==='u1').wordIds.includes('p3-teacher'));
  assert.ok(book.units.find(unit=>unit.id==='u3').wordIds.includes('p4-pencil'));
  assert.ok(!extra.some(word=>word.word==='teacher'||word.word==='pencil'));
});
test('new-series and legacy books stay separate; matching spelling alone does not import the wrong sense',()=>{
  assert.equal(index.books.reduce((count,book)=>count+book.units.length,0),46);
  assert.ok(index.books.every(book=>book.units.every(unit=>unit.wordIds.length>=6)));
  for(const grade of [3,4,5,6])assert.deepEqual(index.books.filter(book=>book.grade===grade).map(book=>book.term).sort(),['lower','upper']);
  assert.equal(index.books.find(book=>book.id==='pep2024-g6-upper').editionId,'pep-2024');
  assert.equal(index.books.find(book=>book.id==='pep-legacy-g6-lower').editionId,'pep-legacy');
  const unit=(book,id)=>index.books.find(item=>item.id===book).units.find(item=>item.id===id);
  assert.ok(!unit('pep2024-g6-upper','u3').wordIds.includes('px-may'),'May the month is not modal may');
  assert.ok(!unit('pep2024-g6-upper','u3').wordIds.includes('p3-cold'),'cold weather is not a cold illness');
  assert.ok(!unit('pep2024-g4-upper','u4').wordIds.includes('p4-cook'),'cook the worker is not the verb card');
  assert.ok(unit('pep2024-g4-upper','u1').wordIds.includes('p4-cook'),'the cooking action remains valid in the home unit');
  assert.ok(!unit('pep2024-g4-lower','u6').wordIds.includes('p3-milk'),'milking is not a milk-drink card');
  for(const id of ['px-light','p4-cool','p3-run'])assert.ok(!unit('pep2024-g6-upper','u6').wordIds.includes(id));
  assert.ok(unit('pep2024-g6-upper','u6').wordIds.includes('px-electricity'));
});
test('every public unit points to actual authored words and explicit non-directory word evidence',()=>{
  const sources=new Map(index.sources.map(source=>[source.id,source]));
  assert.equal(sources.size,index.sources.length);assert.equal(new Set(index.books.map(book=>book.id)).size,index.books.length);
  for(const source of sources.values())assert.ok(/^https:\/\//.test(source.url),source.id);
  for(const book of index.books){
    assert.ok(['upper','lower'].includes(book.term));assert.ok(index.editions.some(edition=>edition.id===book.editionId));
    assert.ok(['verified-partial','pending'].includes(book.status));assert.ok(book.note?.length>=10,book.id);
    assert.equal(new Set(book.units.map(unit=>unit.id)).size,book.units.length);
    for(const source of book.sourceIds)assert.ok(sources.has(source),source);
    for(const unit of book.units){
      assert.equal(new Set(unit.wordIds).size,unit.wordIds.length,`${book.id}/${unit.id}`);
      assert.equal(unit.verifiedCount,unit.wordIds.length);assert.ok(unit.wordIds.every(id=>byId.has(id)),`${book.id}/${unit.id}`);
      assert.ok(unit.sourceIds?.every(id=>sources.has(id)),`${book.id}/${unit.id}: missing source`);
      if(unit.wordIds.length)assert.ok(unit.sourceIds.some(id=>!['official-directory','official-edition'].includes(sources.get(id).kind)),`${book.id}/${unit.id}: title-only evidence is insufficient`);
    }
    assert.equal(book.verifiedCount,new Set(book.units.flatMap(unit=>unit.wordIds)).size);
  }
  assert.match(index.note,/部分/);assert.match(index.note,/完整/);
});
test('English spelling variants are explicit, do not rename old IDs or accept synonyms as spelling',()=>{
  for(const [id,accepted] of Object.entries(variants)){
    const word=byId.get(id);assert.ok(word,id);assert.ok(accepted.includes(word.word.toLowerCase()),id);
    assert.equal(new Set(accepted).size,accepted.length);assert.ok(accepted.every(value=>typeof value==='string'&&value.trim()));
  }
  assert.deepEqual(variants['px-colour'],['colour','color']);assert.deepEqual(variants['px-favourite'],['favourite','favorite']);
  assert.deepEqual(variants['p5-neighbor'],['neighbour','neighbor']);assert.deepEqual(variants['p5-practice'],['practice','practise']);
  assert.equal(variants['p4-trousers'],undefined);assert.equal(variants['p5-autumn'],undefined);
  for(const word of extra)if(variants[word.id])assert.deepEqual(word.accepted,variants[word.id]);
});
test('source rebuild reproduces shipped JSON and exports only learning facts and authored examples',()=>{
  mkdirSync('work/checks',{recursive:true});
  execFileSync(process.execPath,['scripts/build-primary-expansion.mjs','--check','--csv','work/checks/primary-index.csv'],{stdio:'pipe'});
  const csv=read('work/checks/primary-index.csv');assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"p3-teacher"'));
  assert.ok(!csv.includes('课文原文')&&!csv.includes('data:audio'));
  assert.equal(evidence.books.length,index.books.length);
});
test('Windows CRLF checkouts reproduce the same data without rewriting original files',()=>{
  const cwd='work/checks/primary-crlf';mkdirSync(cwd+'/data',{recursive:true});
  for(const name of ['primary-words.json','primary-expanded-source.tsv','primary-textbook-evidence.json','primary-expanded-words.json','primary-textbook-index.json','primary-spelling-variants.json'])writeFileSync(cwd+'/data/'+name,read('data/'+name).replace(/\n/g,'\r\n'));
  execFileSync(process.execPath,[resolve('scripts/build-primary-expansion.mjs'),'--check'],{cwd,stdio:'pipe'});
});
console.log(JSON.stringify({passed:checks.filter(check=>check.passed).length,failed:checks.filter(check=>!check.passed).length,base:base.length,added:extra.length,total:all.length,books:index.books.map(book=>({id:book.id,status:book.status,words:book.verifiedCount})),checks},null,2));
if(checks.some(check=>!check.passed))process.exitCode=1;
