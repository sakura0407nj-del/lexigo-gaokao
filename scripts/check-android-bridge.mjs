import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
await build({entryPoints:['components/learn/android-bridge.ts'],bundle:true,platform:'node',format:'cjs',outfile:'work/checks/android-bridge.cjs',logLevel:'silent'});
const require=createRequire(import.meta.url);
const bridge=require('../work/checks/android-bridge.cjs');
let checks=0;
async function check(name,fn){await fn();checks++;console.log(`PASS ${name}`);}
await check('ordinary browser stays outside Android and fails clearly',async()=>{globalThis.window={};assert.equal(bridge.hasAndroidBridge(),false);await assert.rejects(bridge.androidRequest('ttsStatus'),/不是拾词安卓/);});
let sent=[];
const port={postMessage(text){sent.push(JSON.parse(text));},onmessage:null};
globalThis.window={LexiGoNative:port};
const reply=(id,result,ok=true,error)=>port.onmessage({data:JSON.stringify({id,result,ok,error})});
await check('concurrent requests resolve only their own out-of-order replies',async()=>{
 const a=bridge.androidRequest('ttsStatus'),b=bridge.androidRequest('saveText',{filename:'备份.json',content:'{"词":"apple"}',mime:'application/json'});
 assert.equal(sent[1].payload.content,'{"词":"apple"}');assert.notEqual(sent[0].id,sent[1].id);
 reply(sent[1].id,{saved:true});reply(sent[0].id,{ready:true,voices:[]});
 assert.deepEqual(await b,{saved:true});assert.deepEqual(await a,{ready:true,voices:[]});
});
await check('invalid, unknown and duplicate messages cannot finish another operation',async()=>{
 const task=bridge.androidRequest('speak',{text:'apple'});const id=sent.at(-1).id;let settled=false;task.then(()=>settled=true);
 port.onmessage({data:'invalid'});reply('unknown',true);port.onmessage({data:JSON.stringify({id,ok:'true',result:'bad'})});
 await Promise.resolve();assert.equal(settled,false);reply(id,'spoken');assert.equal(await task,'spoken');reply(id,'duplicate');
});
await check('native cancellation is a rejected save, never false success',async()=>{
 const task=bridge.androidRequest('saveText');reply(sent.at(-1).id,null,false,'已取消保存');await assert.rejects(task,/取消/);
});
await check('missing native response times out and later replies are harmless',async()=>{
 const task=bridge.androidRequest('ttsStatus',{},5);const id=sent.at(-1).id;await assert.rejects(task,/超时/);reply(id,{ready:true});
});
await check('connection replacement rejects stale tasks instead of accepting wrong results',async()=>{
 const old=bridge.androidRequest('speak');const caught=assert.rejects(old,/连接已更新/);
 const nextPort={postMessage(text){sent.push(JSON.parse(text));},onmessage:null};window.LexiGoNative=nextPort;
 const current=bridge.androidRequest('ttsStatus');nextPort.onmessage({data:JSON.stringify({id:sent.at(-1).id,ok:true,result:{ready:true}})});
 await caught;assert.deepEqual(await current,{ready:true});
});
await check('transport exceptions reject without dangling timeout',async()=>{window.LexiGoNative={postMessage(){throw new Error('closed');},onmessage:null};await assert.rejects(bridge.androidRequest('stopSpeech'),/无法连接/);});
await check('voice mapping keeps language and offline preference without accepting malformed entries',()=>{
 const voices=bridge.androidVoices({ready:true,voices:[{name:'English',lang:'en-US',localService:true,default:true},{name:4,lang:'en-GB'},null]});
 assert.deepEqual(voices,[{name:'English',lang:'en-US',voiceURI:'android:English',localService:true,default:true}]);
 assert.deepEqual(bridge.androidVoices({ready:true,voices:null}),[]);
});
console.log(JSON.stringify({checks,passed:checks,failed:0}));
