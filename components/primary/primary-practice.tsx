'use client';
import {useCallback,useEffect,useRef,useState,type ComponentProps,type CSSProperties} from 'react';
import {BookOpen,Loader2,RefreshCw,Sparkles,Square} from 'lucide-react';
import type {PrimaryBankResponse,PrimaryGrade,PrimaryPaper} from '@/lib/primary-types';
import type {Grade,Paper} from '@/lib/learning-types';
import {api,getJson,postJson,ensureSession,errorText,isAbort,ApiError} from '../learn/api';
import {PaperPlayer} from '../learn/paper-player';
import {allowReplacement,draftToReplace,readDraft,writeDraft} from '../learn/practice-draft';
import {useProgress} from '../learn/progress';
import {getSkillFocus,isSavedFocus,type SkillFocus} from '@/lib/primary-skills';

type AiType='reading'|'grammar';
type GradeBody=Parameters<NonNullable<ComponentProps<typeof PaperPlayer>['gradePaper']>>[0];
interface AiInput{stage:'primary';grade:PrimaryGrade;type:AiType;level:'基础';topic:string;weaknesses?:SkillFocus[]}
interface Pending{version:1;input:AiInput;jobId?:string;requestId?:string;savedAt:number}
interface Open{paper:Paper;answers?:Record<string,string>;elapsed?:number;restored?:boolean}
interface DraftInfo{paper:PrimaryPaper;answers:Record<string,string>;elapsed:number}
const TYPE_LABEL:Record<string,string>={reading:'短文阅读',grammar:'句子与用法'};
const TTL=14*864e5;
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const REQUEST_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tap:CSSProperties={minHeight:44,minWidth:44};
const keyOf=(g:PrimaryGrade)=>`lexigo.primary.ai-draft.${g}.v1`;
const okId=(v:unknown)=>v===undefined||(typeof v==='string'&&ID.test(v));

export function parsePrimaryPending(raw:string|null,g:PrimaryGrade,now=Date.now()):Pending|null{
  try{
    if(!raw||raw.length>=10000)return null;
    const p=JSON.parse(raw) as {version?:unknown;input?:Partial<AiInput>;jobId?:unknown;requestId?:unknown;savedAt?:unknown}|null;
    const i=p?.input;
    if(!p||p.version!==1||!i||i.stage!=='primary'||i.grade!==g||(i.type!=='reading'&&i.type!=='grammar')||i.level!=='基础'||typeof i.topic!=='string'||!i.topic.trim()||i.topic.length>40||!okId(p.jobId)||(p.requestId!==undefined&&(typeof p.requestId!=='string'||!REQUEST_ID.test(p.requestId)))||(!p.jobId&&!p.requestId)||typeof p.savedAt!=='number'||!Number.isFinite(p.savedAt)||p.savedAt<0||p.savedAt>now+6e4||now-p.savedAt>=TTL)return null;
    if(i.weaknesses!==undefined&&!isSavedFocus(i.weaknesses,i.type))return null;
    return {version:1,input:{stage:'primary',grade:g,type:i.type,level:'基础',topic:i.topic,...(i.weaknesses?{weaknesses:i.weaknesses}:{})},jobId:p.jobId as string|undefined,requestId:p.requestId as string|undefined,savedAt:p.savedAt};
  }catch{return null;}
}
function loadPending(g:PrimaryGrade):Pending|null{
  try{return parsePrimaryPending(localStorage.getItem(keyOf(g)),g);}catch{return null;}
}
function storePending(g:PrimaryGrade,p:Pending|null):boolean{
  try{if(p)localStorage.setItem(keyOf(g),JSON.stringify(p));else localStorage.removeItem(keyOf(g));return true;}
  catch(e){console.warn('primary pending storage failed',e);return false;}
}
function readPrimaryDraft(g:PrimaryGrade):DraftInfo|null{
  try{
    const d=readDraft() as unknown as {paper?:PrimaryPaper;answers?:unknown;elapsed?:unknown}|null;
    if(!d||!d.paper||d.paper.grade!==g||!Array.isArray(d.paper.questions))return null;
    const answers=d.answers&&typeof d.answers==='object'?d.answers as Record<string,string>:{};
    return {paper:d.paper,answers,elapsed:typeof d.elapsed==='number'&&Number.isFinite(d.elapsed)?d.elapsed:0};
  }catch{return null;}
}

