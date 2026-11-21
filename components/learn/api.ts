import {newRequestId} from './request-id';
import type {TaskReceipt} from './task-receipt';
import type { Correction, ExerciseType, Grade, Paper, Word } from "@/lib/learning-types";
import type { Weakness } from "./mistakes";

export type Band = "all" | "high" | "medium" | "low" | "unknown";
export type Level = Paper["level"];

export interface StatusResponse {
  health?: "ready" | "unknown" | "degraded";
  aiMessage?: string;
  quota?: { daily: number; shared?: number };
  loginRequired: false;
  ai: boolean;
  model: string;
  vocabulary: number;
  papers: number;
  questions: number;
  frequencyNote: string;
}

export interface CatalogResponse {
  total: number;
  combinedWords: number;
  textbookEntries: number;
  books: Textbook[];
  pos: {id:string;label:string;count:number}[];
  topics: {id:string;label:string;count:number}[];
  sources?: {id:string;label:string;count:number}[];
  note:string;
  topicNote?:string;
}
export interface WordsParams {
  band: Band; q?: string; page?: number; limit?: number;
  book?:string;unit?:string;pos?:string;topic?:string;
  source?:'all'|'textbook'|'gaokao';sort?:'alpha'|'frequency'|'textbook';ids?:string[];sample?:number;
}

export interface WordsResponse {
  items: Word[];
  total: number;
  page: number;
  pages: number;
  counts: { high: number; medium: number; low: number; unknown?:number };
  facets?: {pos:Record<string,number>;topics:Record<string,number>};
  note: string;
}

export interface TextbookUnit {
  id: string;
  title: string;
  count: number;
}

export interface Textbook {
  id: string;
  title: string;
  edition: string;
  wordCount: number;
  units: TextbookUnit[];
}

export interface TextbooksResponse {
  books: Textbook[];
  note: string;
}

export type DictationOrder = "textbook" | "random";

export interface DictationRequest {
  book: string;
  units: string[] | "all";
  count: number | "all";
  order: DictationOrder;
  includePhrases: boolean;
}

export interface DictationResponse {
  items: Word[];
  total: number;
  scope: string;
  note: string;
}

export interface KnowledgeCard {
  id: string;
  title: string;
  category: string;
  body: string;
  examples: string[];
  pitfall: string;
  practice: string;
}

export interface KnowledgeResponse {
  items: KnowledgeCard[];
}

export type BankPaper = Omit<Paper, "passage" | "questions"> & { questionCount: number };

export interface SourceLink {
  title: string;
  url: string;
  description: string;
  kind: string;
}

export interface BankResponse {
  papers: BankPaper[];
  sources: SourceLink[];
  note: string;
}

export interface GradeRequest {
  paperId: string;
  answers: Record<string, string>;
  sealed?: string;
}

export interface GenerateRequest {
  stage?: 'high' | 'primary';
  grade?: 3 | 4 | 5 | 6;
  type: ExerciseType;
  level: Level;
  topic: string;
  weaknesses?: Weakness[];
}

export interface ChallengeRequest {
  prompt: string;
  context?: string;
  correctAnswer: string;
  studentAnswer: string;
  explanation?: string;
}

export interface ChallengeResponse {
  correct: boolean;
  explanation: string;
  method: "exact" | "ai";
}

export interface CorrectRequest {
  stage?: 'high' | 'primary';
  grade?: 3 | 4 | 5 | 6;
  kind: "essay" | "questions";
  text: string;
  prompt?: string;
  maxScore: 15 | 25;
  images?: string[];
}

export class ApiError extends Error {
  status: number;
  jobTerminal: boolean;
  constructor(message: string, status: number, jobTerminal = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.jobTerminal = jobTerminal;
  }
}
export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
}

function friendlyStatus(status: number): string {
  if (status === 400 || status === 422) return "提交的内容不符合要求，请检查后再试。";
  if (status === 404) return "没有找到对应的内容，可能已被移除。";
  if (status === 413) return "内容太大了，请缩短文字或减少图片。";
  if (status === 429) return "请求太频繁了，请稍等片刻再试。";
  if (status === 503) return "AI 服务暂时不可用或尚未配置，请稍后再试。";
  if (status === 504) return "服务响应超时，请稍后重试。";
  if (status >= 500) return "服务器暂时出了点问题，请稍后再试。";
  return "请求没有成功，请稍后再试。";
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {Accept:"application/json",...(init?.body ? { "Content-Type": "application/json" } : {}),...init?.headers},
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiError("网络连接失败，请检查网络后重试。", 0);
  }
  const raw = await response.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    let message = friendlyStatus(response.status);
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const detail = record.error ?? record.message;
      if (typeof detail === "string" && detail.trim()) message = detail;
    }
    throw new ApiError(message, response.status);
  }
  if (data === null) throw new ApiError("服务返回的数据无法识别，请稍后再试。", response.status);
  return data as T;
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal });
}

