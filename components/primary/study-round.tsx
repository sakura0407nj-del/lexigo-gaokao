import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,RotateCcw,Turtle,Volume2} from 'lucide-react';
import type {PrimaryGrade,PrimaryWord} from '@/lib/primary-types';
import type {MistakeDraft} from '../learn/mistakes';
import type {SpeechState} from '../learn/use-speech';
import {useProgress} from '../learn/progress';
import {meaningLabel,type SkillQuestion} from './study-activities';
import type {StudyStory} from './study-stories';

export interface Question {
  id:string;
  kind:'meaning'|'sentence'|'listening'|'story';
  prompt:string;
  options:readonly string[];
  answer:string;
  context?:string;
  explanation:string;
  word?:PrimaryWord;
}
export interface Answer { question:Question; value:string }

export function skillQuestions(questions:SkillQuestion[]):Question[]{
  return questions.map(q=>({...q,explanation:[q.word.word+' · '+meaningLabel(q.word),q.word.example,q.word.exampleZh].filter(Boolean).join('\n')}));
}

export function storyQuestions(story:StudyStory):Question[]{
  return story.questions.map((q,i)=>({
    id:story.id+'-'+(i+1),kind:'story',prompt:q.prompt,options:q.options,answer:q.options[q.correct],
    context:story.lines.map(([english])=>english).join('\n'),
    explanation:story.lines[q.line].join('\n')
  }));
}

export function toMistakes(grade:PrimaryGrade,title:string,answers:Answer[]):MistakeDraft[]{
  return answers.filter(({question:q,value})=>value!==q.answer&&q.kind!=='listening').map(({question:q,value})=>{
    const letter=(option:string)=>String.fromCharCode(65+q.options.indexOf(option));
    return {
      id:`primary-g${grade}-studio-${q.id}`,kind:'exercise',title,
      ...(q.kind==='story'?{type:'reading' as const}:{}),
      prompt:q.kind==='meaning'?'为 '+q.prompt+' 选出词义。':q.prompt,
      context:q.context??'',knowledge:q.kind==='story'?'定位短文细节':q.kind==='sentence'?'用例句理解单词':'单词词义',
      correctAnswer:letter(q.answer),yourAnswer:letter(value),
      options:q.options.map((option,i)=>String.fromCharCode(65+i)+'. '+option),explanation:q.explanation
    };
  });
}

export function useStudyAudio(speech:SpeechState){
  const [error,setError]=useState('');
  const [playing,setPlaying]=useState('');
  const stopRef=useRef(speech.stop);
  useEffect(()=>{stopRef.current=speech.stop;},[speech.stop]);
  useEffect(()=>()=>stopRef.current(),[]);
  const available=speech.supported&&speech.hasEnglish;
  function play(text:string,rate:number,key=text){
    setError('');
    speech.prime();
    setPlaying(key);
    const failed=()=>{setPlaying('');setError('朗读未能播放。请重试或检查设备的英语语音。');};
    if(!speech.speak(text,{rate,onEnd:()=>setPlaying(''),onError:failed}))failed();
  }
  function stop(){
    speech.stop();setPlaying('');setError('');
  }
  return {available,playing,error,play,stop};
}

