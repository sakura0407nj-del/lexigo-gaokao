import bank from '../data/fish-words.json';
import primaryWordData from '../data/primary-words.json';
import type {FishConfig,FishEntity,FishEvent,FishInput,FishPoint,FishPos,FishPrimaryGrade,FishResult,FishRun,FishWord} from './fish-types';

export const WORLD_WIDTH=1000,WORLD_HEIGHT=600,TARGET_INTERVAL=10;
export const POS_LABEL:Record<FishPos,string>={noun:'名词',verb:'动词',adjective:'形容词',adverb:'副词'};
export const FISH_WORDS:readonly FishWord[]=(bank.words as FishWord[]).map(word=>Object.freeze(word));
const POS:FishPos[]=['noun','verb','adjective','adverb'];
const primaryBanks=new Map<FishPrimaryGrade,readonly FishWord[]>();
function wordPool(scope:{stage:'high'|'primary';primaryGrade?:FishPrimaryGrade}):readonly FishWord[]{
  if(scope.stage==='high')return FISH_WORDS;
  const grade=scope.primaryGrade;if(!grade)return [];
  if(!primaryBanks.has(grade)){
    const raw=primaryWordData as unknown as {id:string;word:string;grade:number;translation:string;example:string;exampleZh?:string;pos?:string[]}[];
    primaryBanks.set(grade,raw.filter(word=>word.grade===grade&&word.pos?.length===1&&['noun','verb','adjective','adverb'].includes(word.pos[0])&&word.id&&word.word&&word.translation&&word.example)
      .map(word=>Object.freeze({id:word.id,word:word.word,pos:word.pos![0] as FishPos,meaning:word.translation,example:word.example,...(word.exampleZh?{exampleZh:word.exampleZh}:{})})));
  }
  return primaryBanks.get(grade)!;
}
const FISH_COUNT=16,BASE_RADIUS=22,PLAYER_SPEED=220,EPS=1e-8;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const radiusFor=(correct:number)=>BASE_RADIUS+Math.min(18,correct*0.4);
function hash(seed:string){let value=2166136261;for(const letter of seed){value^=letter.charCodeAt(0);value=Math.imul(value,16777619);}return (value>>>0)||0x9e3779b9;}
function random(state:FishRun){let value=state.rng;value^=value<<13;value^=value>>>17;value^=value<<5;state.rng=value>>>0;return state.rng/4294967296;}
const distance=(a:FishPoint,b:FishPoint)=>Math.hypot(a.x-b.x,a.y-b.y);

function chooseTarget(state:FishRun):FishWord {
  const pool=wordPool(state);
  let candidates=pool.filter(word=>!state.targetHistory.includes(word.id)&&word.pos!==state.target?.pos&&!state.fish.some(fish=>fish.word.id===word.id));
  if(!candidates.length)candidates=pool.filter(word=>!state.targetHistory.includes(word.id)&&word.pos!==state.target?.pos);
  if(!candidates.length)candidates=pool.filter(word=>!state.targetHistory.includes(word.id));
  if(!candidates.length)candidates=pool.filter(word=>word.id!==state.target?.id&&word.pos!==state.target?.pos);
  return candidates[Math.floor(random(state)*candidates.length)];
}
function spawnFish(state:FishRun,pos:FishPos,avoid?:string):FishEntity {
  const available=wordPool(state).filter(word=>word.pos===pos);
  let pool=available.filter(word=>word.id!==state.target.id&&word.id!==avoid&&!state.fish.some(fish=>fish.word.id===word.id));
  if(!pool.length)pool=available.filter(word=>word.id!==avoid&&!state.fish.some(fish=>fish.word.id===word.id));
  if(!pool.length)pool=available.filter(word=>!state.fish.some(fish=>fish.word.id===word.id));
  if(!pool.length)pool=available;
  const word=pool[Math.floor(random(state)*pool.length)];
  const radius=21+Math.floor(random(state)*7);
  let point={x:radius,y:radius},best=point,bestDistance=-1;
  for(let attempt=0;attempt<50;attempt++){
    point={x:radius+10+random(state)*(WORLD_WIDTH-2*radius-20),y:radius+10+random(state)*(WORLD_HEIGHT-2*radius-20)};
    const clearance=distance(point,state.player);
    if(clearance>bestDistance){bestDistance=clearance;best=point;}
    if(clearance>state.player.radius+radius+80&&state.fish.every(fish=>distance(point,fish)>fish.radius+radius+20))break;
    if(attempt===49)point=best;
  }
  const facing:1|-1=random(state)<0.5?-1:1;
  return {id:++state.fishSerial,word,...point,radius,vx:facing*(26+random(state)*28),vy:(random(state)-0.5)*36,facing};
}
function event(state:FishRun,type:FishEvent['type'],word:FishWord,scoreDelta=0,comboBonus=0){
  state.events.push({id:++state.eventSerial,elapsed:state.elapsed,type,word,target:state.target,scoreDelta,comboBonus,x:state.player.x,y:state.player.y});
  if(state.events.length>200)state.events.splice(0,state.events.length-200);
}
function changeTarget(state:FishRun){
  state.target=chooseTarget(state);state.targetIndex++;
  state.targetHistory.push(state.target.id);state.nextChangeAt=(state.targetIndex+1)*TARGET_INTERVAL;
  state.graceUntil=state.elapsed+1;event(state,'change',state.target);
}

