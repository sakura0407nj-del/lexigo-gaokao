'use client';
import {useEffect,useRef,useState} from 'react';
import {Heart,Check,Volume2,Snail,Search,RotateCcw,Download,Layers,Headphones} from 'lucide-react';
import type {PrimaryGrade,PrimaryWord,PrimaryBook} from '@/lib/primary-types';
import {primaryCsv} from '@/lib/primary-csv';
import {Flashcards} from '../learn/flashcards';
import {downloadText} from '../learn/ui';
import {BookSelector,useBookScope} from './book-scope';
import './book-tools.css';
import type {SpeechState} from '../learn/use-speech';
import {useProgress} from '../learn/progress';
import {isDue} from '../learn/review';

type Filter='all'|'starred'|'learned'|'due';
const PAGE=12;
const FILTERS:{id:Filter;label:string}[]=[{id:'all',label:'全部'},{id:'starred',label:'收藏'},{id:'learned',label:'已记住'},{id:'due',label:'到期复习'}];
const POS:Record<string,string>={noun:'名词',n:'名词','n.':'名词',verb:'动词',v:'动词','v.':'动词',adjective:'形容词',adj:'形容词','adj.':'形容词',adverb:'副词',adv:'副词','adv.':'副词',pronoun:'代词',pron:'代词','pron.':'代词',preposition:'介词',prep:'介词','prep.':'介词',conjunction:'连词',conj:'连词','conj.':'连词',number:'数词',other:'其他',numeral:'数词',num:'数词','num.':'数词',article:'冠词',determiner:'限定词',interjection:'感叹词',phrase:'短语'};

interface Props{grade:PrimaryGrade;words:PrimaryWord[];books?:PrimaryBook[];speech:SpeechState;loading?:boolean;error?:string;onRetry?:()=>void;onOpenDictation?:()=>void}

