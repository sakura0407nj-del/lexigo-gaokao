import data from '@/data/textbooks.json';
import {json} from '@/lib/learning-server';
import {metadata} from '@/lib/vocabulary-catalog';
export function GET(){return json({books:metadata().books,note:data.note})}
