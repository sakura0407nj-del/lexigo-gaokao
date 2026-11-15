import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {dirname,resolve} from 'node:path';

const require=createRequire(import.meta.url),ts=require('typescript');
const records=new Map(),metadata=new Map();
const clone=value=>value===undefined?null:structuredClone(value);
const store={
  async get(key){return clone(records.get(key))},
  async list({prefix=''}){return {blobs:[...records.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}},
  async setJSON(key,value,options={}){if(options.onlyIfNew&&records.has(key))return {modified:false};records.set(key,clone(value));metadata.set(key,options.metadata||{});return {modified:true}},
  async delete(key){records.delete(key);metadata.delete(key)},
  async getMetadata(key){return records.has(key)?{metadata:metadata.get(key)}:null},
};
class PublicApiError extends Error{constructor(status,message){super(message);this.status=status}}
const sign=(scope,value)=>createHmac('sha256','public-idempotency-test-fixture').update(scope+'\0'+value).digest('base64url');
const session={PublicApiError,privateOwner:user=>sign('owner',user),signPublicValue:sign,verifyPublicValue:(scope,value,signature)=>sign(scope,value)===signature};
const modules=new Map();
function load(file){
  const absolute=resolve(file);
  if(absolute===resolve('lib/public-session.ts'))return session;
  if(modules.has(absolute))return modules.get(absolute).exports;
  const module={exports:{}};modules.set(absolute,module);
  const code=ts.transpileModule(readFileSync(absolute,'utf8'),{fileName:absolute,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const localRequire=name=>{
    if(name==='@netlify/blobs')return {getStore:()=>store};
    if(name.startsWith('.')){const candidate=resolve(dirname(absolute),name);return load(existsSync(candidate)?candidate:candidate+'.ts');}
    return createRequire(absolute)(name);
  };
  new Function('require','module','exports',code)(localRequire,module,module.exports);return module.exports;
}
const jobs=load('lib/job-store.ts'),realNow=Date.now;
let now=Date.parse('2026-11-15T15:59:59.000Z');Date.now=()=>now;
const beforeMidnight=now,afterMidnight=Date.parse('2026-11-15T16:00:01.000Z');
const requestId='11111111-1111-4111-8111-111111111111';
const input=jobs.parseJobSubmission({kind:'generate',payload:{type:'reading',level:'标准',topic:'School clubs'},requestId});
const quotaCount=()=>[...records.keys()].filter(key=>key.startsWith('quotas/')).length;
const jobCount=()=>[...records.keys()].filter(key=>key.startsWith('jobs/')).length;
const jobKey=id=>`jobs/${id.slice(0,10)}/${id.slice(11)}`;
const checks=[];
async function test(name,run){records.clear();metadata.clear();now=beforeMidnight;try{await run();checks.push({name,passed:true})}catch(error){checks.push({name,passed:false,error:error.message})}}

try{
  await test('same-day retries reuse the job and only three quota slots',async()=>{
    const first=await jobs.createLearningJob(input,'alice','ip-a');const retry=await jobs.createLearningJob(input,'alice','ip-a');
    assert.equal(first.created,true);assert.equal(retry.created,false);assert.equal(retry.job.id,first.job.id);assert.equal(jobCount(),1);assert.equal(quotaCount(),3);
  });
  await test('Beijing midnight retries preserve the original job, expiry and quota',async()=>{
    const first=await jobs.createLearningJob(input,'alice','ip-a');now=afterMidnight;assert.notEqual(jobs.quotaDay(),first.job.id.slice(0,10));
    const retry=await jobs.createLearningJob(input,'alice','ip-a');assert.equal(retry.created,false);assert.deepEqual(retry.job,first.job);assert.equal(jobCount(),1);assert.equal(quotaCount(),3);
  });
  await test('a live previous-day request rejects changed content with 409',async()=>{
    await jobs.createLearningJob(input,'alice','ip-a');now=afterMidnight;
    const changed=jobs.parseJobSubmission({...input,payload:{...input.payload,topic:'A different topic'}});
    await assert.rejects(()=>jobs.createLearningJob(changed,'alice','ip-a'),error=>error.status===409);assert.equal(jobCount(),1);assert.equal(quotaCount(),3);
  });
  await test('request IDs remain isolated between visitor owners',async()=>{
    const first=await jobs.createLearningJob(input,'alice','ip-a');now=afterMidnight;const other=await jobs.createLearningJob(input,'bob','ip-b');
    assert.equal(other.created,true);assert.notEqual(other.job.id,first.job.id);assert.notEqual(other.job.owner,first.job.owner);assert.equal(quotaCount(),6);
  });
  await test('replay immediately before the 24-hour boundary preserves expiration',async()=>{
    const first=await jobs.createLearningJob(input,'alice','ip-a');now=first.job.expiresAt-1;
    const retry=await jobs.createLearningJob(input,'alice','ip-a');assert.equal(retry.created,false);assert.equal(retry.job.expiresAt,first.job.expiresAt);assert.equal(quotaCount(),3);
  });
  await test('the exact expiry boundary creates a fresh job without reviving the old one',async()=>{
    const first=await jobs.createLearningJob(input,'alice','ip-a');now=first.job.expiresAt;
    const retry=await jobs.createLearningJob(input,'alice','ip-a');assert.equal(retry.created,true);assert.notEqual(retry.job.id,first.job.id);assert.equal(retry.job.expiresAt,now+86400000);assert.equal(quotaCount(),6);
    await assert.rejects(()=>jobs.learningJobView(first.job.id,'alice'),error=>error.status===404);
  });
  await test('expired previous-day content does not cause a false conflict',async()=>{
    const first=await jobs.createLearningJob(input,'alice','ip-a');now=first.job.expiresAt;
    const changed=jobs.parseJobSubmission({...input,payload:{...input.payload,topic:'A new day and new topic'}});assert.equal((await jobs.createLearningJob(changed,'alice','ip-a')).created,true);
  });
  await test('an expired current-day record cannot be resurrected',async()=>{
    const first=await jobs.createLearningJob(input,'alice','ip-a');records.get(jobKey(first.job.id)).expiresAt=now;
    await assert.rejects(()=>jobs.createLearningJob(input,'alice','ip-a'),error=>error.status===404);assert.equal(quotaCount(),3);
  });
  await test('parallel resumptions after midnight reuse the accepted job',async()=>{
    const first=await jobs.createLearningJob(input,'alice','ip-a');now=afterMidnight;
    const results=await Promise.all(Array.from({length:20},()=>jobs.createLearningJob(input,'alice','ip-a')));
    assert.ok(results.every(result=>!result.created&&result.job.id===first.job.id));assert.equal(jobCount(),1);assert.equal(quotaCount(),3);
  });
  await test('conditional writes still deduplicate simultaneous same-day submissions',async()=>{
    const results=await Promise.all(Array.from({length:20},()=>jobs.createLearningJob(input,'alice','ip-a')));
    assert.equal(results.filter(result=>result.created).length,1);assert.equal(new Set(results.map(result=>result.job.id)).size,1);assert.equal(quotaCount(),3);
  });
  await test('an image task resumes even after its consumed upload was removed',async()=>{
    const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(1,16);png.writeUInt32BE(1,20);
    const uploadId=await jobs.storeUpload('alice','ip-a',png,'image/png');
    const imageInput=jobs.parseJobSubmission({kind:'correct',payload:{kind:'questions',text:'',maxScore:15},uploadIds:[uploadId],requestId});
    const first=await jobs.createLearningJob(imageInput,'alice','ip-a');await jobs.removeJobUploads(first.job);const used=quotaCount();now=afterMidnight;
    const retry=await jobs.createLearningJob(imageInput,'alice','ip-a');assert.equal(retry.created,false);assert.equal(retry.job.id,first.job.id);assert.equal(quotaCount(),used);
  });
  await test('a record with a mismatched owner is never returned',async()=>{
    const first=await jobs.createLearningJob(input,'alice','ip-a');records.get(jobKey(first.job.id)).owner='wrong-owner';now=afterMidnight;
    await assert.rejects(()=>jobs.createLearningJob(input,'alice','ip-a'),error=>error.status===404);assert.equal(quotaCount(),3);
  });
}finally{Date.now=realNow}
console.log(JSON.stringify({passed:checks.filter(check=>check.passed).length,failed:checks.filter(check=>!check.passed).length,checks},null,2));
if(checks.some(check=>!check.passed))process.exitCode=1;
