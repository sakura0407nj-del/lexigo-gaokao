import {z} from 'zod';
export const primaryGradeSchema=z.union([z.literal(3),z.literal(4),z.literal(5),z.literal(6)]);
export const educationFields={stage:z.enum(['high','primary']).optional(),grade:primaryGradeSchema.optional()};
export function validEducationContext(input:{stage?:string;grade?:number}){return input.stage==='primary'?input.grade!==undefined:input.grade===undefined;}
