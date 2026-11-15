import {knowledge} from '@/lib/learning-data';
import {json} from '@/lib/learning-server';
export function GET(){return json({items:knowledge})}
