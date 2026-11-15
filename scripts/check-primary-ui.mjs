import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';

mkdirSync('work/checks',{recursive:true});
await build({entryPoints:['components/primary/primary-dictation.tsx','components/primary/primary-practice.tsx','components/primary/primary-records.tsx'],bundle:true,platform:'node',format:'cjs',outdir:'work/checks/primary-ui',outbase:'.',external:['react','react-dom','lucide-react'],outExtension:{'.js':'.cjs'},logLevel:'silent'});
globalThis.window={location:{href:'https://example.test/?stage=primary&grade=3'}};
const require=createRequire(import.meta.url);
const {parsePrimaryDictationDraft:dictation}=require('../work/checks/primary-ui/components/primary/primary-dictation.cjs');
const {parsePrimaryPending:pending}=require('../work/checks/primary-ui/components/primary/primary-practice.cjs');
const {validatePrimaryBackup:backup}=require('../work/checks/primary-ui/components/primary/primary-records.cjs');
const now=Date.now(),day=86400000,checks=[];
const word={id:'primary-g3-cat',word:'cat',phonetic:'/kæt/',translation:'猫',frequency:'high',rank:1,grade:3,topic:'动物',example:'I have a cat.',exampleZh:'我有一只猫。',pos:['n.']};
const word2={...word,id:'primary-g3-color',word:'color',accepted:['colour'],translation:'颜色'};
const fresh=()=>({v:1,id:'dictation-unique-attempt',grade:3,items:[word,word2],index:0,results:[],input:'ca',startedAt:now-5000,savedAt:now,recorded:false,rate:.85,repeat:1,hint:true});
const parse=(r,g=3)=>dictation(JSON.stringify(r),g,now);
const task=()=>({version:1,input:{stage:'primary',grade:3,type:'reading',level:'基础',topic:'My family'},requestId:'00000000-0000-4000-8000-000000000001',savedAt:now});
const readTask=(r,g=3)=>pending(JSON.stringify(r),g,now);
const progress=()=>({version:1,learned:[word.id],starred:[],words:{[word.id]:word},wrongbook:{},mistakes:{},dictation:[],practice:[],corrections:[]});
const envelope=()=>({kind:'lexigo-primary-progress',version:1,grade:3,exportedAt:new Date(now).toISOString(),progress:progress()});
function check(name,fn){try{fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});}}

check('unfinished input and stable attempt ID survive an immediate reload',()=>{const r=parse(fresh());assert.equal(r.input,'ca');assert.equal(r.id,'dictation-unique-attempt');assert.equal(r.index,0);assert.equal(r.items.length,2);});
check('checked answer resumes before next rather than creating a duplicate result',()=>{const r=fresh();r.results=[{word,answer:'Cat',correct:true,skipped:false}];const saved=parse(r);assert.equal(saved.index,0);assert.equal(saved.results.length,1);assert.equal(saved.results[0].correct,true);});
check('cached correctness is recomputed and canonical word metadata restored',()=>{const r=fresh();r.results=[{word:{...word,translation:'old damaged label',accepted:['dog']},answer:'dog',correct:true,skipped:false}];const saved=parse(r);assert.equal(saved.results[0].correct,false);assert.equal(saved.results[0].word.translation,'猫');assert.equal(saved.results[0].word.accepted,undefined);});
check('accepted spelling variants and case are retained after reload',()=>{const r=fresh();r.index=2;r.recorded=true;r.results=[{word,answer:'  CAT ',correct:false,skipped:false},{word:word2,answer:'Colour',correct:false,skipped:false}];const saved=parse(r);assert.equal(saved.results.every(x=>x.correct),true);assert.equal(saved.id,r.id);});
check('skips stay incorrect and cannot inject a hidden answer',()=>{const r=fresh();r.results=[{word,answer:'',correct:false,skipped:true}];assert.equal(parse(r).results[0].correct,false);r.results[0].answer='cat';assert.equal(parse(r),null);});
check('grade isolation rejects another grade or mixed-grade word list',()=>{assert.equal(parse(fresh(),4),null);const r=fresh();r.items[1]={...word2,grade:4};assert.equal(parse(r),null);});
check('duplicate IDs, oversized input and malformed words cannot restore',()=>{const r=fresh();assert.equal(parse({...r,items:[word,word]}),null);assert.equal(parse({...r,input:'x'.repeat(201)}),null);assert.equal(parse({...r,items:[{...word,rank:null}]}),null);assert.equal(parse({...r,items:[{...word,word:123}]}),null);});
check('progress indices and incomplete recorded flags are bounded',()=>{const r=fresh();for(const patch of [{index:-1},{index:3},{index:1},{recorded:true},{rate:10},{repeat:0}])assert.equal(parse({...r,...patch}),null);});
check('dictation has finite chronological timestamps and a 14-day retention limit',()=>{const r=fresh();for(const patch of [{savedAt:null},{savedAt:now+day},{savedAt:now-15*day,startedAt:now-16*day},{startedAt:now+1},{startedAt:-1}])assert.equal(parse({...r,...patch}),null);assert.ok(parse({...r,savedAt:now-13*day,startedAt:now-14*day}));});
check('invalid JSON and huge draft payloads fail without throwing',()=>{for(const raw of [null,'','{bad','null','[]','x'.repeat(250001)])assert.equal(dictation(raw,3,now),null);});

