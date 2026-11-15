import {createHmac, randomUUID, timingSafeEqual} from 'node:crypto';

const SESSION_SECONDS = 30 * 86400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PublicApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function secret() {
  const value = process.env.PAPER_SECRET;
  if (!value || value.length < 24) throw new PublicApiError(503, '学习服务正在配置，请稍后重试。');
  return value;
}

export function signPublicValue(scope: string, value: string) {
  return createHmac('sha256', secret()).update(`${scope}\0${value}`).digest('base64url');
}

export function verifyPublicValue(scope: string, value: string, signature: string) {
  const expected = Buffer.from(signPublicValue(scope, value));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function requireSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (req.headers.get('sec-fetch-site') === 'cross-site' || origin !== new URL(req.url).origin) {
    throw new PublicApiError(403, '请从本站页面提交。');
  }
}

function cookieName(req: Request) {
  return new URL(req.url).protocol === 'https:' ? '__Host-lexigo_session' : 'lexigo_session';
}

export function publicUser(req: Request): string | null {
  const prefix = `${cookieName(req)}=`;
  const token = (req.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(prefix))?.slice(prefix.length);
  if (!token || token.length > 180) return null;
  const [id, expiry, signature, extra] = token.split('.');
  if (extra || !UUID.test(id || '') || !/^\d{10}$/.test(expiry || '') || !signature) return null;
  const expires = Number(expiry);
  const now = Math.floor(Date.now() / 1000);
  if (expires <= now || expires > now + SESSION_SECONDS + 60 || !verifyPublicValue('session', `${id}.${expiry}`, signature)) return null;
  return `guest_${id}`;
}

export function requirePublicUser(req: Request) {
  const user = publicUser(req);
  if (!user) throw new PublicApiError(401, '学习会话已过期，请刷新页面后重试。');
  return user;
}

export function issuePublicSession(req: Request) {
  const user = publicUser(req) || `guest_${randomUUID()}`;
  const value = `${user.slice(6)}.${Math.floor(Date.now() / 1000) + SESSION_SECONDS}`;
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return {
    user,
    cookie: `${cookieName(req)}=${value}.${signPublicValue('session', value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`,
  };
}

export function privateOwner(user: string) { return signPublicValue('owner', user); }
export function privateIP(ip: string) {
  if (!ip || ip.length > 128) throw new PublicApiError(503, '暂时无法确认网络会话，请稍后重试。');
  return signPublicValue('ip', ip);
}

export function publicJSON(value: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return Response.json(value, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders}});
}

export function publicFailure(error: unknown) {
  if (error instanceof PublicApiError) return publicJSON({error: error.message}, error.status);
  return publicJSON({error: '服务暂时不可用，请稍后重试；你的输入仍保留在当前页面。'}, 503);
}

export async function readBoundedBody(req: Pick<Request, 'headers' | 'body'>, limit: number) {
  const length = Number(req.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) throw new PublicApiError(413, '提交内容过大，请减少文字或压缩图片。');
  if (!req.body) throw new PublicApiError(400, '提交内容为空。');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new PublicApiError(413, '提交内容过大，请减少文字或压缩图片。'); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function readPublicJSON(req: Request, limit = 100_000): Promise<unknown> {
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) throw new PublicApiError(415, '请提交 JSON 数据。');
  try { return JSON.parse(new TextDecoder().decode(await readBoundedBody(req, limit))); }
  catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError(400, '提交内容格式不正确。');
  }
}
