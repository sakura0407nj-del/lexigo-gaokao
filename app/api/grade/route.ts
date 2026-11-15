import {z} from 'zod';
import {papers} from '@/lib/learning-data';
import {gradePaper} from '@/lib/learning-core';
import {ApiError,bodyOf,failure,json,openPaper,userOf} from '@/lib/learning-server';
const schema=z.object({paperId:z.string().max(100),answers:z.record(z.string().max(100),z.string().max(500)),sealed:z.string().max(180000).optional()});
export async function POST(req:Request){try{
  const data=schema.parse(await bodyOf(req,240000));
  const paper=data.sealed?await openPaper(data.sealed,userOf(req)):papers.find(p=>p.id===data.paperId);
  if(!paper||paper.id!==data.paperId)throw new ApiError(404,'找不到这份练习，请重新打开。');
  if(Object.keys(data.answers).length>60)throw new ApiError(400,'答案数量不正确。');
  return json(gradePaper(paper,data.answers));
}catch(e){return failure(e)}}
