import type {Word} from './learning-types';
import type {GameAnswerResult,GameChoice,GameConfig,GameDifficulty,GameQuestion,GameQuestionKind,GameResult,GameState} from './game-types';

const canonical=(text:string)=>text.normalize('NFKC').toLowerCase().trim().replace(/[‘’]/g,"'").replace(/\s+/g,' ');
const choices:GameChoice[]=[0,1];
const levels=new Set<GameDifficulty>(['foundation','standard','challenge']);
const functionWords=new Set('a an the to of in on at by for from with as into onto per than and or but nor so yet if unless because although though while when where whether that which who whom whose what whatever whoever how why this these those there here it its he him his she her hers they them their theirs we us our ours you your yours i me my mine am is are was were be been being do does did done have has had will would shall should can could may might must not no yes any each either neither every all both some such much many more most very only just also too'.split(' '));

function randomSource(seed:string|number){
  let state=2166136261;
  for(const letter of String(seed)){state^=letter.charCodeAt(0);state=Math.imul(state,16777619);}
  state>>>=0;if(!state)state=0x9e3779b9;
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
}
function shuffle<T>(source:readonly T[],random:()=>number):T[]{
  const result=[...source];
  for(let index=result.length-1;index>0;index--){const other=Math.floor(random()*(index+1));[result[index],result[other]]=[result[other],result[index]];}
  return result;
}

function meanings(word:Word):string[]{
  return word.translation.replace(/\[[^\]]*\]/g,'').split(/[\n;,；，]/)
    .map(text=>text.replace(/^\s*(?:(?:n|v|vi|vt|vbl|a|adj|ad|adv|prep|pron|art|det|conj|num|pl|aux|abbr)\.\s*)+/i,'').replace(/[（(][^）)]*[）)]/g,'').trim())
    .filter(text=>text.length>=2&&text.length<=28&&/[\u3400-\u9fff]{2}/.test(text)&&!/[a-z]/i.test(text));
}
function lexemeFamily(text:string):Set<string>{
  const key=canonical(text),result=new Set([key]);
  const irregular:Record<string,string>={went:'go',gone:'go',ran:'run',saw:'see',seen:'see',men:'man',women:'woman',children:'child',feet:'foot',teeth:'tooth',better:'good',best:'good',worse:'bad',worst:'bad',took:'take',taken:'take',wrote:'write',written:'write',ate:'eat',eaten:'eat',bought:'buy',brought:'bring',caught:'catch',thought:'think',taught:'teach',knew:'know',known:'know',grew:'grow',grown:'grow',spoke:'speak',spoken:'speak'};
  if(irregular[key])result.add(irregular[key]);
  if(/ies$/.test(key))result.add(key.slice(0,-3)+'y');
  if(/ied$/.test(key))result.add(key.slice(0,-3)+'y');
  for(const suffix of ['s','es','ed','ing','er','est'])if(key.endsWith(suffix)&&key.length>suffix.length+2){
    const stem=key.slice(0,-suffix.length);result.add(stem);result.add(stem+'e');
    if(/(.)\1$/.test(stem))result.add(stem.slice(0,-1));
  }
  for(const accepted of [key.replace(/ise$/,'ize'),key.replace(/isation$/,'ization')])result.add(accepted);
  return result;
}
interface WordCandidate {word:Word;gloss:string;meanings:string[];family:Set<string>;variants:Set<string>}
function wordCandidate(word:Word):WordCandidate|null {
  const spelling=canonical(word.word);
  if(!spelling||spelling.length>45||!/[a-z]/i.test(spelling)||functionWords.has(spelling))return null;
  if(/过去式|过去分词|现在分词|第三人称单数|复数形式|人名|地名|词缀|字母表/.test(word.translation))return null;
  if(word.pos?.length&&!word.pos.some(pos=>['noun','verb','adjective','adverb','phrase'].includes(pos)))return null;
  const definitions=meanings(word);if(!definitions.length)return null;
  return {word,gloss:definitions[0],meanings:definitions,family:lexemeFamily(spelling),variants:new Set([spelling,...(word.accepted||[]).map(canonical)])};
}
function overlaps(left:WordCandidate,right:WordCandidate):boolean {
  if([...left.variants].some(value=>right.variants.has(value)))return true;
  if([...left.family].some(value=>right.family.has(value)))return true;
  const plain=(text:string)=>text.replace(/[的地得]/g,'');
  return left.meanings.some(a=>right.meanings.some(b=>{
    const one=plain(a),two=plain(b);
    return one===two||(Math.min(one.length,two.length)>=2&&(one.includes(two)||two.includes(one)));
  }));
}
function wordQuestions(words:readonly Word[],random:()=>number,limit:number):GameQuestion[]{
  const seen=new Set<string>(),candidates:WordCandidate[]=[];
  for(const word of words){const key=canonical(word.word);if(seen.has(key))continue;seen.add(key);const candidate=wordCandidate(word);if(candidate)candidates.push(candidate);}
  // Sample before pair comparisons to keep full-dictionary runs responsive on phones.
  // Every eligible word can enter the sample; a seed makes that choice reproducible.
  const shuffled=shuffle(candidates,random).slice(0,Math.max(80,limit*8)),result:GameQuestion[]=[];
  for(const current of shuffled){
    const alternatives=shuffled.filter(candidate=>!overlaps(current,candidate));
    if(!alternatives.length)continue;
    // Prefer distinct semantic themes when available; never manufacture a gloss.
    const distant=alternatives.filter(candidate=>current.word.topics?.length&&candidate.word.topics?.length&&!current.word.topics.some(topic=>candidate.word.topics!.includes(topic)));
    const pool=distant.length?distant:alternatives;
    const other=pool[Math.floor(random()*pool.length)];
    result.push({id:`word:${current.word.id}`,kind:'word',prompt:`选出与“${current.gloss}”对应的单词或表达。`,options:[current.word.word,other.word.word],answerIndex:0,
      explanation:`“${current.gloss}”对应 ${current.word.word}；${other.word.word} 的常见意思是“${other.gloss}”。结合各自释义区分，不按选项位置记忆。`,
      knowledge:'词汇·词义辨析',evidence:`词典释义：${current.word.translation}`,word:current.word});
    if(result.length>=limit)break;
  }
  return result;
}

