import {randomUUID} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import {z} from 'zod';
import {privateOwner, PublicApiError, signPublicValue, verifyPublicValue} from './public-session';

export type LearningJobKind = 'generate' | 'correct' | 'challenge';
export type LearningJobResult = {status: number; body: unknown};
export type LearningJob = {
  id: string; owner: string; user: string; kind: LearningJobKind; payload: Record<string, unknown>;
  uploadIds: string[]; createdAt: number; expiresAt: number;
};
type Upload = {mime: string; data: string; owner: string; createdAt: number; expiresAt: number};
type Outcome = {status: 'succeeded' | 'failed'; result?: LearningJobResult; error?: string; finishedAt: number};
const DAY_MS = 86400000;
export const JOB_TIMEOUT = 180000;
const ID = /^\d{4}-\d{2}-\d{2}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = z.string().uuid();
const weakness = z.object({knowledge: z.string().max(400), prompt: z.string().max(1200), yourAnswer: z.string().max(500).optional(), correctAnswer: z.string().max(1000).optional()});
const schemas = {
  generate: z.object({type: z.enum(['reading', 'grammar', 'seven', 'cloze']), level: z.enum(['基础', '标准', '挑战']), topic: z.string().trim().min(1).max(150), weaknesses: z.array(weakness).max(8).optional()}).strict(),
  correct: z.object({kind: z.enum(['essay', 'questions']), text: z.string().max(16000).default(''), prompt: z.string().max(6000).optional(), maxScore: z.union([z.literal(15), z.literal(25)]).default(15)}).strict(),
  challenge: z.object({prompt: z.string().min(1).max(3000), context: z.string().max(6000).optional(), correctAnswer: z.string().min(1).max(2500), studentAnswer: z.string().trim().min(1).max(2500), explanation: z.string().max(2500).optional()}).strict(),
};

export function jobStore() { return getStore({name: 'lexigo-learning-v1', consistency: 'strong'}); }
export function quotaDay(now = Date.now()) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
export function validJobId(id: string) { return ID.test(id); }
function key(kind: string, id: string) {
  if (!validJobId(id)) throw new PublicApiError(400, '任务编号无效。');
  return `${kind}/${id.slice(0, 10)}/${id.slice(11)}`;
}
function uploadKey(owner: string, id: string) { return `${key('uploads', id)}/${owner}`; }

export function parseJobSubmission(body: unknown) {
  const envelope = z.object({kind: z.enum(['generate', 'correct', 'challenge']), payload: z.record(z.unknown()), uploadIds: z.array(z.string().regex(ID)).max(3).default([]), requestId: uuid.optional()}).strict().safeParse(body);
  if (!envelope.success) throw new PublicApiError(400, '任务参数不完整，请检查后重试。');
  const input = envelope.data;
  if ('images' in input.payload) throw new PublicApiError(400, '请先上传图片，再提交批改任务。');
  const parsed = schemas[input.kind].safeParse(input.payload);
  if (!parsed.success) throw new PublicApiError(400, '内容超出范围或缺少必要信息，请检查后重试。');
  if (input.kind !== 'correct' && input.uploadIds.length) throw new PublicApiError(400, '只有批改任务可以附加图片。');
  if (new Set(input.uploadIds).size !== input.uploadIds.length) throw new PublicApiError(400, '同一张图片不能重复提交。');
  if (input.kind === 'correct' && !input.uploadIds.length && String((parsed.data as {text?: string}).text || '').trim().length < 5) throw new PublicApiError(400, '请填写需要批改的内容，或上传题目图片。');
  return {...input, payload: parsed.data as Record<string, unknown>};
}

// Each successful conditional create consumes an immutable slot. Listing is only
// an optimization; onlyIfNew enforces the actual cap under concurrent requests.
export async function claimQuotaSlot(scope: string, day: string, limit: number, jobId: string) {
  const store = jobStore();
  const prefix = `quotas/${day}/${scope}/`;
  const {blobs} = await store.list({prefix});
  const occupied = new Set(blobs.map(blob => blob.key));
  const offset = Number.parseInt(signPublicValue('slot', jobId).slice(0, 6).replace(/[^0-9a-f]/gi, '0'), 16) % limit;
  for (let i = 0; i < limit; i++) {
    const slot = `${prefix}${(offset + i) % limit}`;
    if (occupied.has(slot)) continue;
    const {modified} = await store.setJSON(slot, {jobId, createdAt: Date.now()}, {onlyIfNew: true});
    if (modified) return;
  }
  throw new PublicApiError(429, scope.startsWith('global') ? '本站今天的 AI 共享额度已用完，请明天再试。' : '今天的 AI 使用额度已用完，请明天继续学习。');
}

export async function reserveJobQuota(user: string, ipHash: string, id: string) {
  const day = quotaDay();
  await claimQuotaSlot(`visitor-${privateOwner(user)}`, day, 30, id);
  await claimQuotaSlot(`ip-${ipHash}`, day, 30, id);
  await claimQuotaSlot('global', day, 200, id);
}

