import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
mkdirSync('work/checks',{recursive:true});
await build({stdin:{contents:`export {handlePublicRequest} from './lib/public-router';export {issuePublicSession} from './lib/public-session';export {executeLearningJob} from './lib/job-runner';export {parseJobSubmission} from './lib/job-store';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:'work/checks/primary-server.cjs'});
const {handlePublicRequest,issuePublicSession,executeLearningJob,parseJobSubmission}=createRequire(import.meta.url)('../work/checks/primary-server.cjs');
const papers=JSON.parse(readFileSync('data/primary-papers.json','utf8'));
const primary=[...JSON.parse(readFileSync('data/primary-words.json','utf8')),...JSON.parse(readFileSync('data/primary-expanded-words.json','utf8'))];
const directory=JSON.parse(readFileSync('data/primary-textbook-index.json','utf8'));
const wordIds=new Set(primary.map(w=>w.id));
assert.equal(wordIds.size,primary.length,'Every primary word needs a stable unique ID');
const envNames=['PAPER_SECRET','AI_API_KEY','AI_MODEL','AI_FALLBACK_MODEL'],previous=Object.fromEntries(envNames.map(n=>[n,process.env[n]])),originalFetch=globalThis.fetch;
Object.assign(process.env,{PAPER_SECRET:'primary-test-only-secret-at-least-thirty-two',AI_API_KEY:'TEST_ONLY',AI_MODEL:'test-primary',AI_FALLBACK_MODEL:''});
const origin='https://primary-test.invalid',cookie=issuePublicSession(new Request(origin+'/api/session')).cookie.split(';')[0];
const post=(path,body,headers={})=>handlePublicRequest(new Request(origin+path,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
let checks=0;
try{
 for(const grade of [3,4,5,6]){
  const response=await handlePublicRequest(new Request(`${origin}/api/primary/words?grade=${grade}`)),data=await response.json();
  assert.equal(response.status,200);assert.ok(data.items.every(w=>w.grade===grade&&!w.frequencyKnown&&w.frequencyBand==='unknown'));assert.ok(data.topics.length);
  const books=directory.books.filter(b=>b.grade===grade),expected=new Set(primary.filter(w=>w.grade===grade).map(w=>w.id));
  assert.deepEqual(data.books.map(b=>b.id),books.map(b=>b.id));assert.ok(books.length>=2);
  for(const book of books)for(const unit of book.units)for(const id of unit.wordIds){assert.ok(wordIds.has(id),id);expected.add(id);}
  assert.equal(data.items.length,expected.size);assert.deepEqual(new Set(data.items.map(w=>w.id)),expected);assert.ok(expected.size>60);checks++;
  const bank=await (await handlePublicRequest(new Request(`${origin}/api/primary/bank?grade=${grade}`))).json();assert.equal(bank.items.length,4);assert.ok(bank.items.every(p=>p.grade===grade&&p.questions.every(q=>!('answer'in q)&&!('explanation'in q)&&!('evidence'in q))));checks++;
  const truth=papers.find(p=>p.id===bank.items[0].id),answers=Object.fromEntries(truth.questions.map(q=>[q.id,q.answer]));
  const report=await post('/api/primary/grade',{paperId:truth.id,answers});assert.equal(report.status,200);const gradeResult=await report.json();assert.equal(gradeResult.score,gradeResult.maxScore);assert.ok(gradeResult.items.every(q=>q.correct));checks++;
 }
 assert.equal((await handlePublicRequest(new Request(origin+'/api/primary/words?grade=2'))).status,400);
 const exported=await handlePublicRequest(new Request(origin+'/api/primary/directory.csv'));
 assert.equal(exported.status,200);assert.match(exported.headers.get('content-type'),/text\/csv/);
 const contents=Buffer.from(await exported.arrayBuffer());assert.deepEqual([...contents.subarray(0,3)],[239,187,191]);
 const rows=contents.toString('utf8').trimEnd().split('\r\n');
 assert.equal(rows.length,1+directory.books.reduce((n,b)=>n+(b.units.length?b.units.reduce((m,u)=>m+Math.max(1,u.wordIds.length),0):1),0));
 assert.ok(rows.some(row=>row.includes('https://')));assert.match(rows[0],/英文词目/);checks++;
 const wordlist=await (await handlePublicRequest(new Request(origin+'/api/primary/wordlist.csv'))).text();
 assert.equal(wordlist.trimEnd().split('\r\n').length,primary.length+1);assert.match(wordlist,/英文例句/);checks++;
 assert.equal((await post('/api/primary/grade',{paperId:papers[0].id,answers:{}},{Cookie:''})).status,401);
 assert.equal((await post('/api/primary/grade',{paperId:papers[0].id,answers:{bad:'A'}})).status,400);
 assert.equal((await post('/api/primary/grade',{paperId:papers[0].id,sealed:'invalid.seal',answers:{}})).status,400);
 assert.equal((await post('/api/primary/grade',{paperId:papers[0].id,answers:{},score:999})).status,400);checks++;
 const payload={stage:'primary',grade:3,type:'reading',level:'基础',topic:'pets'};
 assert.equal(parseJobSubmission({kind:'generate',payload}).payload.grade,3);
 const targeted={...payload,weaknesses:[{knowledge:'定位短文细节',prompt:'用新语境练习这个知识点'}]};
 assert.deepEqual(parseJobSubmission({kind:'generate',payload:targeted}).payload.weaknesses,targeted.weaknesses);
 assert.throws(()=>parseJobSubmission({kind:'generate',payload:{...targeted,weaknesses:[{...targeted.weaknesses[0],yourAnswer:'private answer'}]}}));
 for(const invalid of [{...payload,grade:2},{...payload,grade:undefined},{...payload,type:'seven'},{...payload,stage:'high'}])assert.throws(()=>parseJobSubmission({kind:'generate',payload:invalid}));
 assert.throws(()=>parseJobSubmission({kind:'correct',payload:{stage:'primary',grade:3,kind:'essay',text:'I like dogs.',maxScore:25}}));checks++;
 const generated=papers.find(p=>p.grade===3&&p.type==='reading');let prompt='';
 globalThis.fetch=async(_url,init)=>{prompt=JSON.parse(init.body).messages[0].content;return Response.json({choices:[{message:{content:JSON.stringify(generated)},finish_reason:'stop'}]});};
 const result=await executeLearningJob('generate',payload,'primary-test');assert.equal(result.status,200);assert.match(prompt,/Grade 3/);assert.match(prompt,/40–65/);assert.equal(result.body.grade,3);assert.ok(result.body.sealed);assert.ok(result.body.questions.every(q=>!q.answer));checks++;
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({...generated,questions:generated.questions.slice(0,3)})},finish_reason:'stop'}]});
 assert.equal((await executeLearningJob('generate',payload,'primary-test')).status,502);checks++;
 const correction={assessable:true,summary:'注意第三人称单数。',score:14,maxScore:15,dimensions:[{name:'内容',score:5,max:5,comment:'意思清楚'},{name:'语法',score:3,max:4,comment:'修改have'},{name:'词汇',score:3,max:3,comment:'适合本年级'},{name:'清晰度',score:3,max:3,comment:'标点正确'}],errors:[{original:'My cat have white fur.',corrected:'My cat has white fur.',reason:'My cat是第三人称单数，使用has。',category:'动词'}],revised:'My cat has white fur.',advice:['留意he/she/it后面的动词。'],uncertainty:[]};
 globalThis.fetch=async(_url,init)=>{prompt=JSON.parse(init.body).messages[0].content;return Response.json({choices:[{message:{content:JSON.stringify(correction)},finish_reason:'stop'}]});};
 assert.equal((await executeLearningJob('correct',{stage:'primary',grade:4,kind:'essay',text:'My cat have white fur.',maxScore:15},'primary-test')).status,200);assert.match(prompt,/Grade 4/);assert.match(prompt,/never use Gaokao/);checks++;
 console.log(JSON.stringify({passed:checks,realProviderRequests:0,coverage:['four-grade scoped vocabulary/banks','concealed answer keys and authoritative grading','invalid grade/owner/seal/score rejection','primary asynchronous AI context and format validation','age-appropriate writing rubric']}));
}finally{globalThis.fetch=originalFetch;for(const name of envNames){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
