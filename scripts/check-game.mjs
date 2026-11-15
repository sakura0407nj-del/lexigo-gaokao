import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url),ts=require('typescript');
mkdirSync('work',{recursive:true});
const output='work/game-engine-check.mjs';
writeFileSync(output,ts.transpileModule(readFileSync('lib/game-engine.ts','utf8'),{fileName:'game-engine.ts',compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const engine=await import(pathToFileURL(resolve(output)).href+`?time=${Date.now()}`);
const bank=JSON.parse(readFileSync('data/game-sentences.json','utf8'));
const core=JSON.parse(readFileSync('data/words.json','utf8'));
const checks=[];
function test(name,work){try{work();checks.push({name,passed:true})}catch(error){checks.push({name,passed:false,error:error.message})}}
const make=(word,translation,extra={})=>({id:word,word,translation,phonetic:'',frequency:'medium',rank:3000,...extra});
const words=[make('apple','n. 苹果'),make('banana','n. 香蕉'),make('teacher','n. 教师'),make('doctor','n. 医生'),make('river','n. 河流'),make('ocean','n. 海洋'),make('mountain','n. 山脉'),make('forest','n. 森林'),make('happy','adj. 快乐的'),make('angry','adj. 生气的'),make('travel','v. 旅行'),make('repair','v. 修理')];
const config={kind:'word',length:10,seed:'classroom-1',difficulty:'all'};
const sample=engine.buildGameQuestions(words,bank,config);

test('bank contains 96 distinct authored questions across kinds and levels',()=>{
  assert.equal(bank.version,1);assert.equal(bank.items.length,96);assert.equal(new Set(bank.items.map(q=>q.id)).size,96);
  assert.equal(new Set(bank.items.map(q=>q.prompt.toLowerCase().replace(/\s+/g,' '))).size,96);
  for(const kind of ['sentence','phrase'])for(const level of ['foundation','standard','challenge'])assert.equal(bank.items.filter(q=>q.kind===kind&&q.difficulty===level).length,16);
  for(const question of bank.items){
    assert.equal(question.options.length,2);assert.notEqual(question.options[0].trim().toLowerCase(),question.options[1].trim().toLowerCase());
    assert.ok(question.answerIndex===0||question.answerIndex===1);assert.equal((question.prompt.match(/____/g)||[]).length,1);
    assert.ok(question.prompt.length<=180,question.id+' prompt too long');assert.ok(question.options.every(option=>option.length<=45&&!/^[AB][.)、：:]/.test(option)),question.id+' invalid options');
    assert.ok(question.explanation.length>=40&&question.explanation.length<=180,question.id+' explanation length');
    assert.ok(/[\u3400-\u9fff]/.test(question.explanation));assert.ok(question.knowledge);assert.ok(question.evidence);
    assert.ok(!/选项\s*[AB]|[AB]\s*(?:项|正确|错误)/i.test(question.explanation),question.id+' explanation depends on shuffled option position');
    assert.ok(!/正确答案|answer\s*[:=]/i.test(question.prompt),question.id+' answer hint in prompt');
  }
});
test('same seed reproduces an immutable unique run with balanced gate placement',()=>{
  const before=JSON.stringify({words,bank});
  assert.deepEqual(sample,engine.buildGameQuestions(words,bank,config));assert.notDeepEqual(sample,engine.buildGameQuestions(words,bank,{...config,seed:'different-seed'}));
  assert.equal(sample.length,10);assert.equal(new Set(sample.map(q=>q.id)).size,10);assert.equal(new Set(sample.map(q=>q.prompt)).size,10);
  assert.equal(sample.filter(q=>q.answerIndex===0).length,5);
  assert.ok(sample.every(q=>q.options[q.answerIndex]===q.word.word&&q.options.every(option=>words.some(w=>w.word===option))));
  assert.equal(JSON.stringify({words,bank}),before);
});
test('distractors reject identical translations, accepted variants and inflections',()=>{
  for(const pair of [
    [make('big','adj. 巨大的'),make('large','adj. 巨大的')],
    [make('apple','n. 苹果'),make('apples','n. 苹果们')],
    [make('organize','v. 组织',{accepted:['organize','organise']}),make('organise','v. 策划')],
    [make('go','v. 前往'),make('gone','adj. 离开的')],
  ])assert.equal(engine.buildGameQuestions(pair,bank,config).length,0);
  assert.equal(engine.buildGameQuestions([make('the','art. 这个'),make('of','prep. 属于')],bank,config).length,0);
  assert.equal(engine.buildGameQuestions([words[0]],bank,config).length,0);
});
test('word scope is supplied by the caller and authored difficulty affects only the bank',()=>{
  const scoped=words.slice(0,4).map(word=>({...word,book:'book-1',unit:'unit-2'}));
  const run=engine.buildGameQuestions(scoped,bank,config);assert.equal(run.length,4);assert.ok(run.every(q=>q.word.book==='book-1'&&q.word.unit==='unit-2'));
  assert.deepEqual(engine.buildGameQuestions(words,bank,{...config,difficulty:'foundation'}),engine.buildGameQuestions(words,bank,{...config,difficulty:'challenge'}));
  const grammar=engine.buildGameQuestions([],bank,{...config,kind:'sentence',length:20,difficulty:'foundation'});assert.equal(grammar.length,16);assert.ok(grammar.every(q=>q.kind==='sentence'&&q.difficulty==='foundation'));
  const phrase=engine.buildGameQuestions([],bank,{...config,kind:'phrase',length:15,difficulty:'challenge'});assert.equal(phrase.length,15);assert.ok(phrase.every(q=>q.kind==='phrase'&&q.difficulty==='challenge'));
});
test('mixed runs balance the three available kinds and never repeat prompts',()=>{
  const run=engine.buildGameQuestions(words,bank,{...config,kind:'mix',length:20});assert.equal(run.length,20);
  const counts=['word','sentence','phrase'].map(kind=>run.filter(q=>q.kind===kind).length);assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
  assert.equal(new Set(run.map(q=>q.prompt)).size,20);assert.equal(run.filter(q=>q.answerIndex===0).length,10);
  assert.equal(engine.buildGameQuestions([],null,{...config,kind:'mix'}).length,0);
});
test('bank input validation discards malformed and duplicated questions',()=>{
  const one=bank.items[0];
  const run=engine.buildGameQuestions([],[one,one,{...one,id:'invalid',answerIndex:2},{...one,id:'same-options',options:['same','same']},{...one,id:'no-blank',prompt:'No blank here.'}],{...config,kind:one.kind});
  assert.equal(run.length,1);assert.equal(run[0].id,one.id);
});
test('crowd changes are pure and combo bonuses occur every third correct answer',()=>{
  const first=Object.freeze(engine.createGameState(10));let state=first;
  for(const [index,expected] of [17,22,29].entries()){const result=engine.applyAnswer(state,sample[index],sample[index].answerIndex);assert.equal(result.state.crowd,expected);assert.equal(result.answer.comboBonus,index===2?2:0);state=result.state;}
  assert.equal(first.crowd,12);assert.equal(state.bestCombo,3);
  const wrong=engine.applyAnswer(state,sample[3],sample[3].answerIndex===0?1:0);assert.equal(wrong.state.crowd,25);assert.equal(wrong.state.combo,0);assert.equal(wrong.state.wrong,1);assert.equal(wrong.answer.crowdDelta,-4);
  const missed=engine.applyAnswer(wrong.state,sample[4],null);assert.equal(missed.answer.selectedAnswer,'未作答');assert.equal(missed.state.crowd,21);
});
test('three initial misses end the run at zero and prevent further answers',()=>{
  let state=engine.createGameState(20);for(let index=0;index<3;index++)state=engine.applyAnswer(state,sample[index],null).state;
  assert.equal(state.crowd,0);assert.equal(state.finished,true);assert.equal(engine.gameResult(state).completed,false);assert.equal(engine.gameResult(state).accuracy,0);
  assert.throws(()=>engine.applyAnswer(state,sample[3],0));assert.equal(engine.applyObstacle(state),state);
});
test('obstacles do not manufacture answer records or negative crowds',()=>{
  const state=engine.createGameState(10),hit=engine.applyObstacle(state);assert.equal(hit.crowd,10);assert.equal(hit.obstacleHits,1);assert.equal(hit.answered,0);
  assert.equal(engine.applyObstacle(hit,100).crowd,0);assert.equal(engine.applyObstacle(hit,100).finished,true);
  assert.equal(engine.applyObstacle(hit,-4),hit);assert.equal(state.crowd,12);
});
test('finishing all rounds produces a consistent learning result',()=>{
  let state=engine.createGameState(20);for(let index=0;index<20;index++)state=engine.applyAnswer(state,sample[index%10],sample[index%10].answerIndex).state;
  const result=engine.gameResult(state);assert.equal(state.finished,true);assert.equal(result.completed,true);assert.equal(result.accuracy,1);assert.equal(result.correct,20);assert.equal(result.wrong,0);assert.equal(result.finalCrowd,124);assert.equal(result.bestCombo,20);
  assert.equal(engine.createGameState(0).finished,true);assert.equal(engine.gameResult(engine.createGameState()).accuracy,0);
});
test('the full existing dictionary produces a usable 20-question word run',()=>{
  const run=engine.buildGameQuestions(core,bank,{...config,length:20});assert.equal(run.length,20);
  assert.ok(run.every(q=>q.kind==='word'&&q.word&&q.options[0]!==q.options[1]));
});
console.log(JSON.stringify({passed:checks.filter(check=>check.passed).length,failed:checks.filter(check=>!check.passed).length,bankQuestions:bank.items.length,checks},null,2));
if(checks.some(check=>!check.passed))process.exitCode=1;
