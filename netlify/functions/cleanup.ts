import {cleanExpiredLearningData} from '../../lib/job-store';

export default async function handler() { await cleanExpiredLearningData(); }
export const config = {schedule: '17 * * * *'};