export function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body), signal });
}

export function errorText(error: unknown): string {
  if (isAbort(error)) return "已取消。";
  if (error instanceof ApiError) return error.message;
  return "出了点问题，请稍后再试。";
}

export { isAbort };

let sessionPromise: Promise<unknown> | undefined;
export function ensureSession() {
  return sessionPromise ??= postJson('/api/session', {}).catch(error => { sessionPromise=undefined; throw error; });
}
function delay(ms:number,signal?:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
    const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    signal?.addEventListener('abort',abort,{once:true});
  });
}
export interface ResumeJobOptions {
  resumeJobId?: string;
  resumeRequestId?: string;
  /** Persist before the request leaves the browser, including a retry after reload. */
  onSubmitting?: (requestId: string) => void;
  onSubmitted?: (jobId: string) => void;
}
async function learningJob<T>(kind:'generate'|'correct'|'challenge',input:unknown,signal?:AbortSignal,resume?:ResumeJobOptions):Promise<T> {
  await ensureSession(); throwIfAborted(signal);
  if(resume?.resumeJobId) {
    if(!/^\d{4}-\d{2}-\d{2}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resume.resumeJobId))throw new ApiError('保存的任务编号无效，请重新生成这一部分。',400,true);
    return pollLearningJob<T>(resume.resumeJobId,signal);
  }
  const payload={...(input as Record<string,unknown>)};
  const uploadIds:string[]=[];
  if(Array.isArray(payload.images)) {
    for(const url of payload.images as string[]) {
      throwIfAborted(signal);
      const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
      if(!match)throw new ApiError('图片格式无效，请选择 JPG、PNG 或 WebP。',400);
      const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
      const result=await request<{uploadId:string}>('/api/uploads',{method:'POST',body:bytes,headers:{'Content-Type':match[1]},signal});
      uploadIds.push(result.uploadId);
    }
    delete payload.images;
  }
  const requestId=resume?.resumeRequestId||newRequestId();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))throw new ApiError('保存的提交编号无效，请重新生成这一部分。',400,true);
  const submission={kind,payload,uploadIds,requestId};
  resume?.onSubmitting?.(requestId);
  let job:{jobId:string;pollUrl:string};
  try {job=await postJson('/api/ai/jobs',submission,signal);}
  catch(error){
    // A disconnected submission may have been accepted: reuse its id exactly once.
    if(!(error instanceof ApiError)||error.status!==0){
      if(error instanceof ApiError&&[400,404,409,413,422,429].includes(error.status))error.jobTerminal=true;
      throw error;
    }
    await delay(1200,signal);
    try {job=await postJson('/api/ai/jobs',submission,signal);}
    catch(retryError){
      if(retryError instanceof ApiError&&[400,404,409,413,422,429].includes(retryError.status))retryError.jobTerminal=true;
      throw retryError;
    }
  }
  resume?.onSubmitted?.(job.jobId);
  return pollLearningJob<T>(job.jobId,signal);
}
export async function retrieveLearningJob<T>(receipt:TaskReceipt,signal?:AbortSignal,onSubmitted?:(jobId:string)=>void):Promise<T> {
  await ensureSession();throwIfAborted(signal);
  const scope=new URLSearchParams({kind:receipt.kind,stage:receipt.stage,...(receipt.grade?{grade:String(receipt.grade)}:{})});
  let jobId=receipt.jobId;
  if(!jobId){
    const found=await getJson<{jobId:string}>(`/api/ai/jobs/lookup?${scope}&requestId=${encodeURIComponent(receipt.requestId)}`,signal);
    jobId=found.jobId;onSubmitted?.(jobId);
  }
  try{return await pollLearningJob<T>(jobId,signal,scope);}
  catch(error){
    // Older server errors assume the original form is still mounted. Recovery
    // deliberately saves no form contents and must not promise otherwise.
    if(error instanceof ApiError)error.message=error.message.replace(/[；。]\s*(?:(?:你的|原始)?输入)(?:仍会|仍|已)?保留(?:在(?:当前)?页面)?[。]?/g,'。');
    throw error;
  }
}
async function pollLearningJob<T>(jobId:string,signal?:AbortSignal,scope?:URLSearchParams):Promise<T> {
  const deadline=Date.now()+200000;
  while(Date.now()<deadline) {
    await delay(1800,signal);
    let view:{status:string;result?:{status:number;body:unknown};error?:string};
    try {view=await getJson(`/api/ai/jobs/${encodeURIComponent(jobId)}${scope?`?${scope}`:''}`,signal);}
    catch(error){
      // Poll throttling does not cancel an accepted background task. Back off
      // without creating another paid task or clearing the student's input.
      if(error instanceof ApiError&&(error.status===0||error.status===429||error.status>=500)){await delay(error.status===429?5000:1800,signal);continue;}
      if(error instanceof ApiError&&(error.status===400||error.status===404||error.status===410))error.jobTerminal=true;
      throw error;
    }
    if(view.result) {
      if(view.result.status>=200&&view.result.status<300)return view.result.body as T;
      const body=view.result.body as {error?:string};
      throw new ApiError(body?.error||friendlyStatus(view.result.status),view.result.status,true);
    }
    if(view.status==='failed')throw new ApiError(view.error||'AI 处理没有完成，请重试；输入已保留。',502,true);
  }
  throw new ApiError('AI 处理时间较长，请稍后重试；输入已保留。',504);
}

