import {claimLearningJob, finishLearningJob, JOB_TIMEOUT, jobPayload, loadLearningJob, removeJobUploads, verifyJobDispatch} from '../../lib/job-store';
import {executeLearningJob} from '../../lib/job-runner';
import {readPublicJSON} from '../../lib/public-session';

export default async function handler(req: Request) {
  // Background responses are not returned to the caller. Authentication must
  // finish before reading private student work or contacting the AI provider.
  if (req.method !== 'POST') return;
  let dispatch: unknown;
  try { dispatch = await readPublicJSON(req, 2048); } catch { return; }
  if (!verifyJobDispatch(dispatch)) return;
  const job = await loadLearningJob(dispatch.id);
  if (!job || job.expiresAt <= Date.now()) return;
  if (!await claimLearningJob(job.id)) return;
  try {
    if (Date.now() - job.createdAt > JOB_TIMEOUT) {
      await finishLearningJob(job.id, {status: 'failed', error: '任务等待超时，请重新提交。', finishedAt: Date.now()});
      return;
    }
    const result = await executeLearningJob(job.kind, await jobPayload(job), job.user);
    await finishLearningJob(job.id, {status: result.status >= 200 && result.status < 300 ? 'succeeded' : 'failed', result, finishedAt: Date.now()});
  } catch {
    // Do not rethrow provider failures: platform retries could duplicate charges.
    await finishLearningJob(job.id, {status: 'failed', error: 'AI 处理暂时失败，请稍后重试；原始输入仍保留在页面。', finishedAt: Date.now()}).catch(() => undefined);
  } finally { await removeJobUploads(job); }
}

// The supported suffix also avoids a CLI config.background timeout regression.
export const config = {background: true};
