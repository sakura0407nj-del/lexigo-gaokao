import {useRef,useState} from 'react';
import type {ResumeJobOptions} from './api';
import {clearTaskReceipt,readTaskReceipt,writeTaskReceipt,type TaskKind,type TaskReceipt} from './task-receipt';

/** A tab-local recovery receipt contains IDs only; form contents remain in component memory. */
export function useTaskReceipt(kind:TaskKind,grade?:3|4|5|6){
  const [initial]=useState(()=>readTaskReceipt(kind,grade));
  const [receipt,setReceipt]=useState<TaskReceipt|null>(initial.receipt);
  const [storageAvailable,setStorageAvailable]=useState(initial.storageAvailable);
  const ref=useRef<TaskReceipt|null>(initial.receipt);
  function save(next:TaskReceipt){ref.current=next;setReceipt(next);setStorageAvailable(writeTaskReceipt(next));}
  function submitted(original:TaskReceipt,jobId:string){if(ref.current?.requestId===original.requestId)save({...original,jobId});}
  function clear(original=ref.current){
    if(!original||ref.current?.requestId!==original.requestId)return;
    setStorageAvailable(clearTaskReceipt(original));ref.current=null;setReceipt(null);
  }
  function submissionOptions():ResumeJobOptions {
    let own:TaskReceipt|undefined;
    return {
      onSubmitting(requestId){own={version:1,kind,stage:grade?'primary':'high',...(grade?{grade}:{}),requestId,createdAt:Date.now()};save(own);},
      onSubmitted(jobId){if(own)submitted(own,jobId);},
    };
  }
  return {receipt,ref,storageAvailable,clear,submitted,submissionOptions};
}
