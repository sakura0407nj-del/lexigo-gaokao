import {storeUpload} from '../../lib/job-store';
import {privateIP, publicFailure, publicJSON, readBoundedBody, requirePublicUser, requireSameOrigin} from '../../lib/public-session';

export default async function handler(req: Request, context: {ip: string}) {
  try {
    if (req.method !== 'POST') return publicJSON({error: '请使用 POST 上传图片。'}, 405, {Allow: 'POST'});
    requireSameOrigin(req);
    const user = requirePublicUser(req);
    const declared = (req.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const bytes = await readBoundedBody(req, 3 * 1024 * 1024);
    const uploadId = await storeUpload(user, privateIP(context.ip), bytes, declared);
    return publicJSON({uploadId, expiresIn: 86400}, 201);
  } catch (error) { return publicFailure(error); }
}

export const config = {path: '/api/uploads', rateLimit: {windowLimit: 12, windowSize: 60, aggregateBy: ['ip', 'domain']}};