export const api = {
  status: (signal?: AbortSignal) => getJson<StatusResponse>("/api/status", signal),
  catalog: (signal?:AbortSignal) => getJson<CatalogResponse>('/api/vocabulary/catalog',signal),
  words: (params: WordsParams, signal?: AbortSignal) => {
    const search = new URLSearchParams();
    for(const [key,value] of Object.entries(params))if(value!==undefined)search.set(key,Array.isArray(value)?value.join(','):String(value));
    if(search.toString().length>4000)return postJson<WordsResponse>('/api/words/search',params,signal);
    return getJson<WordsResponse>(`/api/words?${search.toString()}`, signal);
  },
  sample: (band: Band, sample: number, signal?: AbortSignal) =>
    getJson<WordsResponse>(`/api/words?${new URLSearchParams({ band, sample: String(sample) }).toString()}`, signal),
  textbooks: (signal?: AbortSignal) => getJson<TextbooksResponse>("/api/textbooks", signal),
  dictation: (params: DictationRequest, signal?: AbortSignal) => {
    const search = new URLSearchParams({
      book: params.book,
      units: params.units === "all" ? "all" : params.units.join(","),
      count: String(params.count),
      order: params.order,
      includePhrases: params.includePhrases ? "1" : "0",
    });
    return getJson<DictationResponse>(`/api/dictation?${search.toString()}`, signal);
  },
  knowledge: (signal?: AbortSignal) => getJson<KnowledgeResponse>("/api/knowledge", signal),
  bank: (signal?: AbortSignal) => getJson<BankResponse>("/api/bank", signal),
  paper: (id: string, signal?: AbortSignal) => getJson<Paper>(`/api/paper?${new URLSearchParams({ id }).toString()}`, signal),
  grade: async (body: GradeRequest, signal?: AbortSignal) => {await ensureSession();return postJson<Grade>("/api/grade", body, signal);},
  generate: (body: GenerateRequest, signal?: AbortSignal, resume?:ResumeJobOptions) => learningJob<Paper>('generate',body,signal,resume),
  correct: (body: CorrectRequest, signal?: AbortSignal, resume?:ResumeJobOptions) => learningJob<Correction>('correct',body,signal,resume),
  challenge: async (body: ChallengeRequest, signal?: AbortSignal):Promise<ChallengeResponse> => {
    await ensureSession();
    const fast=await postJson<ChallengeResponse|{needsAI:true}>('/api/challenge-fast',body,signal);
    return 'needsAI' in fast?learningJob<ChallengeResponse>('challenge',body,signal):fast;
  },
};

export const TYPE_LABEL: Record<ExerciseType, string> = {
  reading: "阅读理解",
  grammar: "语法填空",
  seven: "七选五",
  cloze: "完形填空",
};

export const BAND_LABEL: Record<Band, string> = {
  all: "全部",
  high: "高频",
  medium: "中频",
  low: "低频",
  unknown: "未标频",
};

export type Origin = Paper["origin"];

export const ORIGIN_LABEL: Record<Origin, string> = {
  past: "历年真题",
  original: "原创模拟",
  ai: "AI 原创 · 非真题",
};