function bankQuestions(raw:unknown):GameQuestion[]{
  const source=Array.isArray(raw)?raw:raw&&typeof raw==='object'&&'items' in raw?(raw as {items:unknown}).items:[];
  if(!Array.isArray(source))return [];
  const result:GameQuestion[]=[],seenIds=new Set<string>(),seenPrompts=new Set<string>();
  for(const value of source){
    if(!value||typeof value!=='object')continue;
    const item=value as Record<string,unknown>;
    if(item.kind!=='sentence'&&item.kind!=='phrase')continue;
    if(typeof item.id!=='string'||!item.id||typeof item.prompt!=='string'||!item.prompt.trim()||typeof item.explanation!=='string'||!item.explanation.trim()||typeof item.knowledge!=='string'||!item.knowledge.trim())continue;
    if(!Array.isArray(item.options)||item.options.length!==2||!item.options.every(option=>typeof option==='string'&&option.trim()))continue;
    if(canonical(item.options[0])===canonical(item.options[1])||!choices.includes(item.answerIndex as GameChoice))continue;
    if((item.prompt.match(/____/g)||[]).length!==1||seenIds.has(item.id)||seenPrompts.has(canonical(item.prompt)))continue;
    if(item.difficulty!==undefined&&!levels.has(item.difficulty as GameDifficulty))continue;
    seenIds.add(item.id);seenPrompts.add(canonical(item.prompt));
    result.push({id:item.id,kind:item.kind,prompt:item.prompt,options:[item.options[0],item.options[1]],answerIndex:item.answerIndex as GameChoice,explanation:item.explanation,knowledge:item.knowledge,
      ...(typeof item.evidence==='string'?{evidence:item.evidence}:{}),...(item.difficulty?{difficulty:item.difficulty as GameDifficulty}:{})});
  }
  return result;
}

