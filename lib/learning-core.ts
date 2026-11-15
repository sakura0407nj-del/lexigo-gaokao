import type {Paper, Grade} from './learning-types';
export function normalizeAnswer(value: string) {
  return value.normalize('NFKC').trim().replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').toLowerCase();
}
export function gradePaper(paper: Paper, answers: Record<string,string>): Grade {
  const items=paper.questions.map(q=>{
    const yours=answers[q.id]||'';
    const accepted=(q.answer||'').split('|').map(normalizeAnswer).filter(Boolean);
    return {id:q.id,yourAnswer:yours,correctAnswer:q.answer||'',correct:accepted.includes(normalizeAnswer(yours)),explanation:q.explanation||'',knowledge:q.knowledge,evidence:q.evidence};
  });
  return {score:Math.round(items.reduce((n,item,i)=>n+(item.correct?paper.questions[i].points:0),0)*100)/100,maxScore:Math.round(paper.questions.reduce((n,q)=>n+q.points,0)*100)/100,items};
}
export function hideAnswers(paper:Paper):Paper {
  return {...paper,questions:paper.questions.map(({answer: _a, explanation: _e, knowledge: _k,evidence: _v,...q})=>q)};
}
export function readModelJson(raw:string):unknown {
  const cleaned=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(cleaned)}catch{
    const first=cleaned.indexOf('{'),last=cleaned.lastIndexOf('}');
    if(first>=0&&last>first)return JSON.parse(cleaned.slice(first,last+1));
    throw new Error('模型返回的格式不完整，请重试。');
  }
}
export function isSafeImage(data:string):boolean {
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match||match[2].length>4*1024*1024||match[2].length%4!==0)return false;
  try{const b=atob(match[2].slice(0,32));return match[1]==='jpeg'?b.startsWith('\xff\xd8\xff'):match[1]==='png'?b.startsWith('\x89PNG\r\n\x1a\n'):b.startsWith('RIFF')&&b.slice(8,12)==='WEBP'}catch{return false}
}