export function createFishRun(config:FishConfig={},seed:string|number='fish'):FishRun {
  const duration=config.duration===60||config.duration===180?config.duration:120;
  const stage=config.primaryGrade===undefined?'high':'primary';
  if(stage==='primary'&&![3,4,5,6].includes(config.primaryGrade as number))throw new Error('请选择三至六年级。');
  const scope={stage, ...(stage==='primary'?{primaryGrade:config.primaryGrade}:{})} as const;
  const pool=wordPool(scope);
  if(POS.some(pos=>pool.filter(word=>word.pos===pos).length<4))throw new Error('该年级的词库尚未准备完整，请稍后重试。');
  const seedText=String(seed).slice(0,120);
  const state:FishRun={version:1,...scope,seed:seedText,rng:hash(seedText),duration,elapsed:0,finished:false,score:0,combo:0,bestCombo:0,correct:0,wrong:0,growth:1,
    target:pool[0],targetIndex:0,targetHistory:[],nextChangeAt:10,graceUntil:1,
    player:{x:500,y:300,radius:BASE_RADIUS,facing:1,invulnerableUntil:0},fish:[],events:[],fishSerial:0,eventSerial:0};
  state.target=pool[Math.floor(random(state)*pool.length)];state.targetHistory.push(state.target.id);
  for(let index=0;index<FISH_COUNT;index++)state.fish.push(spawnFish(state,POS[index%POS.length]));
  return state;
}
function move(state:FishRun,seconds:number,input:FishInput){
  const direction=input.direction,target=input.target;
  let dx=0,dy=0,travel=PLAYER_SPEED*seconds;
  if(direction&&Number.isFinite(direction.x)&&Number.isFinite(direction.y)&&Math.hypot(direction.x,direction.y)>EPS){dx=direction.x;dy=direction.y;}
  else if(target&&Number.isFinite(target.x)&&Number.isFinite(target.y)){dx=target.x-state.player.x;dy=target.y-state.player.y;travel=Math.min(travel,Math.hypot(dx,dy));}
  const magnitude=Math.hypot(dx,dy);
  if(magnitude>EPS){state.player.x+=dx/magnitude*travel;state.player.y+=dy/magnitude*travel;if(Math.abs(dx)>EPS)state.player.facing=dx>0?1:-1;}
  state.player.x=clamp(state.player.x,state.player.radius,WORLD_WIDTH-state.player.radius);state.player.y=clamp(state.player.y,state.player.radius,WORLD_HEIGHT-state.player.radius);
  for(const fish of state.fish){
    fish.x+=fish.vx*seconds;fish.y+=fish.vy*seconds;
    if(fish.x<fish.radius){fish.x=2*fish.radius-fish.x;fish.vx=Math.abs(fish.vx);}
    if(fish.x>WORLD_WIDTH-fish.radius){fish.x=2*(WORLD_WIDTH-fish.radius)-fish.x;fish.vx=-Math.abs(fish.vx);}
    if(fish.y<fish.radius){fish.y=2*fish.radius-fish.y;fish.vy=Math.abs(fish.vy);}
    if(fish.y>WORLD_HEIGHT-fish.radius){fish.y=2*(WORLD_HEIGHT-fish.radius)-fish.y;fish.vy=-Math.abs(fish.vy);}
    fish.facing=fish.vx>=0?1:-1;
  }
}
function collide(state:FishRun){
  if(state.elapsed+EPS<state.graceUntil||state.elapsed+EPS<state.player.invulnerableUntil)return;
  const hits=state.fish.filter(fish=>distance(fish,state.player)<=fish.radius+state.player.radius).sort((a,b)=>distance(a,state.player)-distance(b,state.player)||a.id-b.id);
  for(const fish of hits){
    const before=state.score;
    state.fish=state.fish.filter(item=>item.id!==fish.id);
    if(fish.word.pos===state.target.pos){
      state.correct++;state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo);
      const bonus=state.combo%5===0?10:0;state.score+=10+bonus;
      state.player.radius=radiusFor(state.correct);state.growth=state.player.radius/BASE_RADIUS;
      state.player.x=clamp(state.player.x,state.player.radius,WORLD_WIDTH-state.player.radius);state.player.y=clamp(state.player.y,state.player.radius,WORLD_HEIGHT-state.player.radius);
      event(state,'correct',fish.word,state.score-before,bonus);
    }else{
      state.wrong++;state.combo=0;state.score=Math.max(0,state.score-5);state.player.invulnerableUntil=state.elapsed+0.8;
      event(state,'wrong',fish.word,state.score-before);
    }
    state.fish.push(spawnFish(state,fish.word.pos,fish.word.id));
    if(state.elapsed<state.player.invulnerableUntil)break;
  }
}

