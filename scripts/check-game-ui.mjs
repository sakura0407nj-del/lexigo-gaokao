import {build} from 'esbuild';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

// Exercise the actual UI's restore/replay helpers without mounting browser-only Canvas.
// Test exports exist only in the ignored bundle, never in the shipped frontend module.
mkdirSync('work/checks', {recursive: true});
const require = createRequire(import.meta.url);
await build({stdin: {
  contents: readFileSync('components/learn/game-view.tsx', 'utf8') + '\nexport {restore as checkRestore, replayQuestions as checkReplay};',
  sourcefile: 'game-view.tsx', resolveDir: path.resolve('components/learn'), loader: 'tsx',
}, bundle: true, platform: 'node', format: 'cjs', loader: {'.css': 'empty'}, outfile: 'work/checks/game-ui.cjs'});
const {checkRestore, checkReplay} = require('../work/checks/game-ui.cjs');
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let raw = '';
Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {getItem: () => raw}});

try {
  const q = {id: 'q1', kind: 'sentence', prompt: 'He ____ at school.', options: ['is', 'are'], answerIndex: 0, explanation: '主语为第三人称单数。', knowledge: '主谓一致'};
  const base = {id: 'run-test', questions: [q, {...q, id: 'q2'}], state: {crowd: 999, finished: false}, answers: [{questionId: 'q1', selectedIndex: 0}], index: 0, feedback: {correct: false}, phase: 'play', remaining: 8.3, timed: true, paused: false, scope: 'test', reviewSaved: true};
  raw = JSON.stringify(base);
  const restored = checkRestore();
  assert.equal(restored.state.crowd, 17);
  assert.equal(restored.state.correct, 1);
  assert.equal(restored.feedback.correct, true);
  assert.equal(restored.paused, true);
  assert.equal(restored.remaining, 8.3);
  assert.equal(restored.reviewSaved, true);
  for (const bad of [
    {...base, index: 4}, {...base, phase: 'result'},
    {...base, answers: [{questionId: 'another', selectedIndex: 0}]},
    {...base, questions: [q, q]},
    {...base, questions: [{...q, options: [false, 'are']}, {...q, id: 'q2'}]},
    {...base, feedback: null}, {...base, answers: [{questionId: 'q1', selectedIndex: 9}]},
  ]) {raw = JSON.stringify(bad); assert.equal(checkRestore(), null);}
  raw = '{invalid'; assert.equal(checkRestore(), null);
  raw = JSON.stringify({...base, feedback: null, index: 1}); assert.equal(checkRestore().state.answered, 1);
  const ended = {id: 'ended', questions: [q], state: {crowd: 888}, answers: [{questionId: 'q1', selectedIndex: 0}], index: 0, feedback: {}, phase: 'result', remaining: 5, timed: false, paused: false, scope: 'test'};
  raw = JSON.stringify(ended); assert.equal(checkRestore().state.finished, true); assert.equal(checkRestore().state.crowd, 17);

  for (const count of [1, 2, 3, 5, 10, 15, 20]) {
    const answers = Array.from({length: count}, (_, index) => ({questionId: `q${index}`, question: {...q, id: `q${index}`, options: index % 2 ? ['are', 'is'] : ['is', 'are'], answerIndex: index % 2}, selectedIndex: null, correct: false}));
    const original = JSON.stringify(answers);
    for (let repeat = 0; repeat < 6; repeat++) {
      const replay = checkReplay([...answers, {questionId: 'correct-skip', question: {...q, id: 'correct-skip'}, correct: true}]);
      assert.equal(replay.length, count, 'Only wrong questions belong to replay');
      assert.equal(new Set(replay.map(question => question.id)).size, count);
      assert.ok(Math.abs(replay.filter(question => question.answerIndex === 0).length - replay.filter(question => question.answerIndex === 1).length) <= 1, 'Correct gates must be balanced');
      assert.ok(replay.every(question => question.options[question.answerIndex] === 'is'), 'Reshuffling must retain the correct expression');
    }
    assert.equal(JSON.stringify(answers), original, 'Replay must not mutate stored attempts');
  }
  assert.deepEqual(checkReplay([]), []);
  const report = {passed: true, checks: ['saved score and feedback reconstructed from committed answers',
    'restore pauses the timer while preserving remaining seconds and review-once marker',
    'invalid question IDs, duplicates, choices, indexes, final states and malformed storage rejected',
    'completed runs restore consistently', 'wrong-only replays keep correct semantics, preserve attempts and balance left/right gates']};
  writeFileSync('work/checks/game-ui-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
