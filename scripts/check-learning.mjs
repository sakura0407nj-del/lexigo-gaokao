import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
mkdirSync('work',{recursive:true});
await build({entryPoints:['lib/learning-core.ts'],bundle:true,platform:'node',format:'cjs',outfile:'work/core-check.cjs'});
const {normalizeAnswer,gradePaper,hideAnswers,isSafeImage,readModelJson}=createRequire(import.meta.url)('../work/core-check.cjs');
const read=name=>JSON.parse(readFileSync(`data/${name}.json`,'utf8'));
const words=read('words'),original=read('papers'),past=read('past-papers'),papers=[...original,...past];
assert.ok(words.length>=3500);assert.equal(new Set(words.map(w=>w.id)).size,words.length);
assert.ok(words.every(w=>w.word&&w.translation&&['high','medium','low'].includes(w.frequency)));
const textbook=read('textbooks');
assert.equal(textbook.books.length,7);assert.equal(textbook.books.reduce((n,b)=>n+b.units.length,0),36);
for(const b of textbook.books)for(const u of b.units)for(const w of u.words){assert.ok(w.translation&&!/^(无|none|暂无|待补充)$/.test(w.translation),w.word);assert.equal(w.book,b.id);assert.equal(w.unit,u.id);}
assert.ok(original.length>=16);assert.equal(new Set(papers.map(p=>p.id)).size,papers.length);
for(const p of papers){
  assert.ok(p.passage.length>200,p.id);assert.equal(new Set(p.questions.map(q=>q.id)).size,p.questions.length,p.id);
  if(p.origin==='original')assert.equal(p.questions.length,{reading:4,grammar:10,seven:5,cloze:15}[p.type],p.id);
  for(const q of p.questions){
    assert.ok(q.answer&&q.explanation?.length>=8,`${p.id}/${q.id}`);assert.ok(q.points>0);
    if(p.type==='seven'){assert.equal(p.options.length,7);assert.match(q.answer,/^[A-G]$/)}
    else if(p.type!=='grammar'){assert.equal(q.options.length,4,`${p.id}/${q.id}`);assert.match(q.answer,/^[A-D]$/)}
    if(p.origin==='original'&&p.type!=='reading')assert.ok(p.passage.includes(`[${q.id}]`),`${p.id} blank ${q.id}`);
  }
  const all=Object.fromEntries(p.questions.map(q=>[q.id,q.answer.split('|')[0]]));
  const grade=gradePaper(p,all);assert.equal(grade.score,grade.maxScore,p.id);assert.equal(gradePaper(p,{}).score,0,p.id);
  assert.ok(hideAnswers(p).questions.every(q=>!('answer'in q)&&!('explanation'in q)&&!('evidence'in q)));
}
assert.equal(normalizeAnswer('  I’m  READY '),"i'm ready");
assert.equal(gradePaper({questions:[{id:'1',answer:'color|colour',points:1,explanation:'variant'}]},{'1':' Colour '}).score,1);
assert.equal(isSafeImage('data:image/svg+xml;base64,PHN2Zy8+'),false);
assert.equal(isSafeImage('data:image/png;base64,YWJjZA=='),false);
assert.equal(isSafeImage('data:image/png;base64,iVBORw0KGgo='),true);
assert.deepEqual(readModelJson('```json\n{"ok":true}\n```'),{ok:true});
console.log(JSON.stringify({vocabulary:words.length,originalUnits:original.length,pastUnits:past.length,questions:papers.reduce((n,p)=>n+p.questions.length,0),passed:'answer grading, alternatives, concealed keys, question structure, image validation, JSON parsing'}));
