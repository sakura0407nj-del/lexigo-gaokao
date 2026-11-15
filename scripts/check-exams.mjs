import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

mkdirSync('work/checks', {recursive: true});
const require = createRequire(import.meta.url);
await Promise.all(['exam-server', 'exam-analysis', 'learning-server', 'public-session', 'public-router'].map(async name => {
  await build({entryPoints: [`lib/${name}.ts`], bundle: true, platform: 'node', format: 'cjs', outfile: `work/checks/${name}.cjs`});
}));
const {assembleExam, gradeExam, examConfigSchema} = require('../work/checks/exam-server.cjs');
const {sealPaper} = require('../work/checks/learning-server.cjs');
const {issuePublicSession} = require('../work/checks/public-session.cjs');
const {handlePublicRequest} = require('../work/checks/public-router.cjs');

const previousSecret = process.env.PAPER_SECRET;
process.env.PAPER_SECRET = 'exam-test-only-dummy-secret-no-real-credential-123456';
const config = {source: 'bank', level: '标准', topic: '', minutes: 20,
  counts: {reading: 1, grammar: 1, seven: 0, cloze: 0}};
const paper = (id, type, questions, extra = {}) => ({id, type, level: '标准', title: `${id} 测试练习`,
  topic: 'School learning', passage: 'A fictional passage used only for the deterministic backend test.',
  instructions: '测试用', minutes: 5, source: 'test fixture', origin: 'original', questions, ...extra});
const q = (id, answer, points, knowledge) => ({id, prompt: `Question ${id}`, answer, points, knowledge, explanation: '根据测试原句及对应语法规则核对。'});
const reading = paper('test-reading', 'reading', [q('1', 'A', 2.5, '细节理解'), q('2', 'B', 2.5, '细节理解'), q('3', 'D', 2.5, '推理判断')]);
const grammar = paper('test-grammar', 'grammar', [q('1', 'color|colour', 1.5, '词形变化'), q('2', 'went', 1.5, '动词时态'), q('3', 'the', 1.5, '冠词')]);
const input = {examId: 'exam-test', sections: [{paperId: reading.id}, {paperId: grammar.id}],
  answers: {[reading.id]: {'1': 'A', '2': 'C', '3': '  '}, [grammar.id]: {'1': ' Colour ', '2': 'go'}},
  elapsedSeconds: 360, minutes: 5};
const user = 'guest_exam-test-owner';

