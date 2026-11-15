import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';

mkdirSync('work/checks',{recursive:true});
await build({entryPoints:['components/learn/practice-draft.ts'],bundle:true,platform:'node',format:'cjs',outfile:'work/checks/practice-draft.cjs'});
const draft=createRequire(import.meta.url)('../work/checks/practice-draft.cjs');
const key='lexigo.practice-draft.v1';
const memory=new Map();
globalThis.window={localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};
const paper={id:'review-fixture',title:'School garden',type:'grammar',level:'标准',topic:'校园生活',passage:'Our school [1] a garden.',instructions:'填空',questions:[{id:'1',prompt:'have',answer:'has',explanation:'主谓一致',evidence:'Our school',knowledge:'第三人称单数',points:1.5}],minutes:10,source:'原创回归检查',origin:'original'};
const now=Date.now();
const fresh=()=>({paper,answers:{'1':'has'},elapsed:73,savedAt:new Date(now).toISOString()});
const put=value=>memory.set(key,JSON.stringify(value));
const checks=[];
function test(name,fn){memory.clear();try{fn();checks.push({name,pass:true});}catch(error){checks.push({name,pass:false,error:error.message});}}

test('saving and restoring preserves work, timer and public passage',()=>{
  assert.equal(draft.writeDraft(paper,{'1':'have'},73),true);
  const restored=draft.readDraft();
  assert.equal(restored.paper.passage,paper.passage);
  assert.deepEqual(restored.answers,{'1':'have'});
  assert.equal(restored.elapsed,73);
  assert.equal(draft.answeredCount(restored),1);
});
test('draft never stores plain answer keys or explanations',()=>{
  draft.writeDraft(paper,{'1':'have'},0);
  const stored=JSON.parse(memory.get(key));
  assert.equal(stored.paper.questions[0].answer,undefined);
  assert.equal(stored.paper.questions[0].explanation,undefined);
  assert.equal(stored.paper.questions[0].evidence,undefined);
});
test('empty answers keep an opened paper available',()=>{
  draft.writeDraft(paper,{},0);
  assert.equal(draft.readDraft().paper.id,paper.id);
  assert.equal(draft.answeredCount(draft.readDraft()),0);
});
test('grading another paper cannot erase this draft',()=>{
  draft.writeDraft(paper,{'1':'have'},0);
  draft.clearDraft('another-paper');
  assert.equal(draft.readDraft().paper.id,paper.id);
  draft.clearDraft(paper.id);
  assert.equal(draft.readDraft(),null);
});
test('invalid timestamp cannot produce a resumable draft',()=>{
  put({...fresh(),savedAt:'not-a-date'});
  assert.equal(draft.readDraft(),null);
});
test('implausibly future timestamp is rejected',()=>{
  put({...fresh(),savedAt:new Date(now+30*86400000).toISOString()});
  assert.equal(draft.readDraft(),null);
});
test('expired draft is removed',()=>{
  put({...fresh(),savedAt:new Date(now-15*86400000).toISOString()});
  assert.equal(draft.readDraft(),null);
  assert.equal(memory.has(key),false);
});
test('non-finite timer cannot reach the timer UI',()=>{
  memory.set(key,JSON.stringify(fresh()).replace('"elapsed":73','"elapsed":1e999'));
  const restored=draft.readDraft();
  assert.ok(restored===null||Number.isFinite(restored.elapsed));
});
test('malformed JSON and questions are harmless',()=>{
  memory.set(key,'{');assert.equal(draft.readDraft(),null);
  put({...fresh(),paper:{...paper,questions:[null]}});assert.equal(draft.readDraft(),null);
});
test('expired AI grading keeps answers readable and exportable',()=>{
  const expired={...paper,origin:'ai',sealed:'fixture-only',expiresAt:new Date(now-1000).toISOString()};
  draft.writeDraft(expired,{'1':'have'},73);
  const restored=draft.readDraft();
  assert.equal(draft.isPaperGradingExpired(restored.paper),true);
  assert.equal(restored.answers['1'],'have');
  assert.equal(restored.elapsed,73);
  assert.equal(draft.isPaperGradingExpired(paper),false);
});
test('editing a draft does not extend AI grading expiry or its first-save time',()=>{
  const firstSavedAt=new Date(now-8*86400000).toISOString();
  put({...fresh(),paper:{...paper,origin:'ai'},firstSavedAt});
  const old=draft.readDraft();
  assert.equal(draft.isPaperGradingExpired(old.paper),true);
  draft.writeDraft(old.paper,{'1':'has'},91);
  const edited=draft.readDraft();
  assert.equal(edited.firstSavedAt,firstSavedAt);
  assert.equal(edited.paper.expiresAt,old.paper.expiresAt);
  assert.equal(draft.isPaperGradingExpired(edited.paper),true);
});
test('recent draft remains readable after seven days but before retention expiry',()=>{
  put({...fresh(),savedAt:new Date(now-9*86400000).toISOString()});
  assert.equal(draft.readDraft().answers['1'],'has');
});
test('storage failure is surfaced to the caller',()=>{
  const original=window.localStorage.setItem;
  window.localStorage.setItem=()=>{throw new Error('Quota exceeded');};
  try{assert.equal(draft.writeDraft(paper,{},0),false);}finally{window.localStorage.setItem=original;}
});

for(const check of checks)console.log(`${check.pass?'PASS':'FAIL'} ${check.name}${check.error?`: ${check.error.split('\n')[0]}`:''}`);
console.log(JSON.stringify({checks:checks.length,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length}));
if(checks.some(c=>!c.pass))process.exitCode=1;
