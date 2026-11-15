import {handlePublicRequest} from '../../lib/public-router';
import {publicFailure} from '../../lib/public-session';

export default async function handler(req: Request) {
  try { return await handlePublicRequest(req); }
  catch (error) { return publicFailure(error); }
}

export const config = {
  path: '/api/*',
  excludedPath: ['/api/session', '/api/uploads', '/api/ai/jobs', '/api/ai/jobs/*'],
  rateLimit: {windowLimit: 180, windowSize: 60, aggregateBy: ['ip', 'domain']},
};
