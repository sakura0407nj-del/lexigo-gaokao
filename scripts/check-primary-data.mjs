import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const wordText=readFileSync('data/primary-words.json','utf8'),paperText=readFileSync('data/primary-papers.json','utf8');
const words=JSON.parse(wordText),papers=JSON.parse(paperText),checks=[];
const grades=[3,4,5,6],pos=['noun','verb','adjective','adverb'];
const topics=['家庭人物','学校学习','家居生活','食物饮品','动物世界','自然天气','身体健康','衣物用品','时间日常','活动爱好','地点出行','情绪特征'];
const wordCount=text=>(text.replace(/\([1-5]\)\s*_+/g,' ').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;
function test(name,run){try{run();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:error.message});}}

test('four selectable grades each contain sixty distinct curated words',()=>{
  assert.equal(words.length,240);assert.equal(new Set(words.map(word=>word.id)).size,240);assert.equal(new Set(words.map(word=>word.word.toLowerCase())).size,240);
  for(const grade of grades){const set=words.filter(word=>word.grade===grade);assert.equal(set.length,60,`grade ${grade}`);assert.deepEqual([...new Set(set.map(word=>word.topic))].sort(),[...topics].sort());}
  for(const word of words){assert.ok(grades.includes(word.grade));assert.equal(word.id,`p${word.grade}-${word.word}`);assert.ok(/^[a-z]+$/.test(word.word));}
});
test('examples demonstrate the classified word, include Chinese support and cover every fish category',()=>{
  for(const word of words){
    assert.ok(Array.isArray(word.pos)&&word.pos.length===1&&pos.includes(word.pos[0]),word.id);
    for(const key of ['translation','example','exampleZh'])assert.ok(typeof word[key]==='string'&&word[key].trim().length>0,`${word.id}: ${key}`);
    assert.ok(new RegExp(`\\b${word.word}\\b`,'i').test(word.example),word.id);assert.ok(word.example.length<=110,word.id);
    assert.ok(/[\u3400-\u9fff]/.test(word.translation)&&/[\u3400-\u9fff]/.test(word.exampleZh),word.id);
    assert.equal(word.frequency,undefined);assert.equal(word.rank,undefined);assert.equal(word.book,undefined);assert.equal(word.unit,undefined);
  }
  for(const grade of grades)for(const part of pos)assert.ok(words.filter(word=>word.grade===grade&&word.pos[0]===part).length>=4,`${grade}: ${part}`);
});
test('each grade has two original reading papers and two original grammar papers',()=>{
  assert.equal(papers.length,16);assert.equal(new Set(papers.map(paper=>paper.id)).size,16);
  for(const grade of grades)for(const type of ['reading','grammar'])assert.equal(papers.filter(paper=>paper.grade===grade&&paper.type===type).length,2);
  for(const paper of papers){
    assert.ok(grades.includes(paper.grade));assert.ok(paper.id.startsWith(`primary-g${paper.grade}-`));assert.equal(paper.origin,'original');assert.ok(paper.source.includes('Gemini')&&paper.source.includes('非真题'));
    assert.ok(['基础','标准','挑战'].includes(paper.level));assert.ok(typeof paper.topic==='string'&&/[\u3400-\u9fff]/.test(paper.topic)&&paper.topic.length<=80);assert.ok(Number.isInteger(paper.minutes)&&paper.minutes>=1&&paper.minutes<=30);
    for(const key of ['title','passage','instructions'])assert.ok(typeof paper[key]==='string'&&paper[key].trim(),`${paper.id}: ${key}`);
    assert.equal(paper.options,undefined,'Individual MCQs must not silently use shared options.');
  }
});
test('passage lengths increase with the selected grade and grammar blanks are complete',()=>{
  const bounds={3:[40,65],4:[60,85],5:[80,110],6:[100,140]};
  for(const paper of papers){
    const count=wordCount(paper.passage),[min,max]=bounds[paper.grade];assert.ok(count>=min&&count<=max,`${paper.id}: ${count} words; expected ${min}–${max}`);
    if(paper.type==='grammar')assert.deepEqual([...paper.passage.matchAll(/\(([1-5])\)\s*____/g)].map(match=>Number(match[1])),[1,2,3,4,5],paper.id);
    else assert.ok(!paper.passage.includes('____'),paper.id);
  }
});
test('all seventy-two questions have four distinct choices and a valid answer',()=>{
  assert.equal(papers.reduce((sum,paper)=>sum+paper.questions.length,0),72);
  for(const paper of papers){
    assert.equal(paper.questions.length,paper.type==='reading'?4:5,paper.id);assert.equal(new Set(paper.questions.map(question=>question.id)).size,paper.questions.length);
    for(const question of paper.questions){
      const label=`${paper.id}/${question.id}`;assert.ok(typeof question.id==='string'&&question.id);assert.ok(question.prompt?.trim(),label);assert.equal(question.points,2,label);
      assert.equal(question.options?.length,4,label);assert.deepEqual(question.options.map(option=>option.slice(0,3)),['A. ','B. ','C. ','D. '],label);
      const values=question.options.map(option=>option.slice(3).trim().toLowerCase());assert.ok(values.every(Boolean),label);assert.equal(new Set(values).size,4,label);assert.ok(/^[A-D]$/.test(question.answer),label);
    }
  }
});
test('every answer has a Chinese explanation, a skill and exact passage evidence',()=>{
  for(const paper of papers)for(const question of paper.questions){
    const label=`${paper.id}/${question.id}`;
    assert.ok(/[\u3400-\u9fff]/.test(question.explanation||''),`${label}: explanation`);assert.ok(question.knowledge?.trim(),`${label}: knowledge`);
    assert.ok(question.evidence?.length>=5&&paper.passage.includes(question.evidence),`${label}: evidence is not an exact passage quote`);
  }
});
test('answer positions vary within each grade rather than teaching a fixed option',()=>{
  for(const grade of grades){const counts=Object.fromEntries(['A','B','C','D'].map(key=>[key,0]));for(const paper of papers.filter(paper=>paper.grade===grade))for(const question of paper.questions)counts[question.answer]++;for(const count of Object.values(counts))assert.ok(count>=2&&count<=8,`grade ${grade}: ${JSON.stringify(counts)}`);}
});
test('UTF-8 content contains neither replacement characters nor empty placeholders',()=>{
  assert.ok(!wordText.includes('\ufffd')&&!paperText.includes('\ufffd'));
  assert.ok(!/\b(?:TODO|PLACEHOLDER|lorem ipsum)\b/i.test(wordText+paperText));
});
console.log(JSON.stringify({passed:checks.filter(check=>check.passed).length,failed:checks.filter(check=>!check.passed).length,words:words.length,papers:papers.length,checks},null,2));
if(checks.some(check=>!check.passed))process.exitCode=1;