try {
  // Reject invalid layouts before consulting the bank or the provider.
  for (const invalid of [
    {...config, counts: {reading: 0, grammar: 0, seven: 0, cloze: 0}},
    {...config, counts: {...config.counts, reading: 5}},
    {...config, counts: {...config.counts, grammar: 3}},
    {...config, counts: {reading: 4, grammar: 2, seven: 2, cloze: 1}},
    {...config, counts: {...config.counts, reading: 1.5}},
    {...config, counts: {...config.counts, writing: 1}},
    {...config, minutes: 4}, {...config, minutes: 181}, {...config, topic: 'x'.repeat(151)},
  ]) assert.equal(examConfigSchema.safeParse(invalid).success, false);
  assert.throws(() => assembleExam({config: {...config, source: 'ai'}}), /逐段命题/);

  const generated = assembleExam({config}, [reading, grammar]);
  assert.equal(generated.sections.length, 2);
  assert.equal(new Set(generated.sections.map(section => section.id)).size, 2);
  for (const section of generated.sections) for (const question of section.questions) {
    for (const key of ['answer', 'explanation', 'knowledge', 'evidence']) assert.equal(key in question, false);
  }
  assert.ok(reading.questions[0].answer, 'Concealing assembled papers must not mutate bank keys');
  const fallback = assembleExam({config: {...config, level: '挑战', topic: 'unavailable-super-topic', targeted: true}, weaknesses: ['虚拟语气']}, [reading, grammar]);
  assert.ok(fallback.notes.some(note => note.includes('未匹配“挑战”')));
  assert.ok(fallback.notes.some(note => note.includes('未匹配主题')));
  assert.ok(fallback.notes.some(note => note.includes('没有匹配所选错题知识点')));
  assert.ok(fallback.notes.some(note => note.includes('未覆盖这些目标知识点')));
  const originalPreferred = assembleExam({config: {...config, counts: {...config.counts, grammar: 0}}}, [reading, {...reading, id: 'past-reading-test', origin: 'past'}]);
  assert.equal(originalPreferred.sections[0].origin, 'original');
  const targeted = assembleExam({config: {...config, counts: {...config.counts, grammar: 0}, targeted: true}, weaknesses: ['推理判断']},
    [{...reading, id: 'non-target-reading', questions: [q('1', 'A', 2.5, '细节理解')]}, reading]);
  assert.equal(targeted.sections[0].id, reading.id);
  assert.throws(() => assembleExam({config: {...config, counts: {...config.counts, reading: 2}}}, [reading, reading, grammar]), /不足/);

  // Mixed point weights, accepted spelling variants, unanswered questions, actual knowledge labels.
  const report = await gradeExam(input, user, [reading, grammar]);
  assert.equal(report.score, 4);
  assert.equal(report.maxScore, 12);
  assert.equal(report.totalQuestions, 6);
  assert.equal(report.correctCount, 2);
  assert.equal(report.unansweredCount, 2);
  assert.equal(report.accuracy, 33.33);
  assert.equal(report.sections[0].grade.score, 2.5);
  assert.equal(report.sections[1].grade.score, 1.5);
  assert.equal(report.sections[1].grade.items[0].correct, true);
  assert.equal(report.perType.find(row => row.type === 'reading').maxScore, 7.5);
  assert.equal(report.knowledge.find(row => row.name === '细节理解').lostPoints, 2.5);
  assert.equal(report.knowledge.find(row => row.name === '推理判断').unansweredCount, 1);
  assert.equal(report.pacing.overtimeSeconds, 60);
  assert.equal(report.pacing.secondsPerAnsweredQuestion, 90);
  assert.equal(report.pacing.completedWithinTime, false);
  assert.equal(report.directions.length, 3);
  assert.ok(report.directions[0].title.includes('未作答'));
  assert.ok(report.directions[1].title.includes('细节理解'));
  assert.ok(report.directions[2].title.includes('动词时态'));
  assert.deepEqual(report.plan.map(day => day.day), [1, 2, 3, 4, 5, 6, 7]);
  const empty = await gradeExam({...input, answers: {}, elapsedSeconds: 0}, user, [reading, grammar]);
  assert.equal(empty.score, 0);
  assert.equal(empty.unansweredCount, 6);
  assert.equal(empty.pacing.secondsPerAnsweredQuestion, null);
  assert.equal(empty.pacing.completedWithinTime, false);
  const full = await gradeExam({...input, elapsedSeconds: 300, answers: Object.fromEntries([reading, grammar].map(section => [section.id,
    Object.fromEntries(section.questions.map(question => [question.id, question.answer.split('|')[0]]))]))}, user, [reading, grammar]);
  assert.equal(full.score, full.maxScore);
  assert.equal(full.accuracy, 100);
  assert.equal(full.pacing.completedWithinTime, true);
  assert.equal(full.directions.length, 3);
  assert.ok(full.directions.every(direction => !direction.title.includes('优先复习')));

  await assert.rejects(() => gradeExam({...input, sections: [{paperId: reading.id}, {paperId: reading.id}]}, user, [reading, grammar]), /重复计分/);
  await assert.rejects(() => gradeExam({...input, answers: {...input.answers, unrelated: {1: 'A'}}}, user, [reading, grammar]), /不属于/);
  await assert.rejects(() => gradeExam({...input, answers: {[reading.id]: {unknown: 'A'}}}, user, [reading, grammar]), /不存在/);
  await assert.rejects(() => gradeExam({...input, score: 999}, user, [reading, grammar]));
  const tooManyGrammar = [0, 1, 2].map(index => ({...grammar, id: `grammar-fixture-${index}`}));
  await assert.rejects(() => gradeExam({...input, sections: tooManyGrammar.map(section => ({paperId: section.id})), answers: {}}, user, tooManyGrammar), /段数超过/);

  // Never accept client-authored answer keys. Seals retain owner and seven-day expiry checks.
  const aiPaper = {...reading, id: 'ai-sealed-exam-test', origin: 'ai'};
  const sealed = await sealPaper(aiPaper, user);
  const sealedInput = {...input, sections: [{paperId: aiPaper.id, sealed}], answers: {[aiPaper.id]: {'1': 'A'}}};
  const sealedResult = await gradeExam(sealedInput, user, []);
  assert.equal(sealedResult.score, 2.5);
  await assert.rejects(() => gradeExam(sealedInput, 'guest_other-browser', []), /过期|另一台/);
  const parts = sealed.split('.');
  const flipped = parts[1][0] === 'A' ? 'B' : 'A';
  const tampered = `${parts[0]}.${flipped}${parts[1].slice(1)}`;
  await assert.rejects(() => gradeExam({...sealedInput, sections: [{paperId: aiPaper.id, sealed: tampered}]}, user, []), /过期|另一台/);
  await assert.rejects(() => gradeExam({...sealedInput, sections: [{paperId: 'different-id', sealed}], answers: {}}, user, []), /找不到/);
  await assert.rejects(() => gradeExam({...sealedInput, sections: [{paperId: aiPaper.id}]}, user, []), /找不到/);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(process.env.PAPER_SECRET)), {name: 'AES-GCM'}, false, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, key, encoder.encode(JSON.stringify({paper: aiPaper, user, expires: Date.now() - 1000})));
  const expired = `${Buffer.from(nonce).toString('base64url')}.${Buffer.from(encrypted).toString('base64url')}`;
  await assert.rejects(() => gradeExam({...sealedInput, sections: [{paperId: aiPaper.id, sealed: expired}]}, user, []), /过期/);

  // Exercise the same-origin public router, including async failure handling.
  const origin = 'https://exam-test.invalid';
  const session = issuePublicSession(new Request(`${origin}/api/session`));
  const request = (path, body, headers = {}) => new Request(`${origin}${path}`, {method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: origin, Cookie: session.cookie.split(';')[0], ...headers}, body: JSON.stringify(body)});
  const response = await handlePublicRequest(request('/api/exams/assemble', {config}));
  assert.equal(response.status, 200);
  const assembled = await response.json();
  assert.equal(assembled.sections.length, 2);
  assert.ok(assembled.sections.every(section => section.questions.every(question => !('answer' in question))));
  const invalid = await handlePublicRequest(request('/api/exams/assemble', {config: {...config, minutes: 0}}));
  assert.equal(invalid.status, 400);
  const routedGrade = await handlePublicRequest(request('/api/exams/grade', {examId: assembled.id,
    sections: assembled.sections.map(section => ({paperId: section.id})), answers: {}, elapsedSeconds: 40, minutes: 20}));
  assert.equal(routedGrade.status, 200);
  const routedReport = await routedGrade.json();
  assert.equal(routedReport.score, 0);
  assert.equal(routedReport.unansweredCount, routedReport.totalQuestions);
  assert.equal((await handlePublicRequest(request('/api/exams/grade', sealedInput))).status, 400, 'Another owner must not open AI seals via public router');
  assert.equal((await handlePublicRequest(request('/api/exams/assemble', {config}, {Cookie: ''}))).status, 401);
  assert.equal((await handlePublicRequest(request('/api/exams/assemble', {config}, {Origin: 'https://unrelated.invalid'}))).status, 403);

  console.log(JSON.stringify({passed: ['strict section/time bounds', 'concealed unique bank sections', 'honest level/topic/target fallback',
    'weighted authoritative grading', 'unanswered and pacing', 'actual-error priorities and seven-day plan',
    'seal tampering/owner/expiry', 'duplicate and unknown answers', 'authenticated same-origin routes'], realAIRequests: 0}));
} finally {
  if (previousSecret === undefined) delete process.env.PAPER_SECRET;
  else process.env.PAPER_SECRET = previousSecret;
}
