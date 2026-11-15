import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

mkdirSync('work/checks/fish-ui', {recursive: true});
await Promise.all([
  build({entryPoints: ['components/learn/fish-storage.ts', 'lib/fish-engine.ts'], bundle: true, platform: 'node', format: 'cjs', outdir: 'work/checks/fish-ui', outbase: '.', outExtension: {'.js': '.cjs'}}),
  build({stdin: {contents: readFileSync('components/learn/fish-view.tsx', 'utf8') + '\nexport {formatTime as checkTime, fishEventMistakes as checkMistakes};', loader: 'tsx', sourcefile: 'fish-view.tsx', resolveDir: path.resolve('components/learn')}, bundle: true, platform: 'node', format: 'cjs', loader: {'.css': 'empty'}, outfile: 'work/checks/fish-ui/view.cjs'}),
]);
const require = createRequire(import.meta.url);
const storage = require('../work/checks/fish-ui/components/learn/fish-storage.cjs');
const engine = require('../work/checks/fish-ui/lib/fish-engine.cjs');
const view = require('../work/checks/fish-ui/view.cjs');
const memory = new Map(), checks = [], now = Date.now();
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const mock = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key)};
Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: mock});
const clone = value => JSON.parse(JSON.stringify(value));
function parked(state) {const run = clone(state); run.fish.forEach((fish, index) => {fish.x = 50 + index % 4 * 65; fish.y = 50 + Math.floor(index / 4) * 50; fish.vx = 0; fish.vy = 0; fish.facing = 1;}); return run;}
function collide(state, matching) {const run = parked(state), selected = run.fish.find(fish => (fish.word.pos === run.target.pos) === matching); selected.x = run.player.x; selected.y = run.player.y; return engine.advanceFishRun(run, 1 / 60);}
function check(name, test) {memory.clear(); try {test(); checks.push({name, passed: true});} catch (error) {checks.push({name, passed: false, error: error.message});}}
let run = engine.advanceFishRun(parked(engine.createFishRun({duration: 60}, 'fish-ui-test')), 1.1);
run = collide(collide(run, true), false);
assert.equal(run.correct, 1); assert.equal(run.wrong, 1); assert.ok(engine.parseFishRun(run));
const base = {version: 1, run, phase: 'play', handledEvent: 0, updatedAt: new Date(now).toISOString()};
const ended = engine.advanceFishRun(parked(run), 60);
const complete = engine.fishResult(ended, new Date(now).toISOString());

