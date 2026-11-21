import {z} from 'zod';
import {primaryGradeCatalog,primaryDirectoryCsv,primaryWordlistCsv} from './primary-catalog';
import paperData from '../data/primary-papers.json';
import {gradePaper,hideAnswers} from './learning-core';
import {ApiError,bodyOf,json,openPaper,userOf} from './learning-server';
import type {PrimaryGrade,PrimaryPaper} from './primary-types';

export const primaryPapers=paperData as unknown as PrimaryPaper[];
const gradeSchema=z.coerce.number().int().refine(value=>[3,4,5,6].includes(value),'请选择三至六年级');
function gradeFrom(req:Request){return gradeSchema.parse(new URL(req.url).searchParams.get('grade')||3) as PrimaryGrade;}
export function primaryWordsRequest(req:Request){
 return json(primaryGradeCatalog(gradeFrom(req)));
}
export function primaryExportRequest(req:Request){
 const url=new URL(req.url),glossary=url.pathname==='/api/primary/wordlist.csv';
 const grade=url.searchParams.has('grade')?gradeFrom(req):undefined;
 const content=glossary?primaryWordlistCsv(grade):primaryDirectoryCsv(grade);
 const filename=glossary?'LexiGo-primary-vocabulary.csv':'LexiGo-PEP-primary-directory.csv';
 return new Response(content,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'public, max-age=300'}});
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
