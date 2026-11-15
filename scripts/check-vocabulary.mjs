import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const ts=require(process.env.VOCABULARY_TYPESCRIPT_PATH||'typescript');

const read=name=>JSON.parse(readFileSync(`data/${name}.json`,'utf8'));
const generic=read('words'),textbooks=read('textbooks'),topics=read('vocabulary-topics');
const canonical=value=>value.normalize('NFKC').trim().toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g,' ');
mkdirSync('work',{recursive:true});
const output='work/vocabulary-check.mjs';
const compiled=ts.transpileModule(readFileSync('lib/vocabulary-catalog.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
writeFileSync(output,compiled.replace(/(from\s+['"][^'"]+\.json['"])(;)/g,'$1 with {type:"json"}$2'));
const {metadata,searchWords}=await import(pathToFileURL(resolve(output)).href+`?t=${Date.now()}`);
const meta=metadata();
assert.equal(meta.total,3677);
assert.equal(meta.combinedWords,5084);
assert.equal(meta.textbookEntries,2731);
assert.equal(meta.books.length,7);
assert.equal(meta.books.reduce((sum,book)=>sum+book.units.length,0),36);
assert.equal(searchWords().total,3677);
assert.equal(searchWords({source:'all'}).total,5084);
assert.equal(searchWords({source:'textbook'}).total,meta.textbookWords);
assert.equal(meta.counts.unknown,22);
assert.equal(Object.values(meta.counts).reduce((sum,count)=>sum+count,0),meta.total);
assert.equal(searchWords({band:'unknown'}).total,22);
assert.equal(searchWords({band:'low'}).total,meta.counts.low);
assert.ok(searchWords({source:'all',band:'low',limit:200}).items.every(word=>word.rank>0&&word.frequencyKnown&&word.frequencyBand==='low'));
assert.ok(searchWords({source:'all',band:'unknown',limit:200}).items.every(word=>word.rank===0&&!word.frequencyKnown&&word.frequencyBand==='unknown'));
const actually=searchWords({book:'pep2019-compulsory-1',q:'actually'}).items.find(word=>word.word==='actually');
assert.equal(actually.frequencyBand,'unknown');assert.equal(actually.frequencyKnown,false);
assert.equal(searchWords({book:'pep2019-compulsory-1',q:'actually',band:'low'}).total,0);
assert.equal(searchWords({book:'missing-book'}).total,0);
assert.equal(searchWords({book:meta.books[0].id,unit:'missing-unit'}).total,0);
assert.equal(searchWords({ids:[]}).total,0);
assert.equal(searchWords({ids:['missing-id']}).total,0);
assert.equal(searchWords({limit:999}).items.length,200);
assert.equal(searchWords({page:999999}).page,searchWords().pages);

const stableIds=new Map(generic.map(word=>[canonical(word.word),word.id]));
const globalKeys=new Set(generic.map(word=>canonical(word.word)));
let membershipChecks=0,extraChecks=0;
for(const book of textbooks.books){
  const bookKeys=new Set(book.units.flatMap(unit=>unit.words.map(word=>canonical(word.word))));
  assert.equal(searchWords({book:book.id}).total,bookKeys.size);
  assert.equal(meta.books.find(item=>item.id===book.id).wordCount,bookKeys.size);
  for(const unit of book.units){
    const unitKeys=new Set(unit.words.map(word=>canonical(word.word)));
    const result=searchWords({book:book.id,unit:unit.id,limit:200});
    assert.equal(result.total,unitKeys.size);
    assert.equal(result.items.length,unitKeys.size);
    assert.deepEqual(new Set(result.items.map(word=>canonical(word.word))),unitKeys);
    for(const word of result.items){
      assert.ok(word.textbooks.some(item=>item.bookId===book.id&&item.unitId===unit.id));
      if(stableIds.has(canonical(word.word)))assert.equal(word.id,stableIds.get(canonical(word.word)));
      else {assert.ok(word.aliasIds.includes(word.id));assert.equal(word.inGaokao,false);extraChecks++;}
      membershipChecks++;
    }
    for(const word of unit.words){
      globalKeys.add(canonical(word.word));
      const alias=searchWords({source:'all',ids:[word.id]});
      assert.equal(alias.total,1,`Scoped progress ID not resolved: ${word.id}`);
      assert.equal(canonical(alias.items[0].word),canonical(word.word));
    }
  }
}

const polish=searchWords({book:'pep2019-optional-3',unit:'u5',q:'polish'}).items[0];
assert.equal(polish.word,'polish');assert.equal(polish.id,'polish');assert.equal(polish.phonetic,'ˈpɒlɪʃ');
assert.ok(polish.translation.includes('润色'));assert.ok(!polish.translation.includes('波兰'));
assert.equal(searchWords({book:'pep2019-optional-3',unit:'u5',q:'polish',pos:'adjective'}).total,0);
assert.ok(searchWords({book:'pep2019-compulsory-3',unit:'u3',q:'瓷器'}).items.some(word=>word.word==='china'));
assert.ok(searchWords({book:'pep2019-compulsory-3',q:'cafe'}).items.some(word=>word.word==='café'));
assert.ok(searchWords({book:'pep2019-compulsory-1',unit:'u2',pos:'phrase'}).total>0);
for(const pos of meta.pos){
  const result=searchWords({pos:pos.id});
  assert.equal(result.total,pos.count);
  assert.ok(result.items.every(word=>word.pos.includes(pos.id)));
}
const sample=searchWords({source:'all',sample:40});
assert.equal(sample.items.length,40);assert.equal(new Set(sample.items.map(word=>word.id)).size,40);

const pending=Object.keys(topics.labels).length===0&&process.argv.includes('--allow-pending-topics');
if(!pending){
  assert.equal(topics.model,'[ASP]gemini-4-argon');
  assert.equal(topics.topics.length,19);
  assert.deepEqual(new Set(Object.keys(topics.labels)),globalKeys);
  const allowed=new Set(topics.topics.map(topic=>topic.id));
  for(const [word,labels] of Object.entries(topics.labels)){
    assert.ok(labels.length>=1&&labels.length<=3,`Bad label count: ${word}`);
    assert.equal(labels.length,new Set(labels).size);
    assert.ok(labels.every(label=>allowed.has(label)),`Unknown topic: ${word}`);
  }
  for(const topic of meta.topics){
    const result=searchWords({topic:topic.id});
    assert.equal(result.total,topic.count);
    assert.ok(result.items.every(word=>word.topics.includes(topic.id)));
  }
  const crossed=searchWords({source:'all',topic:'science',pos:'noun',band:'low'});
  assert.ok(crossed.total>0);
  assert.ok(crossed.items.every(word=>word.topics.includes('science')&&word.pos.includes('noun')&&word.frequency==='low'));
  assert.equal(crossed.total,crossed.counts.low);
  assert.ok(topics.labels.the.includes('function'));
  assert.ok(topics.labels.earthquake.includes('nature'));
  assert.ok(topics.labels.cholera.includes('health'));
}
console.log(JSON.stringify({status:'passed',core:meta.total,combined:meta.combinedWords,textbookEntries:meta.textbookEntries,textbookWords:meta.textbookWords,books:7,units:36,membershipChecks,textbookOnlyMembershipChecks:extraChecks,topics:meta.topics.length,unclassified:meta.combinedWords-Object.keys(topics.labels).length,topicChecksPending:pending,pos:meta.pos},null,2));