export function detectImage(bytes: Uint8Array, declared: string) {
  const isPNG = bytes.length >= 24 && Buffer.from(bytes.slice(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10])) && Buffer.from(bytes.slice(12,16)).toString() === 'IHDR';
  const isJPEG = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
  const isWebP = bytes.length >= 30 && Buffer.from(bytes.slice(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.slice(8, 12)).toString() === 'WEBP';
  const mime = isPNG ? 'image/png' : isJPEG ? 'image/jpeg' : isWebP ? 'image/webp' : '';
  if (!mime || mime !== declared) throw new PublicApiError(415, '图片格式无法识别，请使用 JPG、PNG 或 WebP 图片。');
  const data = Buffer.from(bytes);
  let width = 0, height = 0;
  if (isPNG) { width = data.readUInt32BE(16); height = data.readUInt32BE(20); }
  if (isJPEG) {
    let offset = 2;
    while (offset + 4 <= data.length && data[offset] === 255) {
      while (offset < data.length && data[offset] === 255) offset++;
      const marker = data[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > data.length) break;
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length > data.length) break;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) {
        height = data.readUInt16BE(offset + 3); width = data.readUInt16BE(offset + 5); break;
      }
      offset += length;
    }
  }
  if (isWebP) {
    const chunk = data.subarray(12, 16).toString();
    if (chunk === 'VP8X') { width = data.readUIntLE(24, 3) + 1; height = data.readUIntLE(27, 3) + 1; }
    else if (chunk === 'VP8L' && data[20] === 0x2f) {
      const bits = data.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (chunk === 'VP8 ' && data[23] === 0x9d && data[24] === 1 && data[25] === 0x2a) {
      width = data.readUInt16LE(26) & 0x3fff; height = data.readUInt16LE(28) & 0x3fff;
    }
  }
  if (!width || !height || width > 8192 || height > 8192 || width * height > 32000000) throw new PublicApiError(415, '图片尺寸无法识别或过大，请缩小图片后重试。');
  return mime;
}

export async function storeUpload(user: string, ipHash: string, bytes: Uint8Array, declared: string) {
  if (!bytes.length || bytes.byteLength > 3 * 1024 * 1024) throw new PublicApiError(413, '每张图片最大 3 MB，请压缩后再上传。');
  const mime = detectImage(bytes, declared);
  const owner = privateOwner(user), day = quotaDay(), id = `${day}_${randomUUID()}`;
  await claimQuotaSlot(`upload-visitor-${owner}`, day, 90, id);
  await claimQuotaSlot(`upload-ip-${ipHash}`, day, 90, id);
  await claimQuotaSlot('global-uploads', day, 600, id);
  const expiresAt = Date.now() + DAY_MS;
  await jobStore().setJSON(uploadKey(owner, id), {mime, data: Buffer.from(bytes).toString('base64'), owner, createdAt: Date.now(), expiresAt} satisfies Upload, {onlyIfNew: true, metadata: {expiresAt}});
  return id;
}

async function getUpload(owner: string, id: string) {
  const upload = await jobStore().get(uploadKey(owner, id), {type: 'json'}) as Upload | null;
  if (!upload || upload.owner !== owner || upload.expiresAt <= Date.now()) throw new PublicApiError(400, '图片已过期或不属于当前会话，请重新上传。');
  return upload;
}

