import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),ts=require('typescript');
mkdirSync('work',{recursive:true});
const file='work/fish-engine-check.mjs';
const compiled=ts.transpileModule(readFileSync('lib/fish-engine.ts','utf8'),{fileName:'fish-engine.ts',compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
writeFileSync(file,compiled.replace(/(from\s+['"][^'"]+\.json['"])(;)/g,'$1 with {type:"json"}$2'));
const fish=await import(pathToFileURL(resolve(file)).href+`?time=${Date.now()}`),checks=[];
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
const clone=value=>JSON.parse(JSON.stringify(value));
function test(name,run){try{run();checks.push({name,passed:true})}catch(error){checks.push({name,passed:false,error:error.message})}}
function parked(state){const copy=clone(state);copy.fish.forEach((item,index)=>{item.x=40+(index%4)*70;item.y=40+Math.floor(index/4)*70;item.vx=0;item.vy=0;item.facing=1});return copy}
function place(state,matching){const copy=parked(state);const selected=copy.fish.find(item=>(item.word.pos===copy.target.pos)===matching);selected.x=copy.player.x;selected.y=copy.player.y;return {state:copy,id:selected.id}}

test('word bank is balanced and each example actually uses the classified word',()=>{
  assert.equal(fish.FISH_WORDS.length,96);assert.equal(new Set(fish.FISH_WORDS.map(word=>word.id)).size,96);assert.equal(new Set(fish.FISH_WORDS.map(word=>word.word)).size,96);
  for(const pos of ['noun','verb','adjective','adverb'])assert.equal(fish.FISH_WORDS.filter(word=>word.pos===pos).length,24);
  for(const word of fish.FISH_WORDS){assert.ok(word.meaning&&word.example);assert.ok(new RegExp('\\b'+word.word+'\\b','i').test(word.example),word.id+' missing from example');assert.ok(word.example.length<=100)}
  assert.ok(fish.FISH_WORDS.filter(word=>word.pos==='adverb'&&!word.word.endsWith('ly')).length>=4);
});
test('seeded initial states reproduce spawns and always offer target-POS prey',()=>{
  const a=fish.createFishRun({},'class-1'),b=fish.createFishRun({},'class-1');assert.deepEqual(a,b);assert.notDeepEqual(a,fish.createFishRun({},'class-2'));assert.equal(a.duration,120);assert.equal(a.fish.length,16);
  for(const pos of Object.keys(fish.POS_LABEL))assert.equal(a.fish.filter(item=>item.word.pos===pos).length,4);
  assert.equal(new Set(a.fish.map(item=>item.id)).size,16);assert.equal(new Set(a.fish.map(item=>item.word.id)).size,16);
  assert.ok(a.fish.every(item=>item.word.id!==a.target.id&&Math.hypot(item.x-a.player.x,item.y-a.player.y)>item.radius+a.player.radius));
  assert.ok(fish.parseFishRun(clone(a)));
});
test('target changes at exactly ten active seconds with a one-second grace',()=>{
  const start=parked(fish.createFishRun({duration:60},'clock'));
  const before=fish.advanceFishRun(start,9.99);assert.equal(before.targetIndex,0);assert.equal(before.target.id,start.target.id);
  const changed=fish.advanceFishRun(before,0.01);near(changed.elapsed,10);assert.equal(changed.targetIndex,1);assert.notEqual(changed.target.id,start.target.id);assert.notEqual(changed.target.pos,start.target.pos);near(changed.graceUntil,11);assert.equal(changed.nextChangeAt,20);
  const positioned=place(changed,true).state,protectedRun=fish.advanceFishRun(positioned,0.9);assert.equal(protectedRun.correct,changed.correct);
  const released=fish.advanceFishRun(protectedRun,0.1);assert.equal(released.correct,changed.correct+1);
});
test('large frame deltas visit every target boundary and stop at the exact duration',()=>{
  for(const duration of [60,120,180]){
    const result=fish.advanceFishRun(parked(fish.createFishRun({duration},'long-'+duration)),duration+50);
    assert.equal(result.elapsed,duration);assert.equal(result.finished,true);assert.equal(result.targetIndex,duration/10-1);assert.equal(result.targetHistory.length,duration/10);assert.equal(new Set(result.targetHistory).size,result.targetHistory.length);
    assert.deepEqual(result.events.filter(item=>item.type==='change').map(item=>item.elapsed),Array.from({length:duration/10-1},(_,index)=>(index+1)*10));
    assert.equal(fish.advanceFishRun(result,1),result);assert.ok(fish.parseFishRun(clone(result)));
  }
});
test('paused and invalid deltas do not advance the active clock',()=>{
  const state=fish.createFishRun({},'pause');for(const dt of [0,-1,NaN,Infinity])assert.equal(fish.advanceFishRun(state,dt),state);
  assert.equal(state.elapsed,0);assert.equal(fish.advanceFishRun(state,0.5).target.id,state.target.id);
});
test('floating-point tail frames cannot leave a zero-time unfinished run',()=>{
  let state=parked(fish.createFishRun({duration:60},'tiny-tail'));state.elapsed=60-1e-9;state.targetIndex=5;state.nextChangeAt=60;
  const ended=fish.advanceFishRun(state,1e-9);assert.equal(ended.elapsed,60);assert.equal(ended.finished,true);
  state=parked(fish.createFishRun({duration:60},'tiny-change'));state.elapsed=10-1e-9;
  const changed=fish.advanceFishRun(state,1e-9);assert.equal(changed.targetIndex,1);assert.equal(changed.elapsed,10);assert.equal(changed.graceUntil,11);
});
test('same-POS collision awards once, grows the player and replaces the consumed fish',()=>{
  const ready=fish.advanceFishRun(parked(fish.createFishRun({},'eat')),1.1),placed=place(ready,true),before=JSON.stringify(placed.state);
  const next=fish.advanceFishRun(placed.state,1/60);assert.equal(JSON.stringify(placed.state),before);assert.equal(next.correct,1);assert.equal(next.score,10);assert.equal(next.combo,1);assert.ok(next.player.radius>ready.player.radius);assert.ok(next.growth>1);
  assert.ok(!next.fish.some(item=>item.id===placed.id));assert.equal(next.fish.length,16);assert.equal(new Set(next.fish.map(item=>item.id)).size,16);
  assert.equal(fish.advanceFishRun(next,1/60).correct,1);assert.equal(next.events.filter(item=>item.type==='correct').length,1);assert.ok(fish.parseFishRun(clone(next)));
});
test('five correct catches award the combo bonus and a mistake resets combo',()=>{
  let state=fish.advanceFishRun(parked(fish.createFishRun({},'combo')),1.1);
  for(let index=0;index<5;index++)state=fish.advanceFishRun(place(state,true).state,1/60);
  assert.equal(state.score,60);assert.equal(state.combo,5);assert.equal(state.bestCombo,5);assert.equal(state.events.at(-1).comboBonus,10);
  state=fish.advanceFishRun(place(state,false).state,1/60);assert.equal(state.score,55);assert.equal(state.combo,0);assert.equal(state.wrong,1);near(state.player.invulnerableUntil-state.elapsed,0.8);assert.equal(state.bestCombo,5);
  assert.ok(fish.parseFishRun(clone(state)));
});
test('wrong catches floor the score at zero and provide 0.8 seconds of immunity',()=>{
  let state=fish.advanceFishRun(parked(fish.createFishRun({},'wrong')),1.1);state=fish.advanceFishRun(place(state,false).state,1/60);
  assert.equal(state.score,0);assert.equal(state.wrong,1);assert.equal(state.events.at(-1).scoreDelta,0);
  const waiting=place(state,false).state;state=fish.advanceFishRun(waiting,0.79);assert.equal(state.wrong,1);
  state=fish.advanceFishRun(state,0.03);assert.equal(state.wrong,2);assert.equal(state.score,0);
});
test('directional movement is normalized, pointer targets do not overshoot, and borders clamp',()=>{
  const start=parked(fish.createFishRun({},'move'));
  const straight=fish.advanceFishRun(start,0.2,{direction:{x:1,y:0}}),diagonal=fish.advanceFishRun(start,0.2,{direction:{x:1,y:1}});
  near(Math.hypot(straight.player.x-500,straight.player.y-300),44);near(Math.hypot(diagonal.player.x-500,diagonal.player.y-300),44);
  const pointer=fish.advanceFishRun(start,0.2,{target:{x:501,y:300}});near(pointer.player.x,501);near(pointer.player.y,300);
  const edge=fish.advanceFishRun(start,6,{direction:{x:1,y:1}});assert.ok(edge.player.x<=1000-edge.player.radius);assert.ok(edge.player.y<=600-edge.player.radius);
  assert.ok(edge.fish.every(item=>item.x>=item.radius-1e-6&&item.x<=1000-item.radius+1e-6&&item.y>=item.radius-1e-6&&item.y<=600-item.radius+1e-6));
});
test('serialization restores random state and simulation resumes reproducibly',()=>{
  const active=fish.advanceFishRun(fish.createFishRun({},'restore'),17.35,{target:{x:800,y:450}}),restored=fish.parseFishRun(clone(active));assert.ok(restored);
  assert.deepEqual(fish.advanceFishRun(active,8.75,{direction:{x:-1,y:0}}),fish.advanceFishRun(restored,8.75,{direction:{x:-1,y:0}}));
  for(const change of [s=>s.score=-1,s=>s.rng=0,s=>s.target.pos='invalid',s=>s.targetIndex=999,s=>s.fish[1].id=s.fish[0].id,s=>s.player.x=-1,s=>s.fish[0].word.id='unknown',s=>s.events=[]]){const corrupt=clone(active);change(corrupt);assert.equal(fish.parseFishRun(corrupt),null);}
});
test('fixed-tick simulation is stable across common frame partitions',()=>{
  const initial=parked(fish.createFishRun({},'frames'));let stepped=initial;
  for(let index=0;index<600;index++)stepped=fish.advanceFishRun(stepped,1/60,{direction:{x:0.2,y:0.1}});
  const single=fish.advanceFishRun(initial,10,{direction:{x:0.2,y:0.1}});near(stepped.elapsed,single.elapsed);near(stepped.player.x,single.player.x);near(stepped.player.y,single.player.y);assert.equal(stepped.target.id,single.target.id);assert.equal(stepped.score,single.score);
});
test('result history validates accuracy, totals and completion without changing the run',()=>{
  const state=fish.advanceFishRun(parked(fish.createFishRun({duration:60},'result')),60),before=JSON.stringify(state),result=fish.fishResult(state,'2026-11-15T10:00:00Z');
  assert.equal(JSON.stringify(state),before);assert.equal(result.completed,true);assert.equal(result.elapsed,60);assert.ok(fish.parseFishResult(clone(result)));
  assert.equal(fish.parseFishResult({...result,accuracy:2}),null);assert.equal(fish.parseFishResult({...result,completed:false}),null);assert.equal(fish.parseFishResult({...result,score:-1}),null);assert.equal(fish.parseFishResult({...result,completedAt:'invalid'}),null);
  assert.throws(()=>fish.fishResult(state,'invalid'));
});
test('primary fish use only the chosen grade with all four POS groups and unique targets',()=>{
  for(const grade of [3,4,5,6])for(const seed of ['primary-a','primary-b','primary-c','primary-d']){
    const state=fish.createFishRun({duration:180,primaryGrade:grade},seed);assert.equal(state.stage,'primary');assert.equal(state.primaryGrade,grade);
    assert.ok(state.target.id.startsWith(`p${grade}-`));assert.ok(state.fish.every(item=>item.word.id.startsWith(`p${grade}-`)));assert.equal(new Set(state.fish.map(item=>item.word.id)).size,16);
    for(const pos of Object.keys(fish.POS_LABEL))assert.equal(state.fish.filter(item=>item.word.pos===pos).length,4);
    const ended=fish.advanceFishRun(parked(state),180);assert.equal(ended.finished,true);assert.equal(new Set(ended.targetHistory).size,18);assert.ok(ended.targetHistory.every(id=>id.startsWith(`p${grade}-`)));assert.ok(fish.parseFishRun(clone(ended),grade));
  }
  assert.throws(()=>fish.createFishRun({primaryGrade:9},'invalid-grade'));
});
test('primary restoration and history reject different grades and high-school scopes',()=>{
  for(const grade of [3,4,5,6]){
    const active=fish.advanceFishRun(fish.createFishRun({primaryGrade:grade},'scope-'+grade),17.35,{target:{x:820,y:450}}),restored=fish.parseFishRun(clone(active),grade);assert.ok(restored);
    assert.deepEqual(fish.advanceFishRun(active,11.2),fish.advanceFishRun(restored,11.2));assert.equal(fish.parseFishRun(clone(active),'high'),null);
    for(const other of [3,4,5,6].filter(item=>item!==grade))assert.equal(fish.parseFishRun(clone(active),other),null);
    const mixed=clone(active);mixed.fish[0].word=fish.FISH_WORDS[0];assert.equal(fish.parseFishRun(mixed,grade),null);
    const result=fish.fishResult(active,'2026-11-15T10:00:00Z');assert.ok(result.id.startsWith(`fish-p${grade}-`));assert.ok(fish.parseFishResult(clone(result),grade));assert.equal(fish.parseFishResult(clone(result),'high'),null);
    for(const other of [3,4,5,6].filter(item=>item!==grade))assert.equal(fish.parseFishResult(clone(result),other),null);
    const unscoped=clone(active);delete unscoped.stage;assert.equal(fish.parseFishRun(unscoped,grade),null);
  }
});
test('legacy unscoped high-school saves remain readable only in the high-school scope',()=>{
  const legacy=clone(fish.advanceFishRun(fish.createFishRun({},'legacy'),15));delete legacy.stage;assert.equal(fish.parseFishRun(legacy,'high')?.stage,'high');assert.equal(fish.parseFishRun(legacy,3),null);
  const result=fish.fishResult(fish.createFishRun({},'legacy'),'2026-11-15T10:00:00Z');delete result.stage;assert.equal(fish.parseFishResult(result,'high')?.stage,'high');assert.equal(fish.parseFishResult(result,3),null);
  const corrupted=clone(legacy);corrupted.stage='invalid';assert.equal(fish.parseFishRun(corrupted),null);
});
console.log(JSON.stringify({passed:checks.filter(check=>check.passed).length,failed:checks.filter(check=>!check.passed).length,words:fish.FISH_WORDS.length,checks},null,2));
if(checks.some(check=>!check.passed))process.exitCode=1;