export function PrimaryWords({grade,words,books,speech,loading=false,error='',onRetry,onOpenDictation}:Props){
  const {progress,isLearned,isStarred,toggleLearned,toggleStarred,storageAvailable}=useProgress();
  const scope=useBookScope(grade,books,words);
  const [deck,setDeck]=useState<PrimaryWord[]|null>(null);
  const [query,setQuery]=useState('');
  const [topic,setTopic]=useState('');
  const [filter,setFilter]=useState<Filter>('all');
  const [limit,setLimit]=useState(PAGE);
  const [audioError,setAudioError]=useState('');
  const stopRef=useRef(speech.stop);
  useEffect(()=>{stopRef.current=speech.stop;},[speech.stop]);
  useEffect(()=>()=>stopRef.current(),[]);
  useEffect(()=>{setQuery('');setTopic('');setFilter('all');setLimit(PAGE);stopRef.current();},[grade]);

  const gradeWords=scope.items;
  const topics=Array.from(new Set(gradeWords.map(w=>w.topic).filter(Boolean))).sort();
  const q=query.trim().toLowerCase();
  const found=gradeWords.filter(w=>{
    if(topic&&topics.includes(topic)&&w.topic!==topic)return false;
    if(filter==='starred'&&!isStarred(w.id))return false;
    if(filter==='learned'&&!isLearned(w.id))return false;
    if(filter==='due'&&!(progress.review[w.id]&&isDue(progress.review[w.id])))return false;
    if(!q)return true;
    return [w.word,w.translation,w.example,w.exampleZh,w.topic].some(t=>(t||'').toLowerCase().includes(q));
  });
  if(q){
    const priority=(w:PrimaryWord)=>w.word.toLowerCase()===q?0:w.word.toLowerCase().startsWith(q)?1:w.translation.includes(q)?2:3;
    found.sort((a,b)=>priority(a)-priority(b));
  }
  const learnedCount=gradeWords.filter(w=>isLearned(w.id)).length;
  const shown=found.slice(0,limit);
  const canSpeak=speech.supported&&speech.hasEnglish;
  const voiceHint=!speech.ready?'':!speech.supported?'这个浏览器不支持朗读，可以换用系统自带的浏览器试试。':!speech.hasEnglish?'设备里没有找到英语语音，可以在系统设置里添加英语语音后再试。':'';

  const say=(text:string,rate:number)=>{
    if(!canSpeak||!text)return;
    setAudioError('');
    speech.prime();
    const started=speech.speak(text,{rate,onError:()=>setAudioError('这次朗读没有成功，请再点一次，并检查设备音量。')});
    if(!started)setAudioError('朗读暂时未能开始，请再次点按朗读按钮。');
  };
  const resetFilters=()=>{setQuery('');setTopic('');setFilter('all');setLimit(PAGE);};
  const startCards=()=>{
    // Keep the selection frozen while a review changes its learned/due status.
    const unseen=found.filter(w=>!isLearned(w.id)),known=found.filter(w=>isLearned(w.id));
    setDeck([...unseen,...known].slice(0,10));
  };
  function exportFound(){
    const rows=found.map(w=>[scope.label,w.word,w.translation,w.example,w.exampleZh]);
    downloadText(`拾词-${scope.label}-${found.length}词.csv`,primaryCsv([['学习范围','英文','中文释义','英文例句','例句对照'],...rows]),'text/csv;charset=utf-8');
  }
  if(deck)return <Flashcards words={deck} title={scope.label} speech={speech} onExit={()=>{speech.stop();setDeck(null);}}/>;

  return(
    <section className='primary-words' aria-labelledby='primary-words-title'>
      <h2 id='primary-words-title' className='primary-section-title'>我的单词书</h2>
      {!storageAvailable&&<p className='primary-note'>最新标记尚未保存，刷新可能丢失；可在学习记录里导出备份。</p>}
      {voiceHint&&<p className='primary-note'>{voiceHint}</p>}
      {audioError&&<p className='primary-error' role='alert'>{audioError}</p>}

      {loading?(
        <p className='primary-empty' role='status'>正在准备单词…</p>
      ):error?(
        <div className='primary-error' role='alert'>
          <p>{error}</p>
          {onRetry&&<button type='button' className='primary-button primary-button-primary' onClick={onRetry}><RotateCcw size={18} aria-hidden='true'/> 再试一次</button>}
        </div>
      ):(
        <>
          <BookSelector scope={scope}/>
          {gradeWords.length>0&&<label className="primary-scope-progress">已记住 {learnedCount} / {gradeWords.length} 词
            <progress value={learnedCount} max={gradeWords.length}/>
          </label>}
          <div className='primary-word-toolbar'>
            <label className='primary-search'>
              <Search size={18} aria-hidden='true'/>
              <span className='primary-sr-only'>搜索单词</span>
              <input type='search' className='primary-input' value={query} placeholder='搜英文、中文、例句或主题' onChange={e=>{setQuery(e.target.value);setLimit(PAGE);}}/>
            </label>
            <label>
              <span className='primary-sr-only'>选择主题</span>
              <select className='primary-select' value={topics.includes(topic)?topic:''} onChange={e=>{setTopic(e.target.value);setLimit(PAGE);}}>
                <option value=''>全部主题</option>
                {topics.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <div className='primary-filter-group' role='group' aria-label='显示范围'>
              {FILTERS.map(f=>(
                <button key={f.id} type='button' className='primary-button' aria-pressed={filter===f.id} onClick={()=>{setFilter(f.id);setLimit(PAGE);}}>{f.label}</button>
              ))}
            </div>
          </div>
          <p className='primary-note' role='status' aria-live='polite'>找到 {found.length} 个词</p>
          <div className="primary-unit-tools">
            <button type="button" className="primary-button primary-button-primary" disabled={!found.length} onClick={startCards}><Layers size={17}/>翻卡复习（{Math.min(10,found.length)} 词）</button>
            {onOpenDictation&&<button type="button" className="primary-button" disabled={!gradeWords.length} onClick={onOpenDictation}><Headphones size={17}/>去练{scope.unit?'本单元':scope.book?'本册':'本年级'}听写</button>}
            <button type="button" className="primary-button" disabled={!found.length} onClick={exportFound}><Download size={17}/>导出筛选词表</button>
          </div>

          {found.length===0?(
            <div className='primary-empty'>
              <p>{gradeWords.length===0?'这个范围的词目正在核对。可以切换到本年级全部词汇继续学习。':filter==='due'?'当前范围没有到期的复习词。翻卡后会按学习情况安排下次复习。':'没有找到符合条件的词，换个关键词或筛选试试。'}</p>
              {gradeWords.length>0&&<button type='button' className='primary-text-button' onClick={resetFilters}>清除筛选</button>}
            </div>
          ):(
            <div className='primary-word-grid'>
              {shown.map(w=>{
                const starred=isStarred(w.id);
                const learned=isLearned(w.id);
                return(
                  <article key={w.id} className='primary-word-card'>
                    <div className='primary-word-top'>
                      <div>
                        <h3 lang='en'>{w.word}</h3>
                        {w.phonetic&&<span className='primary-phonetic'>{w.phonetic}</span>}
                      </div>
                      <button type='button' className='primary-button' aria-pressed={starred} aria-label={starred?`取消收藏 ${w.word}`:`收藏 ${w.word}`} onClick={()=>toggleStarred(w)}>
                        <Heart size={20} aria-hidden='true' fill={starred?'currentColor':'none'}/>
                      </button>
                    </div>
                    <div className='primary-tags'>
                      {w.topic&&<span>{w.topic}</span>}
                      {w.pos?.map(p=><span key={p}>{POS[p.trim().toLowerCase()]??p}</span>)}
                    </div>
                    <p className='primary-translation'>{w.translation}</p>
                    {(w.example||w.exampleZh)&&(
                      <div className='primary-example'>
                        {w.example&&<p lang='en'>{w.example}</p>}
                        {w.exampleZh&&<p>{w.exampleZh}</p>}
                        {w.example&&canSpeak&&<button type="button" className="primary-text-button" aria-label={`朗读例句 ${w.example}`} onClick={()=>say(w.example,.85)}><Volume2 size={15}/> 听例句</button>}
                      </div>
                    )}
                    <div className='primary-word-actions'>
                      <button type='button' className='primary-button' disabled={!canSpeak} aria-label={`朗读 ${w.word}`} onClick={()=>say(w.word,0.85)}><Volume2 size={18} aria-hidden='true'/> 听一听</button>
                      <button type='button' className='primary-button' disabled={!canSpeak} aria-label={`慢速朗读 ${w.word}`} onClick={()=>say(w.word,0.65)}><Snail size={18} aria-hidden='true'/> 慢一点</button>
                      <button type='button' className={learned?'primary-button primary-button-primary':'primary-button'} aria-pressed={learned} onClick={()=>toggleLearned(w)}><Check size={18} aria-hidden='true'/> 我记住了</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {found.length>limit&&(
            <button type='button' className='primary-button primary-load-more' onClick={()=>setLimit(l=>l+PAGE)}>再看 {Math.min(PAGE,found.length-limit)} 个（已显示 {shown.length}/{found.length}）</button>
          )}
        </>
      )}
    </section>
  );
}
