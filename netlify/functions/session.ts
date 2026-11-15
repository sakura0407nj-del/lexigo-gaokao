import {issuePublicSession, publicFailure, publicJSON, requireSameOrigin} from '../../lib/public-session';

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') return publicJSON({error: '请使用 POST 建立学习会话。'}, 405, {Allow: 'POST'});
    requireSameOrigin(req);
    const session = issuePublicSession(req);
    return publicJSON({ready: true, aiAvailable: Boolean(process.env.AI_API_KEY), limits: {dailyPerVisitor: 30, dailyShared: 200, imagesPerTask: 3, imageMaxBytes: 3 * 1024 * 1024}}, 200, {'Set-Cookie': session.cookie});
  } catch (error) { return publicFailure(error); }
}

export const config = {path: '/api/session', rateLimit: {windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain']}};