check('pre-acknowledgement AI request keeps exact input and same request ID',()=>{const t=task();const restored=readTask(t);assert.equal(restored.requestId,t.requestId);assert.deepEqual(restored.input,t.input);assert.equal(restored.jobId,undefined);});
check('acknowledged AI job remains resumable without creating a new request',()=>{const t={...task(),jobId:'job_abc:123'};assert.equal(readTask(t).jobId,t.jobId);delete t.requestId;assert.equal(readTask(t).jobId,t.jobId);});
check('pending requests cannot cross grade/stage or silently change exercise type',()=>{const t=task();assert.equal(readTask(t,4),null);for(const patch of [{stage:'high'},{grade:4},{type:'cloze'},{level:'挑战'}])assert.equal(readTask({...t,input:{...t.input,...patch}}),null);});
check('pending IDs, topics and timestamps are validated before resume',()=>{const t=task();for(const patch of [{requestId:'invalid'},{requestId:undefined,jobId:undefined},{jobId:'../wrong/path'},{savedAt:null},{savedAt:now+day},{savedAt:now-15*day}])assert.equal(readTask({...t,...patch}),null);assert.equal(readTask({...t,input:{...t.input,topic:' '}}),null);assert.equal(readTask({...t,input:{...t.input,topic:'x'.repeat(41)}}),null);});

check('primary backups accept only the exact grade envelope',()=>{const e=envelope();assert.equal(typeof backup(e,3),'object');assert.equal(typeof backup(e,4),'string');assert.equal(typeof backup(e.progress,3),'string');assert.equal(typeof backup({...e,kind:'lexigo-high-progress'},3),'string');assert.equal(typeof backup({...e,version:2},3),'string');});
check('backup word metadata may be normalized while envelope still isolates grade',()=>{const e=envelope();delete e.progress.words[word.id].grade;delete e.progress.words[word.id].topic;assert.equal(typeof backup(e,3),'object');});
check('malformed backup collections are refused before overwrite',()=>{const e=envelope();for(const patch of [{learned:null},{wrongbook:[]},{mistakes:null},{dictation:{}},{corrections:null}])assert.equal(typeof backup({...e,progress:{...e.progress,...patch}},3),'string');assert.equal(typeof backup(null,3),'string');});
check('untrusted export timestamps never render arbitrary oversized content',()=>{const e=envelope();assert.equal(backup({...e,exportedAt:'x'.repeat(10000)},3).exportedAt,'');assert.equal(backup({...e,exportedAt:'not a date'},3).exportedAt,'');assert.equal(backup(e,3).exportedAt,e.exportedAt);});

console.log(JSON.stringify({suite:'primary-ui',passed:checks.filter(c=>c.pass).length,total:checks.length,checks},null,2));
if(checks.some(c=>!c.pass))process.exitCode=1;
