import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';

const require = createRequire(import.meta.url), ts = require('typescript'), root = process.cwd();
const checks = [], copy = value => JSON.parse(JSON.stringify(value));
const storageKey = 'lexigo.progress.v1.primary.g3', draftKey = 'lexigo.primary.dictation.3.v1';
const now = Date.now(), before = new Date(now - 60000).toISOString();
const word = {id:'p3-cat',word:'cat',translation:'猫',phonetic:'/kæt/',frequency:'low',rank:0,grade:3,topic:'动物',example:'I have a cat.',exampleZh:'我有一只猫。',pos:['n.']};
const second = {...word,id:'p3-dog',word:'dog',translation:'狗'};
const entry = w => ({word:w,misses:2,lastAnswer:'wrong',lastWrong:before});
const fresh = () => ({version:1,learned:[],starred:[],words:{},wrongbook:{},dictation:[],practice:[],examAttempts:[],corrections:[],days:[],mistakes:{},review:{},log:{},dailyGoal:20});
const seed = () => ({...fresh(),wrongbook:{[word.id]:entry(word),[second.id]:entry(second)}});
const attempt = (id, correct=1) => ({attemptId:id,band:'primary-grade-3',source:'wrongbook',total:1,correct});
const answer = (w, correct=true) => ({word:w,answer:correct?w.word:'wrong',correct});
async function check(name, run) {try {await run();checks.push({name,pass:true});}catch(error){checks.push({name,pass:false,error:error.stack});}}

