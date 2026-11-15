import data from '@/data/textbooks.json';
import {json} from '@/lib/learning-server';
export function GET(){return json({books:data.books.map(b=>({...b,units:b.units.map(({words:_w,...u})=>u)})),note:data.note})}