/** Call only for active play. dt=0, invalid dt, and finished states never advance. */
export function advanceFishRun(original:FishRun,dtSeconds:number,input:FishInput={}):FishRun {
  if(original.finished||!Number.isFinite(dtSeconds)||dtSeconds<=0)return original;
  const state:FishRun={...original,player:{...original.player},fish:original.fish.map(fish=>({...fish})),events:[...original.events],targetHistory:[...original.targetHistory]};
  const end=Math.min(state.duration,state.elapsed+dtSeconds);
  while(state.elapsed<end-EPS){
    const nextTick=(Math.floor(state.elapsed*60+EPS)+1)/60;
    const stop=Math.min(end,nextTick,state.nextChangeAt,state.duration);
    const step=stop-state.elapsed;
    if(step<=0)break;
    move(state,step,input);state.elapsed=stop;
    if(state.elapsed>=state.duration-EPS){state.elapsed=state.duration;state.finished=true;break;}
    if(state.elapsed>=state.nextChangeAt-EPS)changeTarget(state);
    if(Math.abs(state.elapsed*60-Math.round(state.elapsed*60))<1e-6)collide(state);
  }
  if(!state.finished&&end-state.elapsed>0&&end-state.elapsed<=EPS){move(state,end-state.elapsed,input);state.elapsed=end;}
  // Snap floating-point tails to exact lifecycle boundaries, including tiny final frames.
  if(state.elapsed>=state.duration-EPS){state.elapsed=state.duration;state.finished=true;}
  else if(state.elapsed>=state.nextChangeAt-EPS){state.elapsed=state.nextChangeAt;changeTarget(state);}
  return state;
}

