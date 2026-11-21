import type {Paper, Word} from './learning-types';
export type PrimaryGrade=3|4|5|6;
export interface PrimaryWord extends Word {grade:PrimaryGrade;topic:string;example:string;exampleZh:string}
export interface PrimaryPaper extends Paper {grade:PrimaryGrade}
export interface PrimarySource {title:string;url:string;kind?:string}
export interface PrimaryUnit {id:string;title:string;wordIds:string[];sources?:PrimarySource[];note?:string}
export interface PrimaryBook {
  id:string;grade:PrimaryGrade;title:string;edition:string;status:string;
  sources:PrimarySource[];units:PrimaryUnit[];note?:string;
}
export interface PrimaryWordsResponse {items:PrimaryWord[];grade:PrimaryGrade;total:number;topics:string[];note:string;books:PrimaryBook[]}
export interface PrimaryBankResponse {items:PrimaryPaper[];grade:PrimaryGrade;total:number;note:string}
