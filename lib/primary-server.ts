import {z} from 'zod';
import wordData from '../data/primary-words.json';
import paperData from '../data/primary-papers.json';
import {gradePaper,hideAnswers} from './learning-core';
import {ApiError,bodyOf,json,openPaper,userOf} from './learning-server';
import type {PrimaryGrade,PrimaryWord,PrimaryPaper} from './primary-types';

export const primaryWords:PrimaryWord[]=(wordData as unknown as PrimaryWord[]).map(word=>({...word,phonetic:word.phonetic||'',frequency:'high',frequencyKnown:false,frequencyBand:'unknown',rank:0,inGaokao:false}));
export const primaryPapers=paperData as unknown as PrimaryPaper[];
const gradeSchema=z.coerce.number().int().refine(value=>[3,4,5,6].includes(value),'请选择三至六年级');
function gradeFrom(req:Request){return gradeSchema.parse(new URL(req.url).searchParams.get('grade')||3) as PrimaryGrade;}
export function primaryWordsRequest(req:Request){
 const grade=gradeFrom(req),items=primaryWords.filter(word=>word.grade===grade);
 return json({grade,items,total:items.length,topics:[...new Set(items.map(word=>word.topic))],note:'通用小学英语主题词汇，按练习难度编排；不是教材词表或完整课标清单。'});
}
export function primaryBankRequest(req:Request){
 const grade=gradeFrom(req),items=primaryPapers.filter(paper=>paper.grade===grade).map(paper=>({...hideAnswers(paper),grade}));
 return json({grade,items,total:items.length,note:'原创小学练习，供自主学习使用；不冒充真题或出版社内容。'});
}
const gradeInput=z.object({paperId:z.string().min(1).max(160),answers:z.record(z.string().max(100),z.string().max(500)),sealed:z.string().max(180000).optional()}).strict();
export async function primaryGradeRequest(req:Request){
 const input=gradeInput.parse(await bodyOf(req,240000));
 const paper=input.sealed?await openPaper(input.sealed,userOf(req)):primaryPapers.find(p=>p.id===input.paperId);
 if(!paper||paper.id!==input.paperId||input.sealed&&!/^ai-primary-g[3-6]-/.test(paper.id))throw new ApiError(404,'找不到这份小学练习，请重新打开。');
 if(Object.keys(input.answers).some(id=>!paper.questions.some(q=>q.id===id)))throw new ApiError(400,'答案包含不属于本练习的题号。');
 return json(gradePaper(paper,input.answers));
}
