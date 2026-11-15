import type {Paper, Word} from './learning-types';
export type PrimaryGrade=3|4|5|6;
export interface PrimaryWord extends Word {grade:PrimaryGrade;topic:string;example:string;exampleZh:string}
export interface PrimaryPaper extends Paper {grade:PrimaryGrade}
export interface PrimaryWordsResponse {items:PrimaryWord[];grade:PrimaryGrade;total:number;topics:string[];note:string}
export interface PrimaryBankResponse {items:PrimaryPaper[];grade:PrimaryGrade;total:number;note:string}
