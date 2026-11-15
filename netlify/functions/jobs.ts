import {createLearningJob, learningJobView, parseJobSubmission, signJobDispatch} from '../../lib/job-store';
import {privateIP, PublicApiError, publicFailure, publicJSON, readPublicJSON, requirePublicUser, requireSameOrigin} from '../../lib/public-session';

export default async function handler(req: Request, context: {ip: string}) {
  try {
    const user = requirePublicUser(req);
    const pathname = new URL(req.url).pathname;
    const match = pathname.match(/^\/api\/ai\/jobs\/([^/]+)$/);
    if (req.method === 'GET' && match) return publicJSON(await learningJobView(match[1], user));
    if (req.method !== 'POST' || pathname !== '/api/ai/jobs') return publicJSON({error: '请求路径或方法无效。'}, 405);
    requireSameOrigin(req);
    if (!process.env.AI_API_KEY) throw new PublicApiError(503, 'AI 服务暂未配置，请稍后再试；词库和本地练习仍可使用。');
    const input = parseJobSubmission(await readPublicJSON(req));
    const {job, created} = await createLearningJob(input, user, privateIP(context.ip));
    if (created) {
      try {
        // Use a relative same-origin endpoint; the HMAC never goes to the browser.
        const response = await fetch(new URL('/.netlify/functions/ai-background', req.url), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(signJobDispatch(job.id)), signal: AbortSignal.timeout(15000), redirect: 'error'});
        if (response.status !== 202) throw new Error('Background invocation rejected');
      } catch {
        // A network timeout is ambiguous: the background call may already be running.
        // Preserve its claim/result and let the normal 3-minute poll deadline decide.
      }
    }
    return publicJSON({...await learningJobView(job.id, user), pollUrl: `/api/ai/jobs/${job.id}`}, 202);
  } catch (error) { return publicFailure(error); }
}

export const config = {path: ['/api/ai/jobs', '/api/ai/jobs/*'], rateLimit: {windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain']}};
