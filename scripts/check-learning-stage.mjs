import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

mkdirSync('work/checks/stage',{recursive:true});
await Promise.all([
  build({entryPoints:{stage:'lib/learning-stage.ts',practice:'components/learn/practice-draft.ts',exam:'components/learn/exam-storage.ts',fish:'components/learn/fish-storage.ts',engine:'lib/fish-engine.ts',runner:'lib/game-engine.ts'},bundle:true,platform:'node',format:'cjs',outdir:'work/checks/stage',outExtension:{'.js':'.cjs'}}),
  build({stdin:{contents:readFileSync('components/learn/game-view.tsx','utf8')+'\nexport {restore as checkRestore,primaryRunnerPool as checkPrimaryPool};',loader:'tsx',sourcefile:'game-view.tsx',resolveDir:path.resolve('components/learn')},bundle:true,platform:'node',format:'cjs',loader:{'.css':'empty'},outfile:'work/checks/stage/runner-view.cjs'}),
  build({stdin:{contents:readFileSync('components/learn/progress.tsx','utf8')+'\nexport {STORAGE_KEY as checkKey};',loader:'tsx',sourcefile:'progress.tsx',resolveDir:path.resolve('components/learn')},bundle:true,platform:'node',format:'cjs',outfile:'work/checks/stage/progress.cjs'}),
]);
const require=createRequire(import.meta.url),memory=new Map(),checks=[];
const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{search:''},localStorage:storage}});
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
const fresh=name=>{const file=require.resolve(`../work/checks/stage/${name}.cjs`);delete require.cache[file];return require(file);};
const stage=fresh('stage'),fish=fresh('fish'),engine=fresh('engine'),runner=fresh('runner'),view=fresh('runner-view');
const check=(name,fn)=>{memory.clear();window.location.search='';try{fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:error.message});}};
const paper={id:'primary-test-paper',title:'Test',type:'reading',level:'基础',topic:'school',passage:'A small test.',instructions:'Read.',questions:[{id:'1',prompt:'Choose.',points:1}],minutes:5,source:'unit test',origin:'original'};
const fixture=(id,word,translation,grade)=>({id,word,translation,grade,phonetic:'',frequency:'high',rank:1,pos:['noun'],topic:'school',example:`This is a ${word}.`,exampleZh:'测试句。'});
try {
  check('stage parsing is explicit and invalid or absent modes preserve high school',()=>{
    assert.equal(stage.getLearningStage('https://example.test/?stage=primary&grade=5'),'primary');
    assert.equal(stage.getLearningStage('?stage=primary'),'primary');
    for(const url of ['','?stage=high','?stage=other','?stage=Primary'])assert.equal(stage.getLearningStage(url),'high');
    assert.equal(stage.getPrimaryGrade('?stage=primary&grade=6'),6);assert.equal(stage.getPrimaryGrade('?grade=100'),3);
  });
  check('all legacy high-school storage keys are preserved and each grade has its own namespace',()=>{
    for(const base of ['lexigo.progress.v1','lexigo.practice-draft.v1','lexigo.exam.v1','lexigo.game-run.v1','lexigo.game-history.v1','lexigo.game-best.v1','lexigo.fish-run.v1','lexigo.fish-history.v1']){
      assert.equal(stage.scopedStorageKey(base),base);
      const keys=[3,4,5,6].map(grade=>stage.scopedStorageKey(base,grade));assert.equal(new Set(keys).size,4);assert.ok(keys.every(key=>key!==base));
    }
    window.location.search='?stage=primary&grade=4';assert.equal(stage.scopedStorageKey('sample'),'sample.primary.g4');
    assert.equal(stage.scopedStorageKey('sample',6),'sample.primary.g6');assert.throws(()=>stage.scopedStorageKey('sample',2));
  });
  check('full navigation initializes progress, practice and exam scopes without removing existing work',()=>{
    const high=fresh('practice');high.writeDraft(paper,{'1':'high'},10);
    assert.equal(fresh('progress').checkKey,'lexigo.progress.v1');assert.equal(fresh('exam').EXAM_STORAGE_KEY,'lexigo.exam.v1');
    window.location.search='?stage=primary&grade=3';const grade3=fresh('practice');assert.equal(grade3.readDraft(),null);grade3.writeDraft(paper,{'1':'grade3'},20);
    assert.equal(fresh('progress').checkKey,'lexigo.progress.v1.primary.g3');assert.equal(fresh('exam').EXAM_STORAGE_KEY,'lexigo.exam.v1.primary.g3');
    window.location.search='?stage=primary&grade=4';assert.equal(fresh('practice').readDraft(),null);
    window.location.search='?stage=primary&grade=3';assert.equal(fresh('practice').readDraft().answers['1'],'grade3');
    window.location.search='';assert.equal(fresh('practice').readDraft().answers['1'],'high');
  });
  check('primary runner filters current-grade words and favorites before creating any questions',()=>{
    const words=[fixture('p3-apple','apple','苹果',3),fixture('p3-school','school','学校',3),fixture('p4-rabbit','rabbit','兔子',4)];
    const pool=view.checkPrimaryPool(words,3);assert.equal(pool.length,2);
    assert.deepEqual(view.checkPrimaryPool(words,3,['p3-apple','p4-rabbit']).map(word=>word.id),['p3-apple']);
    assert.deepEqual(view.checkPrimaryPool(words,3,[]),[]);
    const questions=runner.buildGameQuestions(pool,[],{kind:'word',length:10,seed:'primary-test'});
    assert.equal(questions.length,2);assert.ok(questions.every(question=>question.kind==='word'&&question.word.grade===3));
    assert.ok(questions.every(question=>question.options.every(word=>pool.some(item=>item.word===word))));
  });
  check('runner restore rejects other grades and high-school sentence questions in primary slots',()=>{
    const words=[fixture('p3-apple','apple','苹果',3),fixture('p3-school','school','学校',3)];
    const questions=runner.buildGameQuestions(words,[],{kind:'word',length:10,seed:'scope'});
    const run={id:'scope-run',primaryGrade:3,questions,state:runner.createGameState(questions.length),answers:[],index:0,feedback:null,phase:'play',remaining:12,timed:false,paused:false,scope:'test'};
    storage.setItem(stage.scopedStorageKey('lexigo.game-run.v1',3),JSON.stringify(run));assert.ok(view.checkRestore(3));assert.equal(view.checkRestore(4),null);
    storage.setItem(stage.scopedStorageKey('lexigo.game-run.v1',4),JSON.stringify(run));assert.equal(view.checkRestore(4),null);
    storage.setItem('lexigo.game-run.v1',JSON.stringify(run));assert.equal(view.checkRestore(),null);
    storage.setItem(stage.scopedStorageKey('lexigo.game-run.v1',3),JSON.stringify({...run,questions:questions.map(q=>({...q,kind:'sentence'}))}));assert.equal(view.checkRestore(3),null);
  });
  check('fish saves and score history reject high-school data in primary storage',()=>{
    const run=engine.createFishRun({duration:60},'high-scope');const save={version:1,run,phase:'play',handledEvent:0,updatedAt:new Date().toISOString()};
    assert.equal(fish.writeFishSave(save),true);assert.equal(fish.writeFishSave(save,3),false);assert.equal(fish.readFishSave(3),null);assert.ok(fish.readFishSave());
    storage.setItem(stage.scopedStorageKey(fish.FISH_SAVE,3),JSON.stringify(save));assert.equal(fish.readFishSave(3),null);
    const result=engine.fishResult(run,new Date().toISOString());assert.equal(fish.addFishResult(result,[],3).saved,false);assert.equal(fish.addFishResult(result).saved,true);assert.equal(fish.readFishHistory(3).length,0);assert.equal(fish.readFishHistory().length,1);
  });
  const primaryRaw=JSON.parse(readFileSync('data/primary-words.json','utf8'));
  const primaryWords=Array.isArray(primaryRaw)?primaryRaw:primaryRaw.words||primaryRaw.items||[];
  const available=[3,4,5,6].filter(grade=>primaryWords.some(word=>word.grade===grade));
  for(const grade of available)check(`real grade ${grade} fish and runner use only that grade and reject other scopes`,()=>{
    const run=engine.createFishRun({duration:60,primaryGrade:grade},`primary-${grade}`),ids=new Set(primaryWords.filter(word=>word.grade===grade).map(word=>word.id));
    assert.equal(run.stage,'primary');assert.equal(run.primaryGrade,grade);assert.ok(ids.has(run.target.id));assert.ok(run.fish.every(fish=>ids.has(fish.word.id)));
    const save={version:1,run,phase:'play',handledEvent:0,updatedAt:new Date().toISOString()};assert.equal(fish.writeFishSave(save,grade),true);assert.ok(fish.readFishSave(grade));assert.equal(fish.writeFishSave(save,grade===3?4:3),false);
    const result=engine.fishResult(run,new Date().toISOString());assert.equal(fish.addFishResult(result,[],grade).saved,true);assert.equal(fish.readFishHistory(grade).length,1);assert.equal(fish.readFishHistory().length,0);assert.equal(fish.fishHistoryCsv([result],grade).split('\n').length,2);
    const words=view.checkPrimaryPool(primaryWords,grade),questions=runner.buildGameQuestions(words,[],{kind:'word',length:10,seed:'real-primary'});assert.ok(questions.length>0);assert.ok(questions.every(question=>question.word.grade===grade));
  });
  const report={suite:'learning-stage',passed:checks.filter(check=>check.passed).length,total:checks.length,validatedPrimaryGrades:available,pendingPrimaryGrades:[3,4,5,6].filter(grade=>!available.includes(grade)),checks};
  writeFileSync('work/checks/stage/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(checks.some(check=>!check.passed))process.exitCode=1;
} finally {if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;}