try {
  check('countdown ceilings whole seconds without ever showing 00:60', () => {
    for (const [seconds, expected] of [[0, '00:00'], [-1, '00:00'], [NaN, '00:00'], [Infinity, '00:00'], [.1, '00:01'], [59, '00:59'], [59.001, '01:00'], [60, '01:00'], [119.99, '02:00'], [180, '03:00']]) assert.equal(view.checkTime(seconds), expected);
  });
  check('live run and active seconds survive storage unchanged', () => {
    assert.equal(storage.writeFishSave(base), true);
    const restored = storage.readFishSave();
    assert.equal(restored.phase, 'play'); assert.equal(restored.run.elapsed, run.elapsed); assert.equal(restored.run.score, 5);
    assert.deepEqual(restored.run.player, run.player); assert.equal(restored.handledEvent, 0);
  });
  check('unprocessed wrong events survive reload and acknowledged events do not replay', () => {
    storage.writeFishSave(base); const restored = storage.readFishSave();
    const fresh = storage.unhandledFishEvents(restored.run, restored.handledEvent);
    assert.equal(fresh.length, 2);
    const mistakes = view.checkMistakes(fresh);
    assert.equal(mistakes.length, 1); assert.equal(mistakes[0].kind, 'game');
    assert.notEqual(mistakes[0].correctAnswer, mistakes[0].yourAnswer);
    assert.equal(mistakes[0].id, `fish-pos:${run.events.find(event => event.type === 'wrong').word.id}`);
    assert.equal(mistakes[0].options.length, 4);
    storage.writeFishSave({...restored, handledEvent: run.eventSerial});
    const acknowledged = storage.readFishSave(); assert.deepEqual(storage.unhandledFishEvents(acknowledged.run, acknowledged.handledEvent), []);
    assert.deepEqual(view.checkMistakes(run.events.filter(event => event.type !== 'wrong')), []);
  });
  check('ending creates authoritative result and restores pending mistakes even in result phase', () => {
    const parsed = storage.parseFishSave({...base, run: ended, phase: 'play'}, now);
    assert.equal(parsed.phase, 'result'); assert.equal(parsed.result.completed, true);
    assert.equal(parsed.result.score, ended.score); assert.equal(parsed.result.accuracy, .5);
    assert.equal(view.checkMistakes(storage.unhandledFishEvents(parsed.run, parsed.handledEvent)).length, 1);
    const tampered = storage.parseFishSave({...base, run: ended, phase: 'result', result: {...complete, score: 99999, accuracy: 1}}, now);
    assert.equal(tampered.result.score, ended.score); assert.equal(tampered.result.accuracy, .5);
    const early = storage.parseFishSave({...base, phase: 'result'}, now);
    assert.equal(early.result.completed, false); assert.equal(early.result.elapsed, run.elapsed);
  });
  check('bad checkpoints, invalid dates, expired saves and malformed storage fail safely', () => {
    for (const invalid of [{...base, handledEvent: -1}, {...base, handledEvent: run.eventSerial + 1}, {...base, updatedAt: 'invalid'}, {...base, updatedAt: new Date(now + 86400000).toISOString()}, {...base, updatedAt: new Date(now - 8 * 86400000).toISOString()}]) assert.equal(storage.parseFishSave(invalid, now), null);
    memory.set(storage.FISH_SAVE, '{broken'); assert.equal(storage.readFishSave(), null);
    memory.set(storage.FISH_HISTORY, '{broken'); assert.deepEqual(storage.readFishHistory(), []);
  });
  check('history deduplicates repeated completion and keeps durations and unfinished runs distinct', () => {
    const once = storage.addFishResult(complete); const twice = storage.addFishResult(complete, once.history);
    assert.equal(twice.history.length, 1);
    const early = engine.fishResult(run, new Date(now - 2000).toISOString());
    const longer = engine.fishResult(engine.advanceFishRun(parked(engine.createFishRun({duration: 120}, 'longer-ui')), 120), new Date(now - 1000).toISOString());
    const history = storage.addFishResult(longer, storage.addFishResult(early, twice.history).history).history;
    assert.equal(history.length, 3);
    const eligible = history.filter(item => item.completed && item.duration === 60);
    assert.equal(eligible.length, 1); assert.equal(Math.max(...eligible.map(item => item.score)), complete.score);
    assert.equal(storage.parseFishHistory([{...complete, accuracy: 99}, {...complete, completedAt: new Date(now + 86400000).toISOString()}], now).length, 0);
  });
  check('recent history is bounded, newest-first and not displaced by duplicate stale copies', () => {
    const many = Array.from({length: 130}, (_, index) => engine.fishResult(ended, new Date(now - index * 1000).toISOString()));
    const history = storage.parseFishHistory([...many, {...many[0], completedAt: new Date(now - 200000).toISOString()}], now);
    assert.equal(history.length, 100); assert.equal(history[0].id, many[0].id); assert.equal(history[0].completedAt, many[0].completedAt); assert.equal(history.at(-1).id, many[99].id);
    const merged = storage.addFishResult(many[0], [...many.slice(1, 101)]);
    assert.equal(merged.history.length, 100); assert.equal(merged.history[0].id, many[0].id);
  });
  check('storage quota failure preserves prior in-memory results across another game', () => {
    const normal = mock.setItem; mock.setItem = () => {throw new Error('quota');};
    try {
      assert.equal(storage.writeFishSave(base), false);
      const first = storage.addFishResult(complete); assert.equal(first.saved, false); assert.equal(first.history.length, 1);
      const secondResult = engine.fishResult(ended, new Date(now - 1000).toISOString());
      const second = storage.addFishResult(secondResult, first.history); assert.equal(second.saved, false); assert.equal(second.history.length, 2);
      mock.setItem = normal;
      const retried = storage.addFishResult(secondResult, second.history); assert.equal(retried.saved, true); assert.equal(storage.readFishHistory().length, 2);
    } finally {mock.setItem = normal;}
  });
  check('CSV normalizes dates, quotes cells and contains only validated results', () => {
    const nonCanonical = {...complete, completedAt: new Date(complete.completedAt).toUTCString() + '\n'};
    const csv = storage.fishHistoryCsv([nonCanonical, {...complete, id: 'invalid', score: 99}]);
    assert.ok(csv.startsWith('\uFEFF日期,')); assert.equal(csv.split('\n').length, 2);
    assert.ok(csv.includes(`"${new Date(Date.parse(nonCanonical.completedAt)).toISOString()}"`)); assert.ok(csv.includes('"完成"'));
  });
  const report = {suite: 'fish-ui', passed: checks.filter(check => check.passed).length, total: checks.length, checks};
  writeFileSync('work/checks/fish-ui/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (checks.some(check => !check.passed)) process.exitCode = 1;
} finally {
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
