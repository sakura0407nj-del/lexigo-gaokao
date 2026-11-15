import {z} from 'zod';
import {aliasIndex,frequencyMetadata,metadata,searchWords} from './vocabulary-catalog';
import {canonicalizeWord} from './progress-migration';
import type {Word} from './learning-types';
import {papers,words,frequencyNote} from './learning-data';
import {normalizeAnswer} from './learning-core';
import {runtime,json,bodyOf,failure} from './learning-server';
import {requirePublicUser,requireSameOrigin} from './public-session';
import {GET as bank} from '../app/api/bank/route';
import {GET as paper} from '../app/api/paper/route';
import {GET as textbooks} from '../app/api/textbooks/route';
import {GET as dictation} from '../app/api/dictation/route';
import {GET as knowledge} from '../app/api/knowledge/route';
import {POST as grade} from '../app/api/grade/route';
const challengeSchema=z.object({prompt:z.string().min(1).max(3000),context:z.string().max(6000).optional(),correctAnswer:z.string().min(1).max(2500),studentAnswer:z.string().trim().min(1).max(2500),explanation:z.string().max(2500).optional()});
const wordQuerySchema=z.object({
  band:z.enum(['all','high','medium','low','unknown']).optional(),q:z.string().max(100).optional(),
  page:z.number().int().min(1).max(100000).optional(),limit:z.number().int().min(1).max(10000).optional(),
  book:z.string().max(100).optional(),unit:z.string().max(100).optional(),
  pos:z.enum(['all','noun','verb','adjective','adverb','preposition','conjunction','pronoun','determiner','number','phrase','other']).optional(),
  topic:z.string().max(100).optional(),source:z.enum(['gaokao','textbook','all']).optional(),sort:z.enum(['alpha','frequency','textbook']).optional(),
  ids:z.array(z.string().max(200)).max(5500).optional(),sample:z.number().int().min(1).max(50).optional(),
});

export async function handlePublicRequest(req:Request):Promise<Response> {
  try {
    const url=new URL(req.url),path=url.pathname;
    if(req.method==='GET') {
      if(path==='/api/status') {
        const ai=Boolean(runtime().AI_API_KEY&&runtime().PAPER_SECRET);
        return json({ai,health:ai?'unknown':'degraded',model:'Gemini / Claude 备用',loginRequired:false,aiMessage:ai?'AI 已配置，提交后会显示实际处理状态。':'AI 服务正在配置，词库、听写和内置练习仍可使用。',quota:{daily:30,shared:200},vocabulary:words.length,papers:papers.length,questions:papers.reduce((n,p)=>n+p.questions.length,0),frequencyNote});
      }
      if(path==='/api/vocabulary/catalog')return json(metadata());
      if(path==='/api/vocabulary/aliases')return json({version:1,aliases:aliasIndex()});
      if(path==='/api/words')return json(searchWords({...Object.fromEntries(url.searchParams),ids:url.searchParams.has('ids')?url.searchParams.get('ids')!.split(',').slice(0,5500):undefined}));
      if(path==='/api/bank')return bank();
      if(path==='/api/paper')return paper(req);
      if(path==='/api/textbooks')return textbooks();
      if(path==='/api/dictation'){
        const response=dictation(req);
        if(!response.ok)return response;
        const data=await response.json() as {items:Word[]};
        return json({...data,items:data.items.map(word=>({...canonicalizeWord(word,aliasIndex()),...frequencyMetadata(word)}))});
      }
      if(path==='/api/knowledge')return knowledge();
    }
    if(req.method==='POST') {
      requireSameOrigin(req);
      if(path==='/api/words/search')return json(searchWords(wordQuerySchema.parse(await bodyOf(req,100*1024))));
      requirePublicUser(req);
      if(path==='/api/grade')return grade(req);
      if(path==='/api/challenge-fast') {
        const input=challengeSchema.parse(await bodyOf(req,64000));
        if(input.correctAnswer.split('|').map(normalizeAnswer).includes(normalizeAnswer(input.studentAnswer)))return json({correct:true,explanation:'本次答案正确，可以移入已掌握记录。',method:'exact'});
        if(/^[A-G]$/.test(input.correctAnswer.trim()))return json({correct:false,explanation:input.explanation||`本题正确选项为 ${input.correctAnswer}，请结合原文再复习。`,method:'exact'});
        return json({needsAI:true});
      }
    }
    return json({error:'没有找到对应接口。'},404);
  }catch(error){return failure(error);}
}
