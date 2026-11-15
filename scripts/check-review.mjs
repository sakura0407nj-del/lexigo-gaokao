import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';

const require=createRequire(import.meta.url),ts=require('typescript');
const root=process.cwd(),cache=new Map(),effects=[];
const react={
  createContext:value=>({value,Provider:{}}),useContext:context=>context.value,
  useCallback:callback=>callback,useMemo:callback=>callback(),
  useSyncExternalStore:(_subscribe,snapshot)=>snapshot(),
  useEffect:effect=>effects.push(effect),useRef:value=>({current:value}),
};
const runtime={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
function modulePath(path){for(const suffix of ['','.ts','.tsx','.json'])if(existsSync(path+suffix))return path+suffix;throw Error(`Missing test module ${path}`)}
function load(path){
  const full=modulePath(resolve(root,path));if(cache.has(full))return cache.get(full).exports;
  if(full.endsWith('.json'))return JSON.parse(readFileSync(full,'utf8'));
  const module={exports:{}};cache.set(full,module);
  const code=ts.transpileModule(readFileSync(full,'utf8'),{fileName:full,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const localRequire=name=>{
    if(name==='react')return react;if(name==='react/jsx-runtime')return runtime;
    if(name.startsWith('.'))return load(resolve(dirname(full),name));
    if(name.startsWith('@/'))return load(resolve(root,name.slice(2)));
    return require(name);
  };
  new Function('require','module','exports',code)(localRequire,module,module.exports);
  return module.exports;
}

const checks=[];
async function test(name,work){try{await work();checks.push({name,passed:true})}catch(error){checks.push({name,passed:false,error:error.message})}}
const review=load('components/learn/review.ts');
const migration=load('lib/progress-migration.ts');
const catalog=load('lib/vocabulary-catalog.ts');
const router=load('lib/public-router.ts');
const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
globalThis.fetch=async(input,init)=>router.handlePublicRequest(new Request(new URL(String(input),'https://review.test'),init));
const vocabulary=load('components/learn/vocab-api.ts');
const aliases=catalog.aliasIndex();
const legacyId='pep2019-compulsory-1:welcome:0';
const contextual={id:legacyId,word:'exchange',translation:'n. 交换',phonetic:'ɪksˈtʃeɪndʒ',frequency:'high',rank:1084,book:'pep2019-compulsory-1',unit:'welcome',accepted:['exchange']};
const now=new Date('2026-11-15T12:00:00+08:00');
const today=new Date(now);today.setHours(0,0,0,0);

await test('review intervals grow at due reviews and cap at 30 days',()=>{
  let prior,time=now;for(const expected of [1,3,7,14,30,30]){prior=review.scheduleReview(prior,true,time);assert.equal(prior.interval,expected);assert.equal(new Date(prior.dueAt).getHours(),0);time=new Date(prior.dueAt)}
  const failed=review.scheduleReview(prior,false,time);assert.equal(failed.interval,1);assert.equal(failed.step,0);assert.equal(failed.lapses,1);assert.equal(failed.reviewCount,7);
});
await test('due dates sort, invalid imports are rejected and dates count locally',()=>{
  const first=review.scheduleReview(undefined,true,now),second=review.scheduleReview(first,true,new Date(first.dueAt));
  assert.deepEqual(review.dueIds({later:second,first},new Date(first.dueAt)),['first']);
  assert.equal(review.daysUntil(first.dueAt,now),1);assert.equal(review.dueLabel(first,now),'明天复习');
  assert.equal(review.isDue({dueAt:'invalid'},now),false);assert.equal(review.parseReviewEntry({step:0,reviewCount:1,dueAt:'invalid'}),null);
  assert.equal(review.parseReviewEntry({...first,step:99,reviewCount:-2}).step,4);
});
await test('first successful recall after a lapse schedules one day, not three',()=>{
  const failed=review.scheduleReview(undefined,false,now);
  const recalled=review.scheduleReview(failed,true,new Date(now.getTime()+60000));
  assert.equal(recalled.interval,1);assert.equal(recalled.step,0);assert.equal(recalled.known,true);
  assert.equal(review.scheduleReview(recalled,true,new Date(recalled.dueAt)).interval,3);
  assert.equal(review.parseReviewEntry(recalled).known,true);
});
await test('early repeat practice preserves the due date and interval',()=>{
  const first=review.scheduleReview(undefined,true,now);
  let repeated=first;for(let index=1;index<=8;index++)repeated=review.scheduleReview(repeated,true,new Date(now.getTime()+index*60000));
  assert.equal(repeated.interval,1);assert.equal(repeated.dueAt,first.dueAt);assert.equal(repeated.reviewCount,9);
});
await test('alias migration retains contextual word and merges duplicate states',()=>{
  const oldReview={step:4,interval:30,reviewCount:8,lapses:1,lastReviewed:'2026-11-13T00:00:00Z',dueAt:'2026-12-13T00:00:00Z'};
  const recentLapse={step:0,interval:1,reviewCount:2,lapses:2,lastReviewed:'2026-11-14T00:00:00Z',dueAt:'2026-11-15T00:00:00Z'};
  const original={learned:[legacyId,'exchange'],starred:[legacyId,'exchange'],words:{[legacyId]:contextual},wrongbook:{[legacyId]:{word:contextual,misses:2,lastAnswer:'exchang',lastWrong:'2026-11-14T00:00:00Z'},exchange:{word:{...contextual,id:'exchange',book:undefined},misses:1,lastAnswer:'exchage',lastWrong:'2026-11-13T00:00:00Z'}},review:{[legacyId]:oldReview,exchange:recentLapse},log:{},dailyGoal:40};
  const before=JSON.stringify(original),result=migration.migrateProgress(original,aliases,now);
  assert.equal(JSON.stringify(original),before);assert.equal(result.changed,true);
  assert.deepEqual(result.progress.learned,[],'A stale learned alias must not override the newer lapse');assert.deepEqual(result.progress.starred,['exchange']);
  assert.equal(result.progress.wrongbook.exchange.misses,3);assert.equal(result.progress.wrongbook.exchange.lastAnswer,'exchang');
  assert.equal(result.progress.wrongbook.exchange.word.book,contextual.book);assert.equal(result.progress.wrongbook.exchange.word.phonetic,contextual.phonetic);assert.equal(result.progress.wrongbook.exchange.word.id,'exchange');
  assert.equal(result.progress.review.exchange.step,0);assert.equal(result.progress.review.exchange.reviewCount,8);assert.equal(result.progress.review.exchange.lapses,2);
  assert.equal(result.progress.dailyGoal,40);assert.deepEqual(result.progress.log,{});
  const again=migration.migrateProgress(result.progress,aliases,new Date('2026-12-01'));
  assert.equal(again.changed,false);assert.equal(again.progress,result.progress);
});
await test('legacy learned words become due today once without inventing activity',()=>{
  const result=migration.migrateProgress({learned:[legacyId],starred:[],words:{[legacyId]:contextual},wrongbook:{},review:{},log:{}},aliases,now).progress;
  assert.equal(result.review.exchange.dueAt,today.toISOString());assert.equal(result.review.exchange.reviewCount,0);
  assert.equal(review.isDue(result.review.exchange,now),true);assert.deepEqual(result.log,{});
  assert.equal(migration.migrateProgress(result,aliases,new Date('2026-12-01')).changed,false);
});
await test('unknown and cyclic aliases are safe, existing canonical entries retain identity',()=>{
  assert.equal(migration.canonicalWordId('unknown',aliases),'unknown');assert.equal(migration.canonicalWordId('one',{one:'two',two:'one'}),'one');
  const word={...contextual,id:'exchange'};assert.equal(migration.canonicalizeWord(word,aliases),word);
  assert.deepEqual(migration.canonicalizeWord(contextual,aliases),{...contextual,id:'exchange'});
});
await test('public alias endpoint is minimal and new dictations use stable IDs',async()=>{
  const response=await router.handlePublicRequest(new Request('https://review.test/api/vocabulary/aliases'));assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.version,1);assert.equal(data.aliases[legacyId],'exchange');assert.ok(!Object.hasOwn(data.aliases,'exchange'));
  const result=await router.handlePublicRequest(new Request('https://review.test/api/dictation?book=pep2019-compulsory-1&units=welcome&count=1&order=textbook&includePhrases=1'));
  const dictation=await result.json();assert.equal(dictation.items[0].id,'exchange');assert.equal(dictation.items[0].book,contextual.book);assert.equal(dictation.items[0].unit,'welcome');
});
await test('frontend adapter preserves textbook, topic, POS and old-ID intersections',async()=>{
  const result=await vocabulary.queryWords({band:'all',book:'pep2019-compulsory-1',unit:'u4',topic:'nature',pos:'noun',source:'all',limit:200},true);
  assert.ok(result.total>0);assert.ok(result.items.every(word=>word.topics.includes('nature')&&word.pos.includes('noun')&&word.textbooks.some(ref=>ref.bookId==='pep2019-compulsory-1'&&ref.unitId==='u4')));
  assert.equal((await vocabulary.queryWords({band:'all',ids:[],source:'all'},true)).total,0);
  const old=await vocabulary.queryWords({band:'all',ids:[legacyId],source:'all'},true);assert.equal(old.total,1);assert.equal(old.items[0].id,'exchange');
  const unknown=await vocabulary.queryWords({band:'unknown',book:'pep2019-compulsory-1',q:'actually'},true);assert.equal(unknown.total,1);assert.equal(unknown.items[0].frequencyKnown,false);
  assert.equal((await vocabulary.queryWords({band:'low',book:'pep2019-compulsory-1',q:'actually'},true)).total,0);
});
await test('large favorite lists use the public bounded search without an AI session',async()=>{
  const ids=Object.keys(aliases).slice(0,400);
  const expected=catalog.searchWords({band:'all',source:'all',ids,limit:200});
  const request=()=>new Request('https://review.test/api/words/search',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://review.test'},body:JSON.stringify({band:'all',source:'all',ids,limit:200})});
  const response=await router.handlePublicRequest(request());assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.total,expected.total);assert.deepEqual(result.items.map(word=>word.id),expected.items.map(word=>word.id));
  const invalid=await router.handlePublicRequest(new Request('https://review.test/api/words/search',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://review.test'},body:JSON.stringify({ids:Array(5501).fill('a')})}));assert.equal(invalid.status,400);
  const tooLarge=await router.handlePublicRequest(new Request('https://review.test/api/words/search',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://review.test'},body:JSON.stringify({q:'x'.repeat(103000)})}));assert.equal(tooLarge.status,413);
});

// A tiny hook adapter exercises actual store callbacks without a DOM or test dependency.
// It does not claim to verify React rendering, which the UI/browser checks cover.
async function mount(seed){
  const storage=new Map([['lexigo.progress.v1',JSON.stringify(seed)]]);
  globalThis.window={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},addEventListener(){},removeEventListener(){}};
  cache.delete(modulePath(resolve(root,'components/learn/progress.tsx')));effects.length=0;
  const exports=load('components/learn/progress.tsx');let api=exports.ProgressProvider({children:null}).props.value;
  for(const effect of effects.splice(0))effect();
  await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  const refresh=()=>exports.ProgressProvider({children:null}).props.value;
  api=refresh();return {api,refresh,exports,read:()=>JSON.parse(storage.get('lexigo.progress.v1'))};
}
if(!process.argv.includes('--helpers-only')){
  await test('store bootstrap migrates old favorite IDs so toggle actually removes them',async()=>{
    const {api,refresh}=await mount({version:1,learned:[],starred:[legacyId],words:{[legacyId]:contextual}});
    assert.equal(api.isStarred('exchange'),true,'Old scoped favorite was not recognized by its stable ID');
    api.toggleStarred({...contextual,id:'exchange'});assert.deepEqual(refresh().progress.starred,[]);
  });
  await test('store bootstrap schedules existing learned records for review',async()=>{
    const {api}=await mount({version:1,learned:[legacyId],starred:[],words:{[legacyId]:contextual}});
    assert.ok(api.progress.review.exchange,'Old learned word has no due review after bootstrap');
    assert.equal(review.isDue(api.progress.review.exchange),true);
  });
  await test('wrong answers remove learned state and reset the review interval',async()=>{
    const {api,refresh,exports}=await mount({version:1,learned:[],starred:[],words:{}});
    const word={...contextual,id:'exchange'};api.reviewWord(word,true);assert.equal(refresh().isLearned('exchange'),true);
    refresh().reviewWord(word,false);const state=refresh().progress;
    assert.equal(refresh().isLearned('exchange'),false);assert.equal(state.review.exchange.interval,1);assert.equal(state.review.exchange.lapses,1);
    const logs=Object.values(state.log);assert.equal(logs.reduce((sum,day)=>sum+day.again,0),1);
    assert.equal(exports.parseProgress({version:1,learned:['x','x'],starred:[]}).learned.length,1);
  });
  await test('all word mutations canonicalize old IDs and imported metadata survives',async()=>{
    const {api,refresh,exports}=await mount({version:1,learned:[],starred:[],words:{}});
    api.toggleStarred(contextual);assert.deepEqual(refresh().progress.starred,['exchange']);assert.equal(refresh().isStarred(legacyId),true);
    refresh().toggleLearned(contextual);assert.deepEqual(refresh().progress.learned,['exchange']);
    refresh().recordDictation({band:'all',total:1,correct:0},[{word:contextual,correct:false,answer:'exchage'}]);
    assert.equal(refresh().progress.wrongbook.exchange.word.book,contextual.book);assert.equal(refresh().progress.wrongbook.exchange.word.id,'exchange');
    refresh().removeWrong(legacyId);assert.deepEqual(refresh().progress.wrongbook,{});
    const rich={...contextual,pos:['noun','verb'],topics:['communication'],textbooks:[{bookId:contextual.book,bookTitle:'必修第一册',unitId:'welcome',unitTitle:'Welcome Unit'}],aliasIds:[legacyId,'exchange'],inGaokao:true};
    const imported=exports.parseProgress({version:1,learned:[legacyId],starred:[legacyId],words:{[legacyId]:rich}});
    refresh().replaceAll(imported);assert.deepEqual(refresh().progress.learned,['exchange']);assert.ok(refresh().progress.review.exchange);
    assert.deepEqual(refresh().progress.words.exchange.topics,['communication']);assert.deepEqual(refresh().progress.words.exchange.pos,['noun','verb']);
  });
  await test('dictation attempt completion is atomic and deduplicates across reload and backup import',async()=>{
    const mounted=await mount({version:1,learned:[],starred:[],words:{}});
    const word={id:'primary-g3-dictation-fixture',word:'apple',translation:'苹果',phonetic:'',frequency:'high',rank:0,frequencyKnown:false,frequencyBand:'unknown'};
    const attempt={attemptId:'dictation-attempt-one',band:'all',source:'frequency',scope:'测试用普通词汇',total:1,correct:0};
    const results=[{word,correct:false,answer:'aple'}];
    mounted.api.recordDictation(attempt,results);
    const once=mounted.read();assert.equal(once.dictation.length,1);assert.equal(once.dictation[0].attemptId,attempt.attemptId);assert.equal(once.wrongbook[word.id].misses,1);
    mounted.refresh().recordDictation(attempt,results);
    assert.deepEqual(mounted.read(),once,'A duplicate completion must not partially increment mistakes or append history');
    const reloaded=await mount(mounted.read());reloaded.api.recordDictation(attempt,results);
    assert.equal(reloaded.refresh().progress.dictation.length,1);assert.equal(reloaded.refresh().progress.wrongbook[word.id].misses,1);
    const imported=reloaded.exports.parseProgress(JSON.parse(JSON.stringify(reloaded.read())));
    reloaded.refresh().replaceAll(imported);reloaded.refresh().recordDictation(attempt,results);
    assert.equal(reloaded.refresh().progress.dictation.length,1);assert.equal(reloaded.refresh().progress.wrongbook[word.id].misses,1);
    reloaded.refresh().recordDictation({...attempt,attemptId:'dictation-attempt-two'},results);
    assert.equal(reloaded.refresh().progress.dictation.length,2);assert.equal(reloaded.refresh().progress.wrongbook[word.id].misses,2);
    assert.equal(reloaded.refresh().progress.wrongbook[word.id].word.rank,0);
    assert.equal(reloaded.refresh().progress.wrongbook[word.id].word.frequencyKnown,false);
    assert.equal(reloaded.refresh().progress.wrongbook[word.id].word.frequencyBand,'unknown','A nominal compatibility enum must not become a fabricated frequency label');
  });
  await test('legacy dictation without attempt IDs still records distinct real completions',async()=>{
    const {api,refresh}=await mount({version:1,learned:[],starred:[],words:{}});
    const attempt={band:'all',total:1,correct:0},results=[{word:contextual,correct:false,answer:'exchang'}];
    api.recordDictation(attempt,results);refresh().recordDictation(attempt,results);
    assert.equal(refresh().progress.dictation.length,2);assert.equal(refresh().progress.wrongbook.exchange.misses,2);
  });
  await test('exam completion stores grades and mistakes once across reload and backup import',async()=>{
    const {api,refresh,read,exports}=await mount({version:1,learned:[],starred:[]});
    const records=[{paperId:'paper-one',title:'模拟阅读',type:'reading',origin:'original',score:5,maxScore:10}];
    const mistakes=[{id:'paper-one:2',kind:'exercise',type:'reading',title:'阅读第2题',prompt:'Choose the main idea.',context:'Test passage.',correctAnswer:'B',yourAnswer:'A',explanation:'Evidence supports B.',knowledge:'主旨大意'}];
    api.recordExam('exam-attempt-one',records,mistakes);
    assert.equal(refresh().progress.practice.length,1);assert.equal(refresh().progress.mistakes['paper-one:2'].misses,1);
    assert.deepEqual(read().examAttempts,['exam-attempt-one']);
    refresh().recordExam('exam-attempt-one',records,mistakes);
    assert.equal(refresh().progress.practice.length,1);assert.equal(refresh().progress.mistakes['paper-one:2'].misses,1);
    const imported=exports.parseProgress(JSON.parse(JSON.stringify(read())));
    const remounted=await mount(imported);remounted.api.recordExam('exam-attempt-one',records,mistakes);
    assert.equal(remounted.refresh().progress.practice.length,1);
    remounted.refresh().recordExam('exam-attempt-two',records,mistakes);
    assert.equal(remounted.refresh().progress.practice.length,2);assert.equal(remounted.refresh().progress.mistakes['paper-one:2'].misses,2);
  });
  await test('invalid exam aggregates cannot partially append scores or a completion marker',async()=>{
    const {api,refresh}=await mount({version:1,learned:[],starred:[]});
    api.recordExam('invalid',[{paperId:'p',title:'p',type:'grammar',origin:'ai',score:99,maxScore:10}],[]);
    assert.equal(refresh().progress.practice.length,0);assert.deepEqual(refresh().progress.examAttempts,[]);
    api.recordExam('empty',[],[]);assert.deepEqual(refresh().progress.examAttempts,[]);
  });
}
globalThis.fetch=originalFetch;globalThis.window=originalWindow;
console.log(JSON.stringify({passed:checks.filter(check=>check.passed).length,failed:checks.filter(check=>!check.passed).length,checks},null,2));
if(checks.some(check=>!check.passed))process.exitCode=1;
