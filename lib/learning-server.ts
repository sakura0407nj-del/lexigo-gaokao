import {AsyncLocalStorage} from 'node:async_hooks';
import {PublicApiError,readBoundedBody,requirePublicUser,requireSameOrigin} from './public-session';
import {z} from 'zod';
import type {Paper} from './learning-types';
import {readModelJson} from './learning-core';

type Runtime={AI_API_KEY?:string;AI_MODEL?:string;AI_FALLBACK_MODEL?:string;PAPER_SECRET?:string};
export const runtime=():Runtime=>process.env;
const jobContext=new AsyncLocalStorage<{user:string;quotaReserved:true}>();
export const withLearningJob=<T>(user:string,work:()=>Promise<T>)=>jobContext.run({user,quotaReserved:true},work);
export class ApiError extends Error {constructor(public status:number,message:string){super(message)}}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export function failure(e:unknown){
  if(e instanceof ApiError||e instanceof PublicApiError)return json({error:e.message},e.status);
  if(e instanceof z.ZodError)return json({error:'输入格式不正确，请检查题型、文本长度和图片格式。'},400);
  console.error('Learning API failed:',e instanceof Error?e.name:'Unknown');
  return json({error:'本次处理没有完成，请稍后重试。你的输入仍会保留。'},500);
}
export function userOf(req:Request){
  const job=jobContext.getStore();if(job)return job.user;
  requireSameOrigin(req);return requirePublicUser(req);
}
export async function bodyOf(req:Request,max=13*1024*1024){
  if(!(req.headers.get('content-type')||'').startsWith('application/json'))throw new ApiError(415,'请提交 JSON 数据。');
  if(Number(req.headers.get('content-length')||0)>max)throw new ApiError(413,'内容太大，请减少图片或文字。');
  const reader=req.body?.getReader(); if(!reader)throw new ApiError(400,'没有收到内容。');
  const decoder=new TextDecoder();let text='',size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new ApiError(413,'内容太大，请减少图片或文字。')}text+=decoder.decode(value,{stream:true})}
  text+=decoder.decode();try{return JSON.parse(text)}catch{throw new ApiError(400,'内容格式无效。')}
}
export async function reserveAI(user:string){
  const e=runtime();if(!e.AI_API_KEY)throw new ApiError(503,'AI 服务尚未配置，词库、听写和内置练习仍可使用。');
  const job=jobContext.getStore();
  if(!job?.quotaReserved||job.user!==user)throw new ApiError(403,'请通过学习任务提交 AI 请求。');
}
export async function askAI(system:string,text:string,images:string[]=[],maxTokens=6500){
  const e=runtime();
  const content=images.length?[{type:'text',text},...images.map(url=>({type:'image_url',image_url:{url}}))]:text;
  const deadline=Date.now()+140000;
  const models=[e.AI_MODEL||'[ASP]gemini-4-argon',e.AI_FALLBACK_MODEL||'[Kiro]claude-opus-5-5'];
  let modelIndex=0;
  for(let attempt=0;attempt<2;attempt++){
    let response:Response;
    const instruction=system+(attempt?'\nThe previous response was incomplete. Return a complete valid JSON object without Markdown. Keep explanations concise while retaining all required fields and questions.':'');
    try{response=await fetch('https://cdn.sta1n.cn/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${e.AI_API_KEY}`},body:JSON.stringify({model:models[modelIndex],messages:[{role:'system',content:instruction},{role:'user',content}],response_format:{type:'json_object'},temperature:0.35,max_tokens:maxTokens,stream:false}),signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))})}catch{throw new ApiError(504,'AI 响应超时，请稍后重试；输入未清除。')}
    if(!response.ok){
      let detail='';
      try{detail=new TextDecoder().decode(await readBoundedBody(response,8192)).slice(0,1000)}catch{/* Never retain unbounded upstream error bodies. */}
      const unavailable=response.status>=500||response.status===404||/无可用凭证|no available|model.*not found/i.test(detail);
      console.warn('AI provider unavailable',{status:response.status,model:models[modelIndex],attempt});
      if(attempt===0&&unavailable&&models[1]!==models[0]&&deadline-Date.now()>15000){modelIndex=1;continue;}
      throw new ApiError(response.status===429?429:502,response.status===429?'AI 通道当前繁忙，请稍后再试。':'AI 通道暂时无法处理请求，请稍后重试；输入已保留。');
    }
    let data:{choices?:{message?:{content?:string};finish_reason?:string}[]};
    try{data=JSON.parse(new TextDecoder().decode(await readBoundedBody(response,2*1024*1024)))}catch{
      console.warn('AI provider response was unreadable',{attempt});
      if(deadline-Date.now()<15000)break;
      continue;
    }
    if(!data||typeof data!=='object'||!Array.isArray(data.choices)){
      if(deadline-Date.now()<15000)break;
      continue;
    }
    const raw=data.choices?.[0]?.message?.content;
    if(typeof raw==='string'){
      try{return readModelJson(raw)}catch{console.warn('AI JSON incomplete',{attempt,length:raw.length,finish:data.choices?.[0]?.finish_reason});}
    }
    if(deadline-Date.now()<15000)break;
  }
  throw new ApiError(502,'AI 返回的格式不完整，请重试；输入已保留。');
}
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(){const secret=runtime().PAPER_SECRET;if(!secret)throw new ApiError(503,'命题服务尚未准备好。');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
export async function sealPaper(paper:Paper,user:string){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),enc.encode(JSON.stringify({paper,user,expires:Date.now()+7*86400000})));return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`}
export async function openPaper(sealed:string,user:string):Promise<Paper>{
  try{if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(sealed))throw Error();const [iv,content]=sealed.split('.');const nonce=unb64(iv);if(nonce.length!==12)throw Error();const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},await key(),unb64(content));const data=JSON.parse(dec.decode(decoded));if(data.user!==user||!Number.isFinite(data.expires)||data.expires<Date.now())throw Error();return data.paper}catch{throw new ApiError(400,'这份 AI 练习已过期，或来自另一台设备 / 浏览器，请重新生成。')}
}