const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const number=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const integer=(value:unknown,min:number,max:number)=>number(value,min,max)&&Number.isInteger(value);
function knownWord(raw:unknown,wordsById:Map<string,FishWord>):FishWord|null {if(!record(raw)||typeof raw.id!=='string')return null;const word=wordsById.get(raw.id);return word&&raw.word===word.word&&raw.pos===word.pos?word:null;}
function stageScope(raw:Record<string,unknown>,expected?:FishPrimaryGrade|'high'):{stage:'high'|'primary';primaryGrade?:FishPrimaryGrade}|null {
  if(raw.stage===undefined||raw.stage==='high')return raw.primaryGrade===undefined&&(expected===undefined||expected==='high')?{stage:'high'}:null;
  if(raw.stage!=='primary'||![3,4,5,6].includes(raw.primaryGrade as number)||expected==='high'||(expected!==undefined&&expected!==raw.primaryGrade))return null;
  return {stage:'primary',primaryGrade:raw.primaryGrade as FishPrimaryGrade};
}
const validPoint=(raw:Record<string,unknown>)=>number(raw.x,0,WORLD_WIDTH)&&number(raw.y,0,WORLD_HEIGHT);
function validTotals(raw:Record<string,unknown>){
  if(!integer(raw.correct,0,20000)||!integer(raw.wrong,0,20000)||!integer(raw.score,0,240000)||!integer(raw.bestCombo,0,raw.correct as number))return false;
  const correct=raw.correct as number,wrong=raw.wrong as number;
  return (raw.score as number)>=Math.max(0,correct*10-wrong*5)&&(raw.score as number)<=correct*10+Math.floor(correct/5)*10&&number(raw.growth,1,40/BASE_RADIUS)&&Math.abs((raw.growth as number)-radiusFor(correct)/BASE_RADIUS)<1e-7;
}
export function parseFishRun(raw:unknown,expected?:FishPrimaryGrade|'high'):FishRun|null {
  if(!record(raw)||raw.version!==1||typeof raw.seed!=='string'||raw.seed.length>120||![60,120,180].includes(raw.duration as number)||!number(raw.elapsed,0,raw.duration as number)||!integer(raw.rng,1,4294967295)||!validTotals(raw))return null;
  const scope=stageScope(raw,expected);if(!scope)return null;
  const wordsById=new Map(wordPool(scope).map(word=>[word.id,word]));
  const elapsed=raw.elapsed as number,duration=raw.duration as 60|120|180,target=knownWord(raw.target,wordsById);
  const targetIndex=Math.min(Math.floor((elapsed+EPS)/TARGET_INTERVAL),duration/TARGET_INTERVAL-1);
  if(!target||raw.finished!==(elapsed===duration)||raw.targetIndex!==targetIndex||raw.nextChangeAt!==(targetIndex+1)*TARGET_INTERVAL||!number(raw.graceUntil,targetIndex*10+1-EPS,targetIndex*10+1+EPS)||!integer(raw.combo,0,raw.bestCombo as number))return null;
  if(!Array.isArray(raw.targetHistory)||raw.targetHistory.length!==targetIndex+1||raw.targetHistory.some(id=>typeof id!=='string'||!wordsById.has(id))||new Set(raw.targetHistory).size!==raw.targetHistory.length||raw.targetHistory.at(-1)!==target.id)return null;
  if(!record(raw.player)||!validPoint(raw.player)||raw.player.radius!==radiusFor(raw.correct as number)||![1,-1].includes(raw.player.facing as number)||!number(raw.player.invulnerableUntil,0,elapsed+0.8+EPS))return null;
  const player=raw.player as unknown as FishRun['player'];
  if(player.x<player.radius||player.x>WORLD_WIDTH-player.radius||player.y<player.radius||player.y>WORLD_HEIGHT-player.radius)return null;
  if(!integer(raw.fishSerial,FISH_COUNT,100000)||!Array.isArray(raw.fish)||raw.fish.length!==FISH_COUNT)return null;
  const fish:FishEntity[]=[],ids=new Set<number>();
  for(const item of raw.fish){
    if(!record(item)||!integer(item.id,1,raw.fishSerial as number)||ids.has(item.id as number)||!validPoint(item)||!number(item.radius,21,27)||!number(item.vx,-54,54)||!number(item.vy,-18,18)||item.facing!==((item.vx as number)>=0?1:-1))return null;
    const word=knownWord(item.word,wordsById);if(!word)return null;
    const entry={...item,word} as unknown as FishEntity;
    if(entry.x<entry.radius-EPS||entry.x>WORLD_WIDTH-entry.radius+EPS||entry.y<entry.radius-EPS||entry.y>WORLD_HEIGHT-entry.radius+EPS)return null;
    ids.add(entry.id);fish.push(entry);
  }
  if(POS.some(pos=>fish.filter(item=>item.word.pos===pos).length!==FISH_COUNT/POS.length))return null;
  if(!integer(raw.eventSerial,0,100000)||raw.eventSerial!==(raw.correct as number)+(raw.wrong as number)+targetIndex||!Array.isArray(raw.events)||raw.events.length!==Math.min(200,raw.eventSerial as number))return null;
  const events:FishEvent[]=[];let lastId=0,lastTime=0;
  for(const item of raw.events){
    if(!record(item)||!integer(item.id,lastId+1,raw.eventSerial as number)||!number(item.elapsed,lastTime,elapsed)||!validPoint(item)||!['correct','wrong','change'].includes(item.type as string))return null;
    const word=knownWord(item.word,wordsById),eventTarget=knownWord(item.target,wordsById);if(!word||!eventTarget)return null;
    if(item.type==='correct'&&(word.pos!==eventTarget.pos||![10,20].includes(item.scoreDelta as number)||item.comboBonus!==(item.scoreDelta===20?10:0)))return null;
    if(item.type==='wrong'&&(word.pos===eventTarget.pos||!integer(item.scoreDelta,-5,0)||item.comboBonus!==0))return null;
    if(item.type==='change'&&(word.id!==eventTarget.id||item.scoreDelta!==0||item.comboBonus!==0))return null;
    events.push({...item,word,target:eventTarget} as unknown as FishEvent);lastId=item.id as number;lastTime=item.elapsed as number;
  }
  return {...raw,...scope,target,player:{...player},fish,events,targetHistory:[...raw.targetHistory]} as unknown as FishRun;
}