// The real store and component handlers run together; no duplicate settlement implementation.
function harness(initial=seed(), draft) {
  const cache=new Map(),storage=new Map([[storageKey,JSON.stringify(initial)]]),writes=[];
  if(draft)storage.set(draftKey,JSON.stringify(draft));
  let renderState=null,writingFails=false;
  globalThis.window={location:{search:'?stage=primary&grade=3'},localStorage:{
    getItem:key=>storage.get(key)??null,
    setItem:(key,value)=>{if(writingFails)throw new DOMException('quota','QuotaExceededError');writes.push({key,value:JSON.parse(value)});storage.set(key,value);},
    removeItem:key=>storage.delete(key),
  },addEventListener(){},removeEventListener(){},confirm:()=>true};
  globalThis.localStorage=window.localStorage;
  const slot=init=>{const index=renderState.cursor++;if(!(index in renderState.slots))renderState.slots[index]=init();return [renderState.slots,index];};
  const react={
    createContext:value=>{const c={value};c.Provider={context:c};return c;},useContext:c=>c.value,
    useCallback:fn=>fn,useMemo:fn=>fn(),useSyncExternalStore:(_s,get)=>get(),
    useState:initial=>{const [s,i]=slot(()=>typeof initial==='function'?initial():initial);return [s[i],value=>{s[i]=typeof value==='function'?value(s[i]):value;}];},
    useRef:initial=>{const [s,i]=slot(()=>({current:initial}));return s[i];},
    useEffect:(effect,deps)=>{if(!renderState)return;const [s,i]=slot(()=>null),old=s[i];if(!old||!deps||deps.some((v,n)=>!Object.is(v,old.deps[n])))renderState.effects.push(()=>{old?.cleanup?.();s[i]={deps,cleanup:effect()};});},
  };
  const jsx=(type,props)=>{if(type?.context)type.context.value=props.value;return {type,props};};
  function pathOf(path){for(const suffix of ['','.ts','.tsx','.json'])if(existsSync(path+suffix))return path+suffix;throw Error(`Missing ${path}`);}
  function load(path){
    const full=pathOf(resolve(root,path));if(cache.has(full))return cache.get(full).exports;
    if(full.endsWith('.json'))return JSON.parse(readFileSync(full,'utf8'));
    const module={exports:{}};cache.set(full,module);
    const code=ts.transpileModule(readFileSync(full,'utf8'),{fileName:full,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const localRequire=name=>{
      if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
      if(name==='lucide-react')return new Proxy({},{get:(_t,key)=>key==='__esModule'?true:()=>null});
      if(name==='../learn/ui')return {downloadText(){}};
      if(name.startsWith('.'))return load(resolve(dirname(full),name));if(name.startsWith('@/'))return load(resolve(root,name.slice(2)));return require(name);
    };
    new Function('require','module','exports',code)(localRequire,module,module.exports);return module.exports;
  }
  const progress=load('components/learn/progress.tsx'),dictation=load('components/primary/primary-dictation.tsx');
  const state={slots:[],cursor:0,effects:[]},speech={supported:true,hasEnglish:true,stop(){},prime(){},speak:()=>true};
  const api=()=>{renderState=null;return progress.ProgressProvider({children:null}).props.value;};
  function render(){api();state.cursor=0;state.effects=[];renderState=state;const tree=dictation.PrimaryDictation({grade:3,words:[word,second],speech});renderState=null;for(const effect of state.effects)effect();return tree;}
  return {api,render,progress,dictation,storage,writes,read:()=>JSON.parse(storage.get(storageKey)),draft:()=>JSON.parse(storage.get(draftKey)),capture:ids=>progress.captureWrongbookSnapshot(api().progress.wrongbook,ids),failWrites:value=>{writingFails=value;}};
}
function walk(tree,fn){if(Array.isArray(tree)){for(const item of tree){const found=walk(item,fn);if(found)return found;}}else if(tree&&typeof tree==='object'){if(fn(tree))return tree;return walk(tree.props?.children,fn);}return null;}
function text(tree){return Array.isArray(tree)?tree.map(text).join(''):typeof tree==='string'||typeof tree==='number'?String(tree):tree&&typeof tree==='object'?text(tree.props?.children):'';}
function button(tree,label){const node=walk(tree,x=>x.type==='button'&&text(x)===label);assert.ok(node,`Missing button ${label}`);return node.props.onClick;}
function completed(snapshot){return {v:1,id:'completed-drill',grade:3,items:[word],index:1,results:[{...answer(word),skipped:false}],input:'',startedAt:now,savedAt:now,recorded:true,rate:.85,repeat:1,hint:true,source:'wrongbook',wrongbookSnapshot:snapshot};}

await check('only correct captured wrong words clear; missed, skipped and uncaptured entries remain in one write',()=>{
  const h=harness(),snapshot=h.capture([word.id,second.id]);
  h.api().recordDictation({...attempt('settle'),total:3},[answer(word),answer(second,false),answer({...word,id:'p3-new'})],snapshot);
  const state=h.read();assert.equal(state.wrongbook[word.id],undefined);assert.equal(state.wrongbook[second.id].misses,3);assert.equal(state.wrongbook[second.id].revision,'settle');
  assert.equal(state.dictation.length,1);assert.equal(h.writes.length,1);assert.equal(h.writes[0].value.dictation[0].attemptId,'settle');assert.equal(h.writes[0].value.wrongbook[word.id],undefined);
});
await check('repeat completion and reload/import cannot clear a later wrong answer or double-count history',()=>{
  let h=harness();const snapshot=h.capture([word.id]),a=attempt('once'),results=[answer(word)];
  h.api().recordDictation(a,results,snapshot);h.api().recordDictation({...attempt('later',0),source:undefined},[answer(word,false)]);
  const saved=h.read();h.api().recordDictation(a,results,snapshot);assert.deepEqual(h.read(),saved);
  h=harness(saved);h.api().recordDictation(a,results,snapshot);assert.equal(h.api().progress.wrongbook[word.id].revision,'later');assert.equal(h.api().progress.dictation.length,2);
  h.api().replaceAll(h.progress.parseProgress(copy(saved)));h.api().recordDictation(a,results,snapshot);assert.equal(h.api().progress.wrongbook[word.id].revision,'later');assert.equal(h.api().progress.dictation.length,2);
});
await check('a newer failure during the drill survives even if the old drill then answers correctly',()=>{
  const h=harness(),snapshot=h.capture([word.id]);h.api().recordDictation({...attempt('new-failure',0),source:undefined},[answer(word,false)]);
  h.api().recordDictation(attempt('old-drill'),[answer(word)],snapshot);assert.equal(h.read().wrongbook[word.id].misses,3);assert.equal(h.read().wrongbook[word.id].revision,'new-failure');
});
await check('revision protects removed and re-added mistakes even within the same millisecond and same miss count',()=>{
  const NativeDate=globalThis.Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  try{const h=harness(fresh());h.api().recordDictation({...attempt('first',0),source:undefined},[answer(word,false)]);const snapshot=h.capture([word.id]);h.api().removeWrong(word.id);h.api().recordDictation({...attempt('second',0),source:undefined},[answer(word,false)]);
    assert.equal(h.read().wrongbook[word.id].lastWrong,snapshot[word.id].lastWrong);assert.equal(h.read().wrongbook[word.id].misses,snapshot[word.id].misses);
    h.api().recordDictation(attempt('old-success'),[answer(word)],snapshot);assert.equal(h.read().wrongbook[word.id].revision,'second');
  }finally{globalThis.Date=NativeDate;}
});
await check('ordinary, high-school, legacy or missing-attempt-ID completions never settle the wrongbook',()=>{
  for(const patch of [{source:undefined},{source:'frequency'},{band:'all'},{attemptId:undefined}]){const h=harness(),snapshot=h.capture([word.id]);h.api().recordDictation({...attempt('protected'),...patch},[answer(word)],snapshot);assert.ok(h.read().wrongbook[word.id]);}
  const h=harness();h.api().recordDictation(attempt('legacy'),[answer(word)]);assert.ok(h.read().wrongbook[word.id]);
});
await check('legacy entries without revision can settle once, while words absent at start never clear',()=>{
  const h=harness(),snapshot=h.capture([word.id]);assert.equal(snapshot[word.id].revision,undefined);h.api().recordDictation(attempt('legacy-entry'),[answer(word),answer(second)],snapshot);assert.equal(h.read().wrongbook[word.id],undefined);assert.ok(h.read().wrongbook[second.id]);
});
await check('draft restore validates ownership/timestamps and retains a frozen snapshot instead of recapturing current mistakes',()=>{
  const h=harness(),snapshot=h.capture([word.id]),r=completed(snapshot),parse=x=>h.dictation.parsePrimaryDictationDraft(JSON.stringify(x),3,now);
  assert.deepEqual(parse(r).wrongbookSnapshot,snapshot);const old=copy(r);delete old.source;delete old.wrongbookSnapshot;assert.ok(parse(old));assert.equal(parse(old).wrongbookSnapshot,undefined);
  for(const patch of [{source:undefined},{source:'frequency'},{wrongbookSnapshot:null},{wrongbookSnapshot:[]},{wrongbookSnapshot:{unknown:snapshot[word.id]}},{wrongbookSnapshot:{[word.id]:{...snapshot[word.id],misses:0}}},{wrongbookSnapshot:{[word.id]:{...snapshot[word.id],lastWrong:new Date(now+1000).toISOString()}}},{wrongbookSnapshot:{[word.id]:{...snapshot[word.id],revision:123}}}])assert.equal(parse({...r,...patch}),null);
});
await check('restoring a completed drill is idempotent and cannot erase an intervening failure',()=>{
  const initial=harness(),snapshot=initial.capture([word.id]);initial.api().recordDictation({...attempt('intervening',0),source:undefined},[answer(word,false)]);
  const h=harness(initial.read(),completed(snapshot));h.render();h.render();h.render();assert.equal(h.read().wrongbook[word.id].revision,'intervening');assert.equal(h.read().dictation.length,2);
});
await check('actual wrong-only UI freezes the selected words and completes settlement under the same attempt ID',()=>{
  const h=harness();h.render();let tree=h.render();const label=walk(tree,x=>x.type==='label'&&text(x).includes('只练错词本里的词'));walk(label,x=>x.type==='input').props.onChange({target:{checked:true}});tree=h.render();button(tree,'开始听写')();
  const draft=h.draft();assert.equal(draft.source,'wrongbook');assert.equal(Object.keys(draft.wrongbookSnapshot).length,2);
  for(let i=0;i<2;i++){tree=h.render();const input=walk(tree,x=>x.type==='input'&&x.props['aria-label']==='输入听到的英文单词');input.props.onChange({target:{value:h.draft().items[i].word}});tree=h.render();button(tree,'检查')();tree=h.render();button(tree,i===1?'完成并查看结果':'下一个')();}
  h.render();assert.deepEqual(h.read().wrongbook,{});assert.equal(h.read().dictation.length,1);assert.equal(h.read().dictation[0].attemptId,draft.id);assert.equal(h.read().dictation[0].source,'wrongbook');
});
await check('retry-wrong UI creates a new snapshot while a normal start has no cleanup authority',()=>{
  const h=harness();h.render();button(h.render(),'开始听写')();assert.equal(h.draft().source,undefined);assert.equal(h.draft().wrongbookSnapshot,undefined);
  const failed=completed(undefined);delete failed.source;delete failed.wrongbookSnapshot;failed.id='failed-normal';failed.results=[{...answer(word,false),skipped:false}];
  const retry=harness(seed(),failed);retry.render();retry.render();let tree=retry.render();button(tree,'只练错词（1）')();const r=retry.draft();assert.notEqual(r.id,failed.id);assert.equal(r.source,'wrongbook');assert.equal(r.wrongbookSnapshot[word.id].revision,'failed-normal');assert.equal(r.wrongbookSnapshot[word.id].misses,3);
});
await check('a failed storage write cannot persist a partial cleanup/history; reload can retry the entire settlement',()=>{
  const h=harness(),snapshot=h.capture([word.id]),original=h.read();h.failWrites(true);h.api().recordDictation(attempt('disk-retry'),[answer(word)],snapshot);assert.deepEqual(h.read(),original);assert.equal(h.api().storageAvailable,false);
  const reloaded=harness(h.read());reloaded.api().recordDictation(attempt('disk-retry'),[answer(word)],snapshot);assert.equal(reloaded.read().wrongbook[word.id],undefined);assert.equal(reloaded.read().dictation.length,1);
});
console.log(JSON.stringify({suite:'primary-dictation-settlement',passed:checks.filter(x=>x.pass).length,total:checks.length,checks},null,2));
if(checks.some(x=>!x.pass))process.exitCode=1;