export async function loadLearningJob(id: string) { return await jobStore().get(key('jobs', id), {type: 'json'}) as LearningJob | null; }
function requestJobId(owner: string, day: string, requestId: string) {
  const digest = signPublicValue('job-id', `${owner}:${day}:${requestId}`);
  const hex = Buffer.from(digest, 'base64url').toString('hex');
  return `${day}_${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
function reusableJob(job: LearningJob, now = Date.now()) {
  return Number.isFinite(job.createdAt) && Number.isFinite(job.expiresAt) && job.createdAt > now - DAY_MS && job.expiresAt > now;
}
function sameSubmission(job: LearningJob, input: ReturnType<typeof parseJobSubmission>, owner: string) {
  if (job.owner !== owner || !reusableJob(job)) throw new PublicApiError(404, '任务不存在或已过期，请重新提交。');
  if (JSON.stringify([job.kind, job.payload, job.uploadIds]) !== JSON.stringify([input.kind, input.payload, input.uploadIds])) throw new PublicApiError(409, '这次提交编号已用于其他内容，请重新提交。');
  return {job, created: false};
}
export async function createLearningJob(input: ReturnType<typeof parseJobSubmission>, user: string, ipHash: string) {
  const now = Date.now(), owner = privateOwner(user), day = quotaDay(now);
  const requestId = input.requestId || randomUUID();
  // Caller IDs are namespaced by the signed visitor identity before becoming job IDs.
  const id = requestJobId(owner, day, requestId);
  const [previous, existing] = await Promise.all([
    input.requestId ? loadLearningJob(requestJobId(owner, quotaDay(now - DAY_MS), requestId)) : Promise.resolve(null),
    loadLearningJob(id),
  ]);
  // A resumed submission keeps its original job and quota even after Beijing midnight.
  // Ignore an expired prior-day record; never extend a job's original 24-hour lifetime.
  if (previous && reusableJob(previous)) return sameSubmission(previous, input, owner);
  if (existing) return sameSubmission(existing, input, owner);
  await Promise.all(input.uploadIds.map(uploadId => getUpload(owner, uploadId)));
  const job: LearningJob = {id, owner, user, kind: input.kind, payload: input.payload, uploadIds: input.uploadIds, createdAt: now, expiresAt: now + DAY_MS};
  const {modified} = await jobStore().setJSON(key('jobs', id), job, {onlyIfNew: true, metadata: {expiresAt: job.expiresAt}});
  if (!modified) {
    const winner = await loadLearningJob(id);
    if (!winner) throw new PublicApiError(503, '任务状态暂时不可用，请稍后重试。');
    return sameSubmission(winner, input, owner);
  }
  try { await reserveJobQuota(user, ipHash, id); }
  catch (error) {
    await finishLearningJob(id, {status: 'failed', error: error instanceof PublicApiError ? error.message : '服务暂时不可用，请稍后重试。', finishedAt: Date.now()});
    await removeJobUploads(job);
    throw error;
  }
  return {job, created: true};
}

export async function claimLearningJob(id: string) {
  return (await jobStore().setJSON(key('claims', id), {startedAt: Date.now()}, {onlyIfNew: true, metadata: {expiresAt: Date.now() + DAY_MS}})).modified;
}

export async function finishLearningJob(id: string, outcome: Outcome) {
  await jobStore().setJSON(key('outcomes', id), outcome, {onlyIfNew: true, metadata: {expiresAt: Date.now() + DAY_MS}});
}

export async function jobPayload(job: LearningJob) {
  if (!job.uploadIds.length) return job.payload;
  const uploads = await Promise.all(job.uploadIds.map(id => getUpload(job.owner, id)));
  return {...job.payload, images: uploads.map(upload => `data:${upload.mime};base64,${upload.data}`)};
}

export async function removeJobUploads(job: LearningJob) {
  await Promise.allSettled(job.uploadIds.map(id => jobStore().delete(uploadKey(job.owner, id))));
}

export async function learningJobView(id: string, user: string) {
  const job = await loadLearningJob(id);
  if (!job || job.owner !== privateOwner(user) || job.expiresAt <= Date.now()) throw new PublicApiError(404, '任务不存在或已过期，请重新提交。');
  const outcome = await jobStore().get(key('outcomes', id), {type: 'json'}) as Outcome | null;
  if (outcome) return {jobId: id, ...outcome};
  if (Date.now() - job.createdAt > JOB_TIMEOUT) return {jobId: id, status: 'failed', error: '这次 AI 处理超时，请重新提交；你的输入仍保留在当前页面。'};
  const started = await jobStore().get(key('claims', id), {type: 'json'});
  return {jobId: id, status: started ? 'running' : 'queued'};
}

export function signJobDispatch(id: string, expires = Date.now() + 5 * 60000) { return {id, expires, signature: signPublicValue('dispatch', `${id}:${expires}`)}; }
export function verifyJobDispatch(value: unknown): value is ReturnType<typeof signJobDispatch> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && validJobId(v.id) && typeof v.expires === 'number' && Number.isFinite(v.expires) && v.expires > Date.now() && v.expires <= Date.now() + 6 * 60000 && typeof v.signature === 'string' && verifyPublicValue('dispatch', `${v.id}:${v.expires}`, v.signature);
}

export async function cleanExpiredLearningData() {
  const store = jobStore(), start = Date.now();
  const today = quotaDay(), quotaCutoff = quotaDay(Date.now() - DAY_MS);
  let removed = 0;
  for await (const page of store.list({paginate: true})) {
    for (let i = 0; i < page.blobs.length; i += 20) {
      const candidates = page.blobs.slice(i, i + 20).filter(blob => /^\w+\/\d{4}-\d{2}-\d{2}\//.test(blob.key) && blob.key.split('/')[1] < today);
      const results = await Promise.allSettled(candidates.map(async blob => {
        const [category, day] = blob.key.split('/');
        if (category === 'quotas') {
          if (day < quotaCutoff) { await store.delete(blob.key); return true; }
          return false;
        }
        const entry = await store.getMetadata(blob.key);
        const expiresAt = entry?.metadata?.expiresAt;
        if (typeof expiresAt === 'number' && expiresAt <= Date.now()) { await store.delete(blob.key); return true; }
        return false;
      }));
      removed += results.filter(result => result.status === 'fulfilled' && result.value).length;
      if (Date.now() - start > 20000) return removed;
    }
  }
  return removed;
}