/** Deterministic selection. Fewer results means the selected pool lacks usable questions. */
export function buildGameQuestions(words:readonly Word[],sentenceBank:unknown,config:GameConfig):GameQuestion[]{
  const random=randomSource(config.seed),length=[10,15,20].includes(config.length)?config.length:15;
  const bank=bankQuestions(sentenceBank).filter(question=>!config.difficulty||config.difficulty==='all'||question.difficulty===config.difficulty);
  const pools:Record<GameQuestionKind,GameQuestion[]>={word:config.kind==='word'||config.kind==='mix'?wordQuestions(words,random,length):[],sentence:config.kind==='sentence'||config.kind==='mix'?shuffle(bank.filter(question=>question.kind==='sentence'),random):[],phrase:config.kind==='phrase'||config.kind==='mix'?shuffle(bank.filter(question=>question.kind==='phrase'),random):[]};
  const kinds:GameQuestionKind[]=config.kind==='mix'?shuffle(['word','sentence','phrase'] as GameQuestionKind[],random):[config.kind];
  const selected:GameQuestion[]=[],ids=new Set<string>(),prompts=new Set<string>();
  while(selected.length<length){
    let added=false;
    for(const kind of kinds){
      let next=pools[kind]?.shift();
      while(next&&(ids.has(next.id)||prompts.has(canonical(next.prompt))))next=pools[kind]?.shift();
      if(!next)continue;selected.push(next);ids.add(next.id);prompts.add(canonical(next.prompt));added=true;
      if(selected.length===length)break;
    }
    if(!added)break;
  }
  const firstSide=random()<0.5?0:1;
  const positions=shuffle(selected.map((_,index)=>((index+firstSide)%2) as GameChoice),random);
  return shuffle(selected,random).map((question,index)=>{
    const answerIndex=positions[index],correct=question.options[question.answerIndex],wrong=question.options[question.answerIndex===0?1:0];
    return {...question,options:answerIndex===0?[correct,wrong]:[wrong,correct],answerIndex};
  });
}

export function createGameState(totalRounds=15):GameState {
  const rounds=Number.isFinite(totalRounds)?Math.max(0,Math.min(20,Math.floor(totalRounds))):15;
  return {crowd:12,combo:0,bestCombo:0,correct:0,wrong:0,answered:0,totalRounds:rounds,peakCrowd:12,obstacleHits:0,finished:rounds===0};
}
export function applyAnswer(state:GameState,question:GameQuestion,choice:GameChoice|null):GameAnswerResult {
  if(state.finished)throw new Error('This run has already ended.');
  if(choice!==null&&!choices.includes(choice))throw new Error('Choose one of the two gates.');
  const correct=choice===question.answerIndex,combo=correct?state.combo+1:0,comboBonus=correct&&combo%3===0?2:0;
  const crowd=Math.max(0,state.crowd+(correct?5+comboBonus:-4)),answered=state.answered+1;
  const next={...state,crowd,combo,bestCombo:Math.max(state.bestCombo,combo),correct:state.correct+(correct?1:0),wrong:state.wrong+(correct?0:1),answered,peakCrowd:Math.max(state.peakCrowd,crowd),finished:crowd===0||answered>=state.totalRounds};
  return {state:next,answer:{questionId:question.id,question,selectedIndex:choice,correct,selectedAnswer:choice===null?'未作答':question.options[choice],correctAnswer:question.options[question.answerIndex],crowdDelta:crowd-state.crowd,comboBonus}};
}
export function applyObstacle(state:GameState,loss=2):GameState {
  if(state.finished)return state;
  const damage=Number.isFinite(loss)?Math.max(0,Math.floor(loss)):2;
  if(!damage)return state;
  const crowd=Math.max(0,state.crowd-damage);
  return {...state,crowd,obstacleHits:state.obstacleHits+1,finished:crowd===0};
}
export function gameResult(state:GameState):GameResult {
  return {correct:state.correct,wrong:state.wrong,answered:state.answered,total:state.totalRounds,accuracy:state.answered?state.correct/state.answered:0,finalCrowd:state.crowd,peakCrowd:state.peakCrowd,bestCombo:state.bestCombo,obstacleHits:state.obstacleHits,completed:state.answered>=state.totalRounds&&state.totalRounds>0};
}
