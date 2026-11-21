import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {dirname,resolve} from 'node:path';

const require=createRequire(import.meta.url),ts=require('typescript'),root=process.cwd(),checks=[];
const uuid='11111111-1111-4111-8111-111111111111',jobId='2026-11-21_11111111-1111-4111-8111-111111111111';
const copy=value=>JSON.parse(JSON.stringify(value));
const receipt=(kind='generate',grade)=>({version:1,kind,stage:grade?'primary':'high',...(grade?{grade}:{}),requestId:uuid,createdAt:Date.now()});
const fresh=()=>({version:1,learned:[],starred:[],words:{},wrongbook:{},dictation:[],practice:[],examAttempts:[],corrections:[],days:[],mistakes:{},review:{},log:{},dailyGoal:20});
const paper=(id='generated-paper')=>({id,title:'Generated practice',origin:'ai',source:'AI original',type:'reading',level:'标准',topic:'School',minutes:5,passage:'A short passage.',sealed:'sealed-fixture',questions:[{id:'q1',prompt:'What happened?',options:['A. One','B. Two'],points:2}],expiresAt:new Date(Date.now()+86400000).toISOString()});
const correction={score:10,maxScore:15,summary:'Check agreement.',dimensions:[],errors:[{original:'He go.',corrected:'He goes.',reason:'Third person singular.',category:'主谓一致'}],revised:'He goes.',advice:[]};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function check(name,run){try{await run();checks.push({name,pass:true});}catch(error){checks.push({name,pass:false,error:error.stack});}}
function moduleLoader(overrides={}){
  const cache=new Map();
  function load(path){let full=resolve(root,path);for(const suffix of ['','.ts','.tsx','.json'])if(existsSync(full+suffix)){full+=suffix;break;}
    if(overrides[full])return overrides[full];if(cache.has(full))return cache.get(full).exports;if(full.endsWith('.json'))return JSON.parse(readFileSync(full,'utf8'));
    const module={exports:{}};cache.set(full,module);
    const code=ts.transpileModule(readFileSync(full,'utf8'),{fileName:full,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const localRequire=name=>{if(overrides[name])return overrides[name];if(name.startsWith('.'))return load(resolve(dirname(full),name));if(name.startsWith('@/'))return load(name.slice(2));return require(name);};
    new Function('require','module','exports',code)(localRequire,module,module.exports);return module.exports;
  }return load;
}
function storageWindow(grade){const session=new Map(),local=new Map(),writes=[];let failSession=false,failLocal=false;
  const adapter=(map,sessionOnly)=>({getItem:key=>{if(sessionOnly&&failSession)throw Error('denied');return map.get(key)??null;},setItem:(key,value)=>{if(sessionOnly?failSession:failLocal)throw Error('quota');map.set(key,value);writes.push({key,value});},removeItem:key=>{if(sessionOnly&&failSession)throw Error('denied');map.delete(key);}});
  const win={location:{search:grade?`?stage=primary&grade=${grade}`:''},sessionStorage:adapter(session,true),localStorage:adapter(local,false),addEventListener(){},removeEventListener(){},setTimeout:()=>0,setInterval:()=>0,clearInterval(){},confirm:()=>true};
  globalThis.window=win;return {win,session,local,writes,failSession:value=>{failSession=value;},failLocal:value=>{failLocal=value;}};
}

await check('tab receipt stores only IDs, scope and time; rejects wrong kind/grade, malformed and expired content',()=>{
  const w=storageWindow(),r=moduleLoader()('components/learn/task-receipt.ts'),saved=receipt('essay',3);
  assert.equal(r.writeTaskReceipt({...saved,text:'private essay',images:['private image'],answers:{a:'secret'}}),true);
  const raw=w.session.get(r.taskReceiptKey('essay',3));assert.doesNotMatch(raw,/private|secret|text|images|answers/);assert.deepEqual(r.parseTaskReceipt(raw,'essay',3),saved);
  assert.equal(r.parseTaskReceipt(raw,'questions',3),null);assert.equal(r.parseTaskReceipt(raw,'essay',4),null);assert.equal(r.parseTaskReceipt(raw,'essay'),null);
  for(const patch of [{requestId:'invalid'},{jobId:'../evil'},{createdAt:Date.now()-86400001},{createdAt:Date.now()+600000},{text:'injected'}])assert.equal(r.parseTaskReceipt(JSON.stringify({...saved,...patch}),'essay',3),null);
  const high=receipt('essay');r.writeTaskReceipt(high);r.clearTaskReceipt(saved);assert.deepEqual(r.readTaskReceipt('essay').receipt,high);assert.equal(r.readTaskReceipt('essay',3).receipt,null);
});
await check('unavailable sessionStorage uses memory only and stale callbacks cannot clear a newer receipt',()=>{
  const w=storageWindow(),r=moduleLoader()('components/learn/task-receipt.ts'),first=receipt(),second={...first,requestId:'22222222-2222-4222-8222-222222222222'};
  w.failSession(true);assert.equal(r.writeTaskReceipt(first),false);assert.deepEqual(r.readTaskReceipt('generate').receipt,first);assert.equal(r.readTaskReceipt('generate').storageAvailable,false);assert.equal(w.session.size,0);
  w.failSession(false);r.writeTaskReceipt(second);r.clearTaskReceipt(first);assert.deepEqual(r.readTaskReceipt('generate').receipt,second);
});

const records=new Map(),metadata=new Map();let storeWrites=0;
const store={async get(key){return records.has(key)?copy(records.get(key)):null;},async list({prefix=''}){return {blobs:[...records.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};},async setJSON(key,value,options={}){if(options.onlyIfNew&&records.has(key))return {modified:false};storeWrites++;records.set(key,copy(value));metadata.set(key,options.metadata||{});return {modified:true};},async delete(key){storeWrites++;records.delete(key);},async getMetadata(key){return {metadata:metadata.get(key)}}};
class PublicApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const sign=(scope,value)=>createHmac('sha256','receipt-test-not-a-production-key').update(scope+'\0'+value).digest('base64url');
const publicSession={PublicApiError,privateOwner:user=>sign('owner',user),signPublicValue:sign,verifyPublicValue:(scope,value,sig)=>sign(scope,value)===sig,requirePublicUser:req=>{const user=req.headers.get('x-test-user');if(!user)throw new PublicApiError(401,'session required');return user;},publicJSON:(body,status=200)=>Response.json(body,{status}),publicFailure:error=>Response.json({error:error.message},{status:error.status||503})};
const backend=moduleLoader({'@netlify/blobs':{getStore:()=>store},[resolve(root,'lib/public-session.ts')]:publicSession});
const jobs=backend('lib/job-store.ts'),handler=backend('netlify/functions/jobs.ts').default;
const originalNow=Date.now;let now=Date.parse('2026-11-21T15:59:59Z');
await check('GET lookup reuses today/yesterday jobs and exposes no payload or quota writes',async()=>{
  Date.now=()=>now;try{
    const input=jobs.parseJobSubmission({kind:'correct',payload:{kind:'essay',text:'My private essay.',maxScore:15,stage:'primary',grade:3},requestId:uuid});
    const created=await jobs.createLearningJob(input,'alice','ip-a'),used=storeWrites;now+=2000;
    const response=await handler(new Request(`https://example.test/api/ai/jobs/lookup?requestId=${uuid}&kind=essay&stage=primary&grade=3`,{headers:{'x-test-user':'alice'}}),{ip:'127.0.0.1'});
    assert.equal(response.status,200);const data=await response.json();assert.equal(data.jobId,created.job.id);assert.doesNotMatch(JSON.stringify(data),/private essay|payload|uploadIds|owner/);assert.equal(storeWrites,used);
  }finally{Date.now=originalNow;}
});
await check('lookup and scoped polling reject another owner, type, grade, malformed scope and expiry without mutation',async()=>{
  Date.now=()=>now;try{
    const used=storeWrites;
    for(const [user,kind,stage,grade] of [['bob','essay','primary',3],['alice','questions','primary',3],['alice','essay','primary',4],['alice','essay','high',undefined]]){
      const query=new URLSearchParams({requestId:uuid,kind,stage,...(grade?{grade:String(grade)}:{})});const response=await handler(new Request(`https://example.test/api/ai/jobs/lookup?${query}`,{headers:{'x-test-user':user}}),{ip:'127.0.0.1'});assert.equal(response.status,404);
    }
    const noSession=await handler(new Request(`https://example.test/api/ai/jobs/lookup?requestId=${uuid}&kind=essay&stage=high`),{ip:'127.0.0.1'});assert.equal(noSession.status,401);
    const invalid=await handler(new Request(`https://example.test/api/ai/jobs/lookup?requestId=${uuid}&kind=essay&stage=high&grade=3`,{headers:{'x-test-user':'alice'}}),{ip:'127.0.0.1'});assert.equal(invalid.status,400);
    const saved=[...records.values()].find(item=>item.kind==='correct');await assert.rejects(()=>jobs.learningJobView(saved.id,'alice',{kind:'essay',stage:'primary',grade:4}),error=>error.status===404);
    now=saved.expiresAt;await assert.rejects(()=>jobs.lookupLearningJob(uuid,'alice',{kind:'essay',stage:'primary',grade:3}),error=>error.status===404);assert.equal(storeWrites,used);
  }finally{Date.now=originalNow;}
});

const originalFetch=globalThis.fetch,originalTimeout=globalThis.setTimeout;
globalThis.setTimeout=(fn,_ms,...args)=>originalTimeout(fn,0,...args);
const json=(body,status=200)=>Response.json(body,{status});
await check('known-job recovery only polls and missing-ack recovery only GET-lookups then polls; neither submits uploads/jobs',async()=>{
  for(const acknowledged of [false,true]){
    const calls=[],client=moduleLoader()('components/learn/api.ts');let callback='';
    globalThis.fetch=async(path,init)=>{calls.push({path:String(path),method:init?.method||'GET'});if(path==='/api/session')return json({ok:true});if(String(path).includes('/lookup?'))return json({jobId,status:'running'});return json({status:'succeeded',result:{status:200,body:correction}});};
    const r={...receipt('questions',3),...(acknowledged?{jobId}:{})};assert.deepEqual(await client.retrieveLearningJob(r,undefined,id=>{callback=id;}),correction);
    assert.equal(calls.some(call=>call.path==='/api/ai/jobs'||call.path==='/api/uploads'),false);assert.equal(calls.filter(call=>call.path.includes('/lookup?')).length,acknowledged?0:1);assert.equal(callback,acknowledged?'':jobId);
    assert.ok(calls.some(call=>call.path.includes(`${jobId}?kind=questions&stage=primary&grade=3`)));
  }
});
await check('missing lookup preserves the receipt and never falls back to a billed POST; stop-wait aborts polling',async()=>{
  let client=moduleLoader()('components/learn/api.ts'),posts=0;globalThis.fetch=async(path,init)=>{if(path==='/api/session')return json({ok:true});if(init?.method==='POST')posts++;return json({error:'not found yet'},404);};
  await assert.rejects(()=>client.retrieveLearningJob(receipt()),error=>error.status===404&&!error.jobTerminal);assert.equal(posts,0);
  client=moduleLoader()('components/learn/api.ts');const controller=new AbortController();globalThis.fetch=async path=>{if(path==='/api/session')return json({ok:true});controller.abort();throw new DOMException('Stopped','AbortError');};
  await assert.rejects(()=>client.retrieveLearningJob({...receipt(),jobId},controller.signal),error=>error.name==='AbortError');
});
await check('recovery failure never claims that an unpersisted original essay was saved',async()=>{
  const client=moduleLoader()('components/learn/api.ts');globalThis.fetch=async path=>path==='/api/session'?json({ok:true}):json({status:'failed',result:{status:502,body:{error:'AI 返回的格式不完整，请重试；输入已保留。'}}});
  await assert.rejects(()=>client.retrieveLearningJob({...receipt('essay'),jobId}),error=>error.jobTerminal&&!error.message.includes('输入已保留'));
});
globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;

function uiHarness(view,options={}){
  const w=storageWindow(options.grade);let renderState=null;
  if(options.receipt)w.session.set(`lexigo.task-receipt.v1.${options.grade?`primary.g${options.grade}`:'high'}.${options.receipt.kind}`,JSON.stringify(options.receipt));
  const progressKey=`lexigo.progress.v1${options.grade?`.primary.g${options.grade}`:''}`;w.local.set(progressKey,JSON.stringify(options.progress||fresh()));
  if(options.draft)w.local.set('lexigo.practice-draft.v1',JSON.stringify(options.draft));
  const slot=initial=>{const i=renderState.cursor++;if(!(i in renderState.slots))renderState.slots[i]=initial();return [renderState.slots,i];};
  const react={createContext:value=>{const c={value};c.Provider={context:c};return c;},useContext:c=>c.value,useCallback:fn=>fn,useMemo:fn=>fn(),useSyncExternalStore:(_s,get)=>get(),useState:initial=>{const [s,i]=slot(()=>typeof initial==='function'?initial():initial);return [s[i],value=>{s[i]=typeof value==='function'?value(s[i]):value;}];},useRef:initial=>{const [s,i]=slot(()=>({current:initial}));return s[i];},useEffect:(effect,deps)=>{if(!renderState)return;const [s,i]=slot(()=>null),old=s[i];if(!old||!deps||deps.some((v,n)=>!Object.is(v,old.deps[n])))renderState.effects.push(()=>{old?.cleanup?.();s[i]={deps,cleanup:effect()};});}};
  const jsx=(type,props)=>{if(type?.context)type.context.value=props.value;return {type,props};};
  const actualApi=moduleLoader()('components/learn/api.ts'),calls=[],pending=deferred();
  const api={...actualApi,api:{...actualApi.api,generate:async(_input,signal,resume)=>{calls.push({kind:'generate',signal});resume.onSubmitting(uuid);resume.onSubmitted(jobId);return pending.promise;},correct:async(_input,signal,resume)=>{calls.push({kind:'correct',signal});resume.onSubmitting(uuid);resume.onSubmitted(jobId);return pending.promise;}},retrieveLearningJob:async(r,signal,onSubmitted)=>{calls.push({kind:'retrieve',receipt:copy(r),signal});if(!r.jobId)onSubmitted(jobId);return pending.promise;}};
  const load=moduleLoader({'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':new Proxy({},{get:(_t,key)=>key==='__esModule'?true:()=>null}),[resolve(root,'components/learn/api.ts')]:api,[resolve(root,'components/learn/paper-player.tsx')]:{PaperPlayer:'PaperPlayer'},[resolve(root,'components/learn/ui.tsx')]:{SectionHeader:'SectionHeader',ErrorNote:'ErrorNote',Loading:'Loading',Empty:'Empty',cx:(...x)=>x.filter(Boolean).join(' '),formatDate:value=>value,countEnglishWords:value=>value.split(/\s+/).filter(Boolean).length,copyText:async()=>true,downloadText(){}}});
  const progress=load('components/learn/progress.tsx'),View=load(`components/learn/${view==='practice'?'practice-view':'correction-view'}.tsx`)[view==='practice'?'PracticeView':'CorrectionView'];
  const state={slots:[],cursor:0,effects:[]},provider=()=>{renderState=null;return progress.ProgressProvider({children:null}).props.value;};
  function render(){provider();state.cursor=0;state.effects=[];renderState=state;const tree=View(view==='practice'?{bank:{papers:[],sources:[],note:''},bankError:'',onReloadBank(){}}:{kind:options.kind||'essay',primaryGrade:options.grade});renderState=null;for(const effect of state.effects)effect();return tree;}
  function unmount(){for(const item of state.slots)item?.cleanup?.();}
  return {...w,render,unmount,calls,pending,provider,progress,read:()=>JSON.parse(w.local.get(progressKey))};
}
function walk(tree,fn){if(Array.isArray(tree)){for(const item of tree){const found=walk(item,fn);if(found)return found;}}else if(tree&&typeof tree==='object'){if(fn(tree))return tree;return walk(tree.props?.children,fn);}return null;}
function text(tree){return Array.isArray(tree)?tree.map(text).join(''):typeof tree==='string'||typeof tree==='number'?String(tree):tree&&typeof tree==='object'?text(tree.props?.children):'';}
function button(tree,label){const node=walk(tree,x=>x.type==='button'&&text(x).trim()===label);assert.ok(node,`Missing button ${label}`);return node.props.onClick;}

await check('correction recovery ignores unrelated edited text and records errors/score once across repeated recovery',async()=>{
  const r={...receipt('essay',3),jobId},h=uiHarness('correction',{grade:3,receipt:r});let tree=h.render();walk(tree,x=>x.type==='textarea'&&x.props.id==='essay-text').props.onChange({target:{value:'Unrelated new private draft'}});tree=h.render();
  const click=button(tree,'取回上次批改'),pending=click();click();button(tree,'放弃回执')();assert.equal(h.session.size,1,'An old same-frame discard handler must respect the in-flight lock');assert.equal(h.calls.length,1);h.pending.resolve(correction);await pending;
  const saved=h.read();assert.equal(saved.corrections.length,1);assert.equal(saved.corrections[0].attemptId,uuid);assert.equal(Object.values(saved.mistakes).length,1);assert.doesNotMatch(JSON.stringify(saved.mistakes),/Unrelated new private draft/);assert.equal(h.session.size,0);
  const again=uiHarness('correction',{grade:3,receipt:r,progress:saved});const retry=button(again.render(),'取回上次批改')();again.pending.resolve(correction);await retry;assert.equal(again.read().corrections.length,1);assert.equal(Object.values(again.read().mistakes)[0].misses,1);
});
await check('new correction stores a receipt before submission, blocks same-frame double-click and retains receipt after leaving',async()=>{
  const h=uiHarness('correction');let tree=h.render();walk(tree,x=>x.type==='textarea'&&x.props.id==='essay-text').props.onChange({target:{value:'He go to school.'}});tree=h.render();const click=button(tree,'开始批改'),running=click();click();assert.equal(h.calls.length,1);assert.equal(h.session.size,1);assert.doesNotMatch([...h.session.values()].join(''),/He go|school/);
  h.unmount();assert.equal(h.calls[0].signal.aborted,true);h.pending.resolve(correction);await running;assert.equal(h.read().corrections.length,0);assert.equal(h.session.size,1);
});
await check('failed correction persistence keeps both old history and receipt, allowing a later save without duplicates',async()=>{
  const r={...receipt('questions'),jobId},h=uiHarness('correction',{kind:'questions',receipt:r});const before=h.read();h.failLocal(true);const running=button(h.render(),'取回上次批改')();h.pending.resolve(correction);await running;
  assert.deepEqual(h.read(),before);assert.deepEqual(h.provider().progress,before);assert.equal(h.session.size,1);h.failLocal(false);const retry=button(h.render(),'取回上次批改')();await retry;assert.equal(h.read().corrections.length,1);assert.equal(h.session.size,0);
});
await check('retrieved generation preserves rejected unrelated drafts and its receipt; accepted open persists before clearing receipt',async()=>{
  const old={paper:paper('old-paper'),answers:{q1:'A'},elapsed:13,savedAt:new Date().toISOString(),firstSavedAt:new Date().toISOString()},h=uiHarness('practice',{receipt:{...receipt(),jobId},draft:old});h.win.confirm=()=>false;
  const running=button(h.render(),'取回上次命题')();h.pending.resolve(paper());await running;assert.deepEqual(JSON.parse(h.local.get('lexigo.practice-draft.v1')),old);assert.equal(h.session.size,1);let tree=h.render();assert.ok(button(tree,'打开新练习'));
  h.win.confirm=()=>true;button(tree,'打开新练习')();assert.equal(JSON.parse(h.local.get('lexigo.practice-draft.v1')).paper.id,'generated-paper');assert.equal(h.session.size,0);
});
await check('recovering the same generated paper keeps answers and timing, and a missing lookup never calls generate',async()=>{
  const same={paper:paper(),answers:{q1:'B'},elapsed:21,savedAt:new Date().toISOString(),firstSavedAt:new Date().toISOString()},h=uiHarness('practice',{receipt:{...receipt(),jobId},draft:same});const running=button(h.render(),'取回上次命题')();h.pending.resolve(paper());await running;const player=walk(h.render(),x=>x.type==='PaperPlayer');assert.deepEqual(player.props.initialAnswers,{q1:'B'});assert.equal(player.props.initialElapsed,21);
  const missing=uiHarness('practice',{receipt:receipt()}),request=button(missing.render(),'取回上次命题')();missing.pending.reject(new Error('not found'));await request;assert.equal(missing.calls.length,1);assert.equal(missing.calls[0].kind,'retrieve');assert.equal(missing.session.size,1);
});
await check('explicit receipt discard requires confirmation and leaves typed input untouched',()=>{
  const h=uiHarness('correction',{receipt:{...receipt('essay'),jobId}});let tree=h.render();walk(tree,x=>x.type==='textarea'&&x.props.id==='essay-text').props.onChange({target:{value:'keep this draft'}});tree=h.render();h.win.confirm=()=>false;button(tree,'放弃回执')();assert.equal(h.session.size,1);h.win.confirm=()=>true;button(h.render(),'放弃回执')();assert.equal(h.session.size,0);assert.equal(walk(h.render(),x=>x.type==='textarea'&&x.props.id==='essay-text').props.value,'keep this draft');assert.equal(h.calls.length,0);
});
console.log(JSON.stringify({suite:'task-receipt',passed:checks.filter(x=>x.pass).length,total:checks.length,checks},null,2));
if(checks.some(x=>!x.pass))process.exitCode=1;
