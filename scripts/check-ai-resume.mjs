import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const compiled=await build({entryPoints:['components/learn/api.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const source=compiled.outputFiles[0].text;
function load(){const module={exports:{}};new Function('exports','module','require',source)(module.exports,module,require);return module.exports;}
const savedFetch=globalThis.fetch,savedTimeout=globalThis.setTimeout;
const jobId='2026-11-15_00000000-0000-4000-8000-000000000001';
const input={type:'reading',level:'标准',topic:'School life'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const calls=[];let passed=0;
globalThis.setTimeout=(fn,_ms,...args)=>savedTimeout(fn,0,...args);
try {
  let client=load(),submitted='';
  globalThis.fetch=async(path,init)=>{calls.push({path,method:init?.method||'GET'});if(path==='/api/session')return json({ok:true});if(path==='/api/ai/jobs')return json({jobId,pollUrl:`/api/ai/jobs/${jobId}`},202);return json({status:'succeeded',result:{status:200,body:{id:'new-paper'}}});};
  assert.equal((await client.api.generate(input,undefined,{onSubmitted:id=>{submitted=id;}})).id,'new-paper');
  assert.equal(submitted,jobId);assert.equal(calls.filter(call=>call.path==='/api/ai/jobs').length,1);passed++;

  client=load();calls.length=0;submitted='';
  assert.equal((await client.api.generate(input,undefined,{resumeJobId:jobId,onSubmitted:id=>{submitted=id;}})).id,'new-paper');
  assert.equal(calls.some(call=>call.path==='/api/ai/jobs'),false,'Resuming submitted a new paid job');assert.equal(submitted,'');passed++;

  client=load();globalThis.fetch=async path=>path==='/api/session'?json({ok:true}):json({status:'failed',result:{status:503,body:{error:'provider unavailable'}}});
  await assert.rejects(()=>client.api.generate(input,undefined,{resumeJobId:jobId}),error=>error instanceof client.ApiError&&error.status===503&&error.jobTerminal===true);passed++;

  client=load();globalThis.fetch=async path=>path==='/api/session'?json({ok:true}):json({error:'expired'},404);
  await assert.rejects(()=>client.api.generate(input,undefined,{resumeJobId:jobId}),error=>error.jobTerminal===true&&error.status===404);passed++;

  client=load();const controller=new AbortController();let polls=0;
  globalThis.fetch=async path=>{if(path==='/api/session')return json({ok:true});polls++;controller.abort();throw new DOMException('Interrupted','AbortError');};
  await assert.rejects(()=>client.api.generate(input,controller.signal,{resumeJobId:jobId}),error=>error.name==='AbortError'&&!error.jobTerminal);assert.equal(polls,1);passed++;

  client=load();calls.length=0;globalThis.fetch=async(path,init)=>{calls.push({path,method:init?.method||'GET'});return json({ok:true});};
  await assert.rejects(()=>client.api.generate(input,undefined,{resumeJobId:'invalid/../id'}),error=>error.status===400&&error.jobTerminal===true);assert.equal(calls.some(call=>call.path.startsWith('/api/ai/jobs')),false);passed++;

  client=load();let pendingRequestId='',acceptedRequestId='';const beforeAck=new AbortController();
  globalThis.fetch=async(path,init)=>{if(path==='/api/session')return json({ok:true});const body=JSON.parse(init.body);assert.equal(body.requestId,pendingRequestId,'Request ID was not saved before network submission');acceptedRequestId=body.requestId;beforeAck.abort();throw new DOMException('Closed before acknowledgement','AbortError')};
  await assert.rejects(()=>client.api.generate(input,beforeAck.signal,{onSubmitting:id=>{pendingRequestId=id}}),error=>error.name==='AbortError');
  assert.ok(pendingRequestId);assert.equal(pendingRequestId,acceptedRequestId);passed++;
  client=load();let resumedRequestId='';
  globalThis.fetch=async(path,init)=>{if(path==='/api/session')return json({ok:true});if(path==='/api/ai/jobs'){const body=JSON.parse(init.body);resumedRequestId=body.requestId;return json({jobId,pollUrl:`/api/ai/jobs/${jobId}`},202)}return json({status:'succeeded',result:{status:200,body:{id:'same-paper'}}})};
  assert.equal((await client.api.generate(input,undefined,{resumeRequestId:pendingRequestId})).id,'same-paper');assert.equal(resumedRequestId,acceptedRequestId,'Reload started a different billed submission');passed++;

  client=load();calls.length=0;globalThis.fetch=async(path,init)=>{calls.push({path,method:init?.method||'GET'});return json({ok:true})};
  await assert.rejects(()=>client.api.generate(input,undefined,{resumeRequestId:'not-a-uuid'}),error=>error.status===400&&error.jobTerminal===true);assert.equal(calls.some(call=>call.path==='/api/ai/jobs'),false);passed++;

  client=load();const requestIds=[];
  globalThis.fetch=async(path,init)=>{if(path==='/api/session')return json({ok:true});if(path==='/api/ai/jobs'){requestIds.push(JSON.parse(init.body).requestId);if(requestIds.length===1)throw new TypeError('network interrupted');return json({error:'invalid payload'},422)}throw new Error('unexpected poll')};
  await assert.rejects(()=>client.api.generate(input,undefined,{resumeRequestId:pendingRequestId}),error=>error.status===422&&error.jobTerminal===true);assert.deepEqual(requestIds,[pendingRequestId,pendingRequestId]);passed++;
  console.log(`PASS ${passed}: AI submission callbacks, no duplicate resumed jobs, pre-ACK cancellation/reload, terminal failures, expired jobs, interruption, invalid IDs`);
} finally {globalThis.fetch=savedFetch;globalThis.setTimeout=savedTimeout;}
