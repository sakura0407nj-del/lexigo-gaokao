export type TaskKind='generate'|'essay'|'questions';
export interface TaskReceipt {version:1;kind:TaskKind;stage:'high'|'primary';grade?:3|4|5|6;requestId:string;jobId?:string;createdAt:number}
const TTL=86400000,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB=/^\d{4}-\d{2}-\d{2}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memory=new Map<string,TaskReceipt>();
export function taskReceiptKey(kind:TaskKind,grade?:3|4|5|6){return `lexigo.task-receipt.v1.${grade?`primary.g${grade}`:'high'}.${kind}`;}
export function parseTaskReceipt(raw:string|null,kind:TaskKind,grade?:3|4|5|6,now=Date.now()):TaskReceipt|null {
  if(!raw||raw.length>700)return null;
  let r:TaskReceipt;try{r=JSON.parse(raw);}catch{return null;}
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(key=>!['version','kind','stage','grade','requestId','jobId','createdAt'].includes(key))||r.version!==1||r.kind!==kind||r.stage!==(grade?'primary':'high')||r.grade!==grade||typeof r.requestId!=='string'||!UUID.test(r.requestId)||(r.jobId!==undefined&&(typeof r.jobId!=='string'||!JOB.test(r.jobId)))||!Number.isFinite(r.createdAt)||r.createdAt>now+300000||r.createdAt<=now-TTL)return null;
  return {version:1,kind,stage:grade?'primary':'high',...(grade?{grade}:{}),requestId:r.requestId,...(r.jobId?{jobId:r.jobId}:{}),createdAt:r.createdAt};
}
export function readTaskReceipt(kind:TaskKind,grade?:3|4|5|6):{receipt:TaskReceipt|null;storageAvailable:boolean} {
  const key=taskReceiptKey(kind,grade);
  try{
    const raw=window.sessionStorage.getItem(key),stored=parseTaskReceipt(raw,kind,grade);
    if(raw&&!stored)window.sessionStorage.removeItem(key);
    const receipt=stored||parseTaskReceipt(JSON.stringify(memory.get(key)||null),kind,grade);
    return {receipt,storageAvailable:true};
  }catch{return {receipt:parseTaskReceipt(JSON.stringify(memory.get(key)||null),kind,grade),storageAvailable:false};}
}
export function writeTaskReceipt(receipt:TaskReceipt):boolean {
  // Reconstruct the allowlist so caller objects can never leak an essay/image into storage.
  const safe:TaskReceipt={version:1,kind:receipt.kind,stage:receipt.stage,...(receipt.grade?{grade:receipt.grade}:{}),requestId:receipt.requestId,...(receipt.jobId?{jobId:receipt.jobId}:{}),createdAt:receipt.createdAt};
  if(!parseTaskReceipt(JSON.stringify(safe),safe.kind,safe.grade))return false;
  const key=taskReceiptKey(safe.kind,safe.grade);memory.set(key,safe);
  try{window.sessionStorage.setItem(key,JSON.stringify(safe));return true;}catch{return false;}
}
export function clearTaskReceipt(receipt:TaskReceipt):boolean {
  const key=taskReceiptKey(receipt.kind,receipt.grade);
  if(memory.get(key)?.requestId===receipt.requestId)memory.delete(key);
  try{
    const current=parseTaskReceipt(window.sessionStorage.getItem(key),receipt.kind,receipt.grade);
    if(current?.requestId===receipt.requestId)window.sessionStorage.removeItem(key);
    return true;
  }catch{return false;}
}
