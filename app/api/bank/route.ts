import {papers,sources} from '@/lib/learning-data';
import {json} from '@/lib/learning-server';
export function GET(){return json({papers:papers.map(({passage:_p,questions,...p})=>({...p,questionCount:questions.length})),sources,note:'历年真题来自 GAOKAO-Bench 公开数据，已剔除不完整及答案/解析冲突的记录，保留原题号和分值；原创模拟与 AI 即时命题另行标注。真题转录及 AI 解析均可能有误，请以原卷和教师意见为准。'})}