export function StudyRound({title,questions,speech,onFinish,onRetry,onExit,renderContext}:{
  title:string;questions:Question[];speech:SpeechState;onFinish:(answers:Answer[])=>void;
  onRetry:(questions:Question[])=>void;onExit:()=>void;renderContext?:()=>React.ReactNode;
}){
  const [answers,setAnswers]=useState<Answer[]>([]);
  const [choice,setChoice]=useState<string>();
  const promptRef=useRef<HTMLHeadingElement>(null);
  const audio=useStudyAudio(speech);
  const {isStarred,toggleStarred}=useProgress();
  const index=answers.length;
  const current=questions[index];
  const wrong=answers.filter(({question,value})=>value!==question.answer);
  const checked=choice!==undefined;

  useEffect(()=>{
    promptRef.current?.focus({preventScroll:true});
    promptRef.current?.scrollIntoView({block:'nearest'});
  },[index]);
  function advance(){
    if(!checked||!current)return;
    audio.stop();
    const next=[...answers,{question:current,value:choice}];
    if(next.length===questions.length)onFinish(next);
    setAnswers(next);setChoice(undefined);
  }
  if(!current)return <section className="primary-panel study-session" aria-labelledby="study-result">
    <h2 id="study-result" ref={promptRef} tabIndex={-1}>{title}完成</h2>
    <strong className="study-score">{answers.length-wrong.length}<span> / {answers.length} 题答对</span></strong>
    {wrong.length>0&&<ul className="study-review-list">
      {wrong.map(({question,value})=><li key={question.id}>
        <strong>{question.kind==='listening'?question.word?.word:question.prompt}</strong>
        <p>你的答案 {value} · 正确答案 {question.answer}</p>
        {question.word&&<button type="button" className="primary-button" aria-pressed={isStarred(question.word.id)} onClick={()=>toggleStarred(question.word!)}>
          {isStarred(question.word.id)?'已收藏':'收藏这个词'}
        </button>}
      </li>)}
    </ul>}
    <div className="study-actions">
      {wrong.length>0&&<button type="button" className="primary-button primary-button-primary" onClick={()=>onRetry(wrong.map(a=>a.question))}><RotateCcw size={17} aria-hidden/> 重练错题</button>}
      <button type="button" className="primary-button" onClick={onExit}>返回练习室</button>
    </div>
  </section>;

  const hint=current.kind==='meaning'?'选择中文意思':current.kind==='sentence'?'根据中文选词填空':current.kind==='listening'?'听音选词':'选择正确答案';
  return <section className="primary-panel study-session" aria-labelledby="study-question">
    <p className="study-step">{title} · 第 {index+1}/{questions.length} 题</p>
    <progress aria-label="本轮答题进度" value={index} max={questions.length}/>
    <p className="study-instruction">{hint}</p>
    <h2 id="study-question" className="study-question" ref={promptRef} tabIndex={-1} lang={current.kind==='listening'?'zh-CN':'en'}>{current.prompt}</h2>
    {current.kind==='sentence'&&<p className="study-instruction">{current.context}</p>}
    {current.kind==='listening'&&current.word&&<div className="study-actions">
      <button type="button" className="primary-button primary-button-primary" disabled={!audio.available} onClick={()=>audio.play(current.word!.word,.9)}><Volume2 size={18} aria-hidden/> 播放单词</button>
      <button type="button" className="primary-button" disabled={!audio.available} onClick={()=>audio.play(current.word!.word,.65)}><Turtle size={18} aria-hidden/> 慢速</button>
      {!audio.available&&<p className="primary-note">当前设备的英语语音不可用。可返回练习室选择其他练习。</p>}
    </div>}
    {audio.error&&<p className="primary-error" role="alert">{audio.error}</p>}
    {renderContext?.()}
    <div className="study-choices" role="group" aria-label="答案选项">
      {current.options.map(option=><button type="button" className="study-choice" key={option}
        disabled={checked||(current.kind==='listening'&&!audio.available)}
        data-result={checked?(option===current.answer?'correct':option===choice?'wrong':undefined):undefined}
        onClick={()=>setChoice(option)}>
        <span lang={current.kind==='meaning'?'zh-CN':'en'}>{option}</span>
        {checked&&option===current.answer&&<Check size={17} aria-label="正确答案"/>}
      </button>)}
    </div>
    {checked&&<div className="study-feedback" role="status">
      <strong>{choice===current.answer?'答对了':`正确答案是 ${current.answer}`}</strong>
      <p>{current.explanation}</p>
    </div>}
    <div className="study-actions">
      {checked&&<button type="button" className="primary-button primary-button-primary" onClick={advance}>
        {index+1===questions.length?'查看结果':'下一题'} <ArrowRight size={17} aria-hidden/>
      </button>}
      <button type="button" className="primary-button" onClick={onExit}>返回练习室</button>
    </div>
  </section>;
}
