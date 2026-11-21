import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

mkdirSync('work/checks',{recursive:true});
await build({
  stdin:{
    contents:"export * from './components/primary/study-activities'; export * from './components/primary/study-stories'; export * from './components/primary/spelling-aid'; export * from './components/primary/spelling-diff'; export {primaryGradeCatalog} from './lib/primary-catalog';",
    resolveDir:process.cwd()
  },
  bundle:true,platform:'node',format:'cjs',outfile:'work/checks/primary-studio.cjs'
});
const {buildSkillQuestions,buildMatch,dailyRandom,stories,storyGlossary,primaryGradeCatalog,meaningLabel,spellingDiff,spellingGroups}=
  createRequire(import.meta.url)('../work/checks/primary-studio.cjs');

for(const grade of [3,4,5,6]){
  const {items,books}=primaryGradeCatalog(grade);
  const plan=date=>buildSkillQuestions('daily',items,items,dailyRandom(grade+date));
  const first=plan('2026-11-21');
  assert.deepEqual(first,plan('2026-11-21'));
  assert.notDeepEqual(first.map(q=>q.id),plan('2026-11-22').map(q=>q.id));
  for(let day=1;day<=28;day++){
    const questions=plan('2026-11-'+day);
    assert.equal(questions.length,5);
    assert.equal(new Set(questions.map(q=>q.word.id)).size,5);
    assert.ok(questions.some(q=>q.kind==='sentence'),'Daily study should train an example sentence');
    for(const q of questions){
      assert.ok(q.options.includes(q.answer));
      assert.equal(new Set(q.options).size,q.options.length);
      if(q.kind==='sentence'){
        assert.equal(q.prompt.split('____').length,2);
        assert.ok(q.context.includes(q.word.exampleZh));
      }
    }
  }

  for(const book of books)for(const unit of book.units){
    const scope=items.filter(word=>unit.wordIds.includes(word.id));
    const board=buildMatch(scope,dailyRandom(book.id+unit.id));
    assert.ok(board.pairs.length>=2,book.id+'/'+unit.id);
    assert.deepEqual(new Set(board.meanings),new Set(board.pairs));
    assert.equal(new Set(board.pairs.map(meaningLabel)).size,board.pairs.length);
    const listening=buildSkillQuestions('listening',scope,items,dailyRandom(unit.id));
    assert.ok(listening.length>=2);
    assert.ok(listening.every(q=>q.kind==='listening'&&scope.includes(q.word)&&q.answer===q.word.word));
  }
  assert.equal(stories[grade].length,2);
  for(const story of stories[grade]){
    assert.ok(story.lines.every(([en,zh])=>en.trim()&&/[\u3400-\u9fff]/.test(zh)));
    assert.equal(story.questions.length,3);
    for(const [term,[id,meaning]] of Object.entries(storyGlossary[story.id])){
      assert.ok(items.some(word=>word.id===id&&word.word.toLowerCase()===term),id);
      assert.ok(story.lines.some(([en])=>en.toLowerCase().split(/\W+/).includes(term)),term);
      assert.ok(/[\u3400-\u9fff]/.test(meaning));
    }
    for(const q of story.questions){
      assert.ok(q.options[q.correct]&&story.lines[q.line],story.id);
      assert.equal(new Set(q.options).size,q.options.length);
    }
  }
}
assert.deepEqual(spellingGroups('computer'),[3,2,3]);
assert.deepEqual(spellingGroups('calculator'),[10]);
assert.deepEqual(spellingDiff('compter','computer').filter(c=>c.kind!=='match'),[{typed:'',expected:'u',kind:'missing'}]);
assert.deepEqual(spellingDiff('recieve','receive').filter(c=>c.kind!=='match').map(c=>c.kind),['swap','swap']);
assert.deepEqual(spellingDiff('appple','apple').filter(c=>c.kind!=='match'),[{typed:'p',expected:'',kind:'extra'}]);
assert.deepEqual(spellingDiff('cit','cat').filter(c=>c.kind!=='match'),[{typed:'i',expected:'a',kind:'replace'}]);
console.log('Primary studio: stable daily questions, 46 unit boards and listening pools, 8 bilingual stories with 24 answered questions.');
