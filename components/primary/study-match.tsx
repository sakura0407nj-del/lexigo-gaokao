import {useState} from 'react';
import type {PrimaryWord} from '@/lib/primary-types';
import {meaningLabel} from './study-activities';

type Side='english'|'chinese';
type Pick={side:Side;id:string};

export function StudyMatch({pairs,meanings,onComplete,onReplay,onExit}:{
  pairs:PrimaryWord[];meanings:PrimaryWord[];onComplete:(score:number)=>void;onReplay:()=>void;onExit:()=>void;
}){
  const [pick,setPick]=useState<Pick>();
  const [matched,setMatched]=useState<string[]>([]);
  const [firstTryMisses,setFirstTryMisses]=useState<string[]>([]);
  const [attempts,setAttempts]=useState(0);
  const [notice,setNotice]=useState('先选任意一张卡，再到另一列找它的配对。');
  const done=matched.length===pairs.length;
  function choose(side:Side,word:PrimaryWord){
    if(!pick||pick.side===side){
      setPick({side,id:word.id});
      setNotice(side==='english'?'请选择对应的中文意思。':'请选择对应的英语单词。');
      return;
    }
    setPick(undefined);
    if(pick.id===word.id){
      const next=[...matched,word.id];
      setMatched(next);
      setNotice('配对成功。');
      if(next.length===pairs.length)onComplete(pairs.length-firstTryMisses.length);
    }else{
      const englishId=side==='english'?word.id:pick.id;
      if(!firstTryMisses.includes(englishId))setFirstTryMisses([...firstTryMisses,englishId]);
      setAttempts(n=>n+1);
      setNotice('这两张意思不同，再试一次。');
    }
  }
  function column(items:PrimaryWord[],side:Side){
    return <div className="study-match-column" role="group" aria-label={side==='english'?'英文卡':'中文卡'}>
      {items.map(word=>{
        const solved=matched.includes(word.id);
        return <button type="button" className="study-choice" lang={side==='english'?'en':'zh-CN'}
          key={word.id} disabled={solved} data-result={solved?'correct':undefined}
          aria-pressed={pick?.side===side&&pick.id===word.id} onClick={()=>choose(side,word)}>
          {side==='english'?word.word:meaningLabel(word)}
        </button>;
      })}
    </div>;
  }
  return <section className="primary-panel study-session">
    <h2>{done?'中英配对完成':'中英配对'}</h2>
    {done?<p className="study-step" role="status">一次配对成功 {pairs.length-firstTryMisses.length}/{pairs.length} 组 · 试错 {attempts} 次</p>:<>
      <p className="study-step">已配对 {matched.length}/{pairs.length} 组</p>
      <p className="study-instruction" role="status">{notice}</p>
      <div className="study-match-grid">{column(pairs,'english')}{column(meanings,'chinese')}</div>
    </>}
    <div className="study-actions">
      {done&&<button type="button" className="primary-button primary-button-primary" onClick={onReplay}>换一组配对</button>}
      <button type="button" className="primary-button" onClick={onExit}>返回练习室</button>
    </div>
  </section>;
}
