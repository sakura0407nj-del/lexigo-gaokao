import {POST as generate} from '../app/api/generate/route';
import {POST as correct} from '../app/api/correct/route';
import {POST as challenge} from '../app/api/challenge/route';
import {withLearningJob} from './learning-server';

/** Only the authenticated background worker calls this after claiming quota. */
export async function executeLearningJob(kind:'generate'|'correct'|'challenge',payload:unknown,user:string):Promise<{status:number;body:unknown}> {
  const handler={generate,correct,challenge}[kind];
  return withLearningJob(user,async()=>{
    const response=await handler(new Request(`https://lexigo.internal/api/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));
    return {status:response.status,body:await response.json()};
  });
}
