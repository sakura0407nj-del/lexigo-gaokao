import {papers} from '@/lib/learning-data';
import {hideAnswers} from '@/lib/learning-core';
import {json} from '@/lib/learning-server';
export function GET(req:Request){const paper=papers.find(p=>p.id===new URL(req.url).searchParams.get('id'));return paper?json(hideAnswers(paper)):json({error:'找不到这份练习。'},404)}