export function PrimaryPractice({grade,aiNotice,initialFocusType}:{grade:PrimaryGrade;aiNotice?:string;initialFocusType?:AiType}){
  const {progress}=useProgress();
  const [targetMistakes,setTargetMistakes]=useState(!!initialFocusType);
  const [tab,setTab]=useState<'bank'|'ai'>(initialFocusType?'ai':'bank');
  const [bank,setBank]=useState<PrimaryBankResponse|null>(null);
  const [bankErr,setBankErr]=useState('');
  const [reload,setReload]=useState(0);
  const [filter,setFilter]=useState<'all'|AiType>('all');
  const [open,setOpen]=useState<Open|null>(null);
  const [draft,setDraft]=useState<DraftInfo|null>(null);
  const [pending,setPending]=useState<Pending|null>(null);
  const [type,setType]=useState<AiType>(initialFocusType??'reading');
  const suggestions=getSkillFocus(progress.mistakes,type);
  const shownFocus=pending ? (pending.input.weaknesses??[]) : suggestions;
  const [topic,setTopic]=useState('日常生活');
  const [busy,setBusy]=useState(false);
  const [aiErr,setAiErr]=useState('');
  const [info,setInfo]=useState('');
  const [warn,setWarn]=useState('');
  const activeRef=useRef(true);const busyRef=useRef(false);const ctrlRef=useRef<AbortController|null>(null);

  useEffect(()=>{activeRef.current=true;return()=>{activeRef.current=false;ctrlRef.current?.abort();};},[]);
  useEffect(()=>{
    setDraft(readPrimaryDraft(grade));
    const p=loadPending(grade);setPending(p);
    if(p){setType(p.input.type);setTopic(p.input.topic);setTab('ai');setTargetMistakes(!!p.input.weaknesses?.length);}
  },[grade]);
  useEffect(()=>{
    const c=new AbortController();
    setBank(null);setOpen(null);setBankErr('');
    getJson(`/api/primary/bank?grade=${grade}`,c.signal).then(r=>{
      const d=r as PrimaryBankResponse;
      if(!d||!Array.isArray(d.items)||d.grade!==grade)throw new Error('题库数据格式不正确');
      if(!c.signal.aborted)setBank({...d,items:d.items.filter(p=>p.grade===grade)});
    }).catch(e=>{if(!isAbort(e))setBankErr(errorText(e));});
    return()=>c.abort();
  },[grade,reload]);

  const gradePaper=useCallback(async(body:GradeBody,signal?:AbortSignal):Promise<Grade>=>{
    await ensureSession();
    return (await postJson('/api/primary/grade',body,signal)) as Grade;
  },[]);
  const savePending=(p:Pending|null)=>{const saved=storePending(grade,p);if(!saved&&activeRef.current)setWarn('本地保存失败：刷新页面后可能无法取回该任务。请先保留当前页面。');return saved;};

  const run=async(resume?:Pending)=>{
    if(busyRef.current)return;
    const input:AiInput=resume?resume.input:{stage:'primary',grade,type,level:'基础',topic:topic.trim(),...(targetMistakes&&suggestions.length?{weaknesses:suggestions}:{})};
    if(!input.topic||input.topic.length>40){setAiErr('请输入1到40个字的主题');return;}
    const prior=readPrimaryDraft(grade);
    const approved=resume?'':draftToReplace(prior);
    if(!allowReplacement(prior,approved))return;
    busyRef.current=true;setBusy(true);setAiErr('');setInfo('');
    const c=new AbortController();ctrlRef.current=c;
    let rec:Pending=resume??{version:1,input,savedAt:Date.now()};
    const keep=(p:Pending)=>{rec=p;savePending(p);if(activeRef.current)setPending(p);};
    try{
      const result=await api.generate(input,c.signal,{resumeJobId:rec.jobId,resumeRequestId:rec.requestId,
        onSubmitting:id=>keep({...rec,requestId:id,savedAt:Date.now()}),
        onSubmitted:id=>keep({...rec,jobId:id,savedAt:Date.now()})});
      if(!activeRef.current)return;
      const paper=result as PrimaryPaper;
      if(paper.grade!==grade||paper.type!==input.type||!Array.isArray(paper.questions)||paper.questions.length===0||typeof paper.passage!=='string')throw new Error('返回的练习与当前年级或题型不匹配，请重试取回任务。');
      const current=readPrimaryDraft(grade);
      const replacement=draftToReplace(current,paper.id);
      if(replacement!==approved&&!allowReplacement(current,replacement)){
        setDraft(current);setInfo('旧草稿已保留。新练习已经生成，稍后点「取回原任务」即可打开。');return;
      }
      const same=current?.paper.id===paper.id?current:null;
      if(writeDraft(paper,same?.answers??{},same?.elapsed??0)){savePending(null);setPending(null);}
      else setWarn('练习已生成，但本地草稿保存失败。请保留当前页面；已保留原任务编号，可返回后再次取回，避免重复命题。');
      setOpen({paper,answers:same?.answers??{},elapsed:same?.elapsed??0,restored:!!same});
    }catch(e){
      if(!activeRef.current)return;
      if(isAbort(e))setInfo('已停止等待，服务器可能仍在处理。可以稍后取回同一个任务；如出现本地保存失败提示，请先保留此页面。');
      else{
        if(e instanceof ApiError&&e.jobTerminal){savePending(null);setPending(null);}
        setAiErr(errorText(e));
      }
    }finally{
      if(ctrlRef.current===c)ctrlRef.current=null;
      busyRef.current=false;
      if(activeRef.current)setBusy(false);
    }
  };
  const abandon=()=>{
    if(busyRef.current)return;
    if(pending&&!window.confirm('放弃这个待取回的任务？服务器可能仍在处理，已消耗的AI任务不会退回。'))return;
    savePending(null);setPending(null);setType('reading');setTopic('日常生活');setTargetMistakes(false);setAiErr('');setInfo('');
  };
  const onBack=()=>{setOpen(null);setDraft(readPrimaryDraft(grade));};
  const openBankPaper=(paper:PrimaryPaper)=>{
    if(busyRef.current)return;
    const saved=readPrimaryDraft(grade);
    if(saved&&saved.paper.id===paper.id)setOpen({paper:saved.paper,answers:saved.answers,elapsed:saved.elapsed,restored:true});
    else if(allowReplacement(saved,draftToReplace(saved,paper.id)))setOpen({paper});
  };

  if(open)return <>{warn&&<p className='primary-error' role='alert'>{warn}</p>}<PaperPlayer key={`${open.paper.id}:${open.paper.sealed??''}`} paper={open.paper} onBack={onBack} initialAnswers={open.answers} initialElapsed={open.elapsed} restored={open.restored} gradePaper={gradePaper}/></>;

  const items=bank?bank.items.filter(p=>filter==='all'||p.type===filter):[];
  const answered=draft?Object.values(draft.answers).filter(v=>typeof v==='string'&&v.trim()).length:0;
  const locked=busy||!!pending;
  return (
    <div className='primary-practice'>
      <div className='primary-tabs' role='tablist' aria-label='练习方式'>
        <button type='button' role='tab' aria-selected={tab==='bank'} disabled={busy} className={tab==='bank'?'primary-button primary-button-primary':'primary-button'} style={tap} onClick={()=>setTab('bank')}><BookOpen size={18} aria-hidden/>题库练习</button>
        <button type='button' role='tab' aria-selected={tab==='ai'} disabled={busy} className={tab==='ai'?'primary-button primary-button-primary':'primary-button'} style={tap} onClick={()=>setTab('ai')}><Sparkles size={18} aria-hidden/>AI小练习</button>
      </div>
      {draft&&(
        <div className='primary-panel primary-note' role='status'>
          <span>{grade}年级未完成练习：{draft.paper.title}（已答 {answered}/{draft.paper.questions.length} 题）</span>
          <button type='button' className='primary-button primary-button-primary' disabled={busy} style={tap} aria-label={`继续练习 ${draft.paper.title}`} onClick={()=>{if(!busyRef.current)setOpen({paper:draft.paper,answers:draft.answers,elapsed:draft.elapsed,restored:true});}}>继续练习</button>
        </div>
      )}
      {tab==='bank'?(
        <section className='primary-panel' aria-label='题库练习'>
          <h2 className='primary-section-title'>{grade}年级通用练习</h2>
          <p className='primary-note'>原创通用小学英语练习，不与教材同步，也不是考试真题。</p>
          <div className='primary-actions' role='group' aria-label='题型筛选'>
            {(['all','reading','grammar'] as const).map(f=>(
              <button key={f} type='button' aria-pressed={filter===f} className={filter===f?'primary-button primary-button-primary':'primary-button'} style={tap} onClick={()=>setFilter(f)}>{f==='all'?'全部':TYPE_LABEL[f]}</button>
            ))}
          </div>
          {bankErr?(
            <div className='primary-error' role='alert'>{bankErr}<button type='button' className='primary-button' style={tap} onClick={()=>setReload(n=>n+1)}><RefreshCw size={16} aria-hidden/>重试</button></div>
          ):!bank?(
            <p className='primary-note' role='status'><Loader2 size={16} aria-hidden/>正在加载题库…</p>
          ):(
            <>
              <p className='primary-note'>题库共 {bank.total} 套，当前显示 {items.length} 套。{bank.note}</p>
              {items.length===0?<p className='primary-empty'>这个年级暂时没有该类型的练习。</p>:(
                <div className='primary-card-grid'>
                  {items.map(p=>(
                    <article key={p.id} className='primary-paper-card'>
                      <h3>{p.title}</h3>
                      <div className='primary-tags'><span>{TYPE_LABEL[p.type]??p.type}</span><span>{p.questions.length} 题</span><span>{p.topic}</span></div>
                      <p className='primary-note'>来源：{p.source}</p>
                      <button type='button' className='primary-button primary-button-primary' disabled={busy} style={tap} aria-label={`开始练习 ${p.title}`} onClick={()=>openBankPaper(p)}>开始练习</button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      ):(
        <section className='primary-panel' aria-label='AI小练习'>
          <h2 className='primary-section-title'>AI小练习 · {grade}年级</h2>
          <p className='primary-note'>原创练习，每次消耗1个AI任务；不是真题或教材原题。</p>
          {aiNotice&&<p className='primary-note'>{aiNotice}</p>}
          <div className='primary-form-grid'>
            <label>题型
              <select className='primary-select' value={type} disabled={locked} aria-label='AI练习题型' onChange={e=>setType(e.target.value as AiType)}>
                <option value='reading'>短文阅读</option><option value='grammar'>句子与用法</option>
              </select>
            </label>
            <label>主题
              <input className='primary-input' value={topic} maxLength={40} disabled={locked} aria-label='AI练习主题' onChange={e=>setTopic(e.target.value)}/>
            </label>
          </div>
          <label className='primary-button' style={tap}><input type='checkbox' disabled={locked||!shownFocus.length} checked={targetMistakes&&shownFocus.length>0} onChange={e=>setTargetMistakes(e.target.checked)}/>按我的错题出新题</label>
          <p className='primary-note' aria-live='polite'>{shownFocus.length ? `复习方向为${shownFocus.map(item=>item.knowledge).join('、')}。${pending?'原任务已保存这些方向。':'出题时只从错题本发送勾选的知识点。'}` : pending?'原任务按普通练习出题。':'当前年级还没有适合这一题型的错题知识点。'}</p>
          {pending&&<p className='primary-note' role='status'>有一个待取回的任务（{TYPE_LABEL[pending.input.type]} · {pending.input.topic}），保存于 {new Date(pending.savedAt).toLocaleString()}。可能正在生成，也可能已完成。</p>}
          <div className='primary-actions'>
            {busy?(
              <>
                <span role='status'><Loader2 size={16} aria-hidden/>生成中…</span>
                <button type='button' className='primary-button' style={tap} onClick={()=>ctrlRef.current?.abort()}><Square size={16} aria-hidden/>停止等待，服务器可能仍在处理</button>
              </>
            ):pending?(
              <>
                <button type='button' className='primary-button primary-button-primary' style={tap} onClick={()=>void run(pending)}>取回原任务</button>
                <button type='button' className='primary-button' style={tap} onClick={abandon}>放弃任务</button>
              </>
            ):(
              <>
                <button type='button' className='primary-button primary-button-primary' style={tap} onClick={()=>void run()}><Sparkles size={16} aria-hidden/>生成练习</button>
                <button type='button' className='primary-button' style={tap} onClick={abandon}>重置</button>
              </>
            )}
          </div>
          {info&&<p className='primary-note' role='status'>{info}</p>}
          {warn&&<p className='primary-error' role='alert'>{warn}</p>}
          {aiErr&&<p className='primary-error' role='alert'>{aiErr}</p>}
        </section>
      )}
    </div>
  );
}