export function fishResult(state:FishRun,completedAt:string):FishResult {
  const time=Date.parse(completedAt);if(!Number.isFinite(time))throw new Error('Invalid completion time');
  return {version:1,stage:state.stage,...(state.stage==='primary'?{primaryGrade:state.primaryGrade}:{}),id:`fish-${state.stage==='primary'?`p${state.primaryGrade}-`:''}${hash(state.seed).toString(16)}-${time<0?'n'+(-time).toString(36):time.toString(36)}`,completedAt:new Date(time).toISOString(),duration:state.duration,elapsed:state.elapsed,score:state.score,correct:state.correct,wrong:state.wrong,bestCombo:state.bestCombo,growth:state.growth,accuracy:state.correct+state.wrong?state.correct/(state.correct+state.wrong):0,completed:state.finished};
}
export function parseFishResult(raw:unknown,expected?:FishPrimaryGrade|'high'):FishResult|null {
  if(!record(raw)||raw.version!==1||typeof raw.id!=='string'||!/^fish-(?:p[3-6]-)?[a-z0-9]+-[a-z0-9]+$/.test(raw.id)||typeof raw.completedAt!=='string'||!Number.isFinite(Date.parse(raw.completedAt))||![60,120,180].includes(raw.duration as number)||!number(raw.elapsed,0,raw.duration as number)||raw.completed!==(raw.elapsed===raw.duration)||!validTotals(raw))return null;
  const scope=stageScope(raw,expected);if(!scope||(scope.stage==='primary'?!raw.id.startsWith(`fish-p${scope.primaryGrade}-`):/^fish-p[3-6]-/.test(raw.id)))return null;
  const total=(raw.correct as number)+(raw.wrong as number),accuracy=total?(raw.correct as number)/total:0;
  if(!number(raw.accuracy,0,1)||Math.abs((raw.accuracy as number)-accuracy)>1e-9)return null;
  return {...raw,...scope} as unknown as FishResult;
}
