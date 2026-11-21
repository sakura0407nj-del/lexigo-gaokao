import {useState} from 'react';
import {BookOpen,Headphones,Turtle,Volume2} from 'lucide-react';
import type {SpeechState} from '../learn/use-speech';
import {useStudyAudio} from './study-round';
import type {StudyStory} from './study-stories';

export function StoryLesson({story,speech,onStart,onExit}:{
  story:StudyStory;speech:SpeechState;onStart:(hideTranscript:boolean)=>void;onExit:()=>void;
}){
  const [listening,setListening]=useState(false);
  const [translated,setTranslated]=useState(false);
  const audio=useStudyAudio(speech);
  const hideTranscript=listening&&audio.available;
  const script=story.lines.map(([english])=>english).join(' ');
  return <section className="primary-panel study-session">
    <h2 lang="en">{story.title}</h2>
    <p className="study-instruction">{story.subtitle}</p>
    <div className="study-actions" role="group" aria-label="故事练习方式">
      <button type="button" className="primary-button" aria-pressed={!hideTranscript} onClick={()=>{setListening(false);audio.stop();}}><BookOpen size={17} aria-hidden/> 读故事</button>
      <button type="button" className="primary-button" disabled={!audio.available} aria-pressed={hideTranscript} onClick={()=>{setListening(true);audio.play(script,.88,'all');}}><Headphones size={17} aria-hidden/> 先听后答</button>
    </div>
    {audio.available&&<div className="study-actions">
      <button type="button" className="primary-button" onClick={()=>audio.play(script,.88,'all')}><Volume2 size={17} aria-hidden/> 播放全文</button>
      <button type="button" className="primary-button" onClick={()=>audio.play(script,.69,'all')}><Turtle size={17} aria-hidden/> 慢速全文</button>
      {audio.playing&&<button type="button" className="primary-button" onClick={audio.stop}>停止播放</button>}
    </div>}
    {audio.error&&<p className="primary-error" role="alert">{audio.error}</p>}
    {!audio.available&&<p className="primary-note">英语语音不可用，可以读故事和答题。</p>}
    {!hideTranscript&&<>
      <div className="study-actions"><button type="button" className="primary-button" aria-pressed={translated} onClick={()=>setTranslated(value=>!value)}>{translated?'隐藏中文':'显示中文'}</button></div>
      <ol className="study-story-lines">
        {story.lines.map(([english,chinese],index)=><li key={english} data-playing={audio.playing===String(index)}>
          <div><p lang="en">{english}</p>{translated&&<p className="study-instruction">{chinese}</p>}</div>
          {audio.available&&<button type="button" className="primary-button" aria-label={`朗读第 ${index+1} 段`} onClick={()=>audio.play(english,.85,String(index))}><Volume2 size={18} aria-hidden/></button>}
        </li>)}
      </ol>
    </>}
    <div className="study-actions">
      <button type="button" className="primary-button primary-button-primary" onClick={()=>{audio.stop();onStart(hideTranscript);}}>开始答题</button>
      <button type="button" className="primary-button" onClick={onExit}>返回练习室</button>
    </div>
  </section>;
}
