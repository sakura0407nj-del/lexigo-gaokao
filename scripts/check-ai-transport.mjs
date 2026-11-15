import {build} from 'esbuild';import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
mkdirSync('work/checks',{recursive:true});
await build({entryPoints:['lib/learning-server.ts'],bundle:true,platform:'node',format:'cjs',outfile:'work/checks/ai-server.cjs'});
const {askAI}=createRequire(import.meta.url)('../work/checks/ai-server.cjs');
const realFetch=globalThis.fetch;let calls=[];
const envNames=['AI_API_KEY','AI_MODEL','AI_FALLBACK_MODEL'];
const savedEnv=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
Object.assign(process.env,{AI_API_KEY:'TEST_ONLY',AI_MODEL:'test-primary',AI_FALLBACK_MODEL:'test-fallback'});
const response=(content,status=200)=>Response.json({choices:[{message:{content},finish_reason:'stop'}]},{status});
try{
  globalThis.fetch=async(_url,init)=>{calls.push(JSON.parse(init.body));return response(calls.length===1?'incomplete {':'{"ok":true}')};
  assert.deepEqual(await askAI('Return JSON','test'),{ok:true});assert.equal(calls.length,2);assert.ok(calls.every(c=>c.response_format.type==='json_object'));assert.match(calls[1].messages[0].content,/previous response/);
  calls=[];globalThis.fetch=async()=>{calls.push(1);return response('{')};
  await assert.rejects(()=>askAI('Return JSON','test'),e=>e.status===502);assert.equal(calls.length,2);
  calls=[];globalThis.fetch=async()=>{calls.push(1);return response('',429)};
  await assert.rejects(()=>askAI('Return JSON','test'),e=>e.status===429);assert.equal(calls.length,1);
}finally{globalThis.fetch=realFetch;for(const name of envNames){if(savedEnv[name]===undefined)delete process.env[name];else process.env[name]=savedEnv[name];}}
console.log('PASS: bounded JSON retry, complete-response recovery, invalid-result rejection, no retry of rate limits');
