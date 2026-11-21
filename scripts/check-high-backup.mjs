import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';

const require = createRequire(import.meta.url), ts = require('typescript'), root = process.cwd();
const checks = [];
async function check(name, run) { try { await run(); checks.push({name, pass: true}); } catch (error) { checks.push({name, pass: false, error: error.stack}); } }
const copy = value => JSON.parse(JSON.stringify(value));
const now = '2026-11-21T10:00:00.000Z';
const word = {id: 'exchange', word: 'exchange', translation: '交换', phonetic: '', frequency: 'high', rank: 0, frequencyKnown: false, frequencyBand: 'unknown', book: 'pep2019-compulsory-1', unit: 'welcome', accepted: ['exchange'], pos: ['noun', 'verb'], topics: ['communication'], inGaokao: true};

// Exercise the actual component handlers and shared store with deterministic React hook slots.
function harness(initial) {
  const cache = new Map(), storage = new Map([['lexigo.progress.v1', JSON.stringify(initial)], ['lexigo.progress.v1.primary.g3', 'primary-preserved']]);
  const writes = [], exports = [];
  let writingFails = false, renderState = null;
  globalThis.window = {location: {search: ''}, localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { if (writingFails) throw new DOMException('quota', 'QuotaExceededError'); writes.push(key); storage.set(key, value); },
  }, addEventListener() {}, removeEventListener() {}};
  const slot = init => { const index = renderState.cursor++; if (!(index in renderState.slots)) renderState.slots[index] = init(); return [renderState.slots, index]; };
  const react = {
    createContext: value => { const context = {value}; context.Provider = {context}; return context; },
    useContext: context => context.value, useCallback: fn => fn, useMemo: fn => fn(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useState: initial => { const [slots, i] = slot(() => typeof initial === 'function' ? initial() : initial); return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const [slots, i] = slot(() => ({current: initial})); return slots[i]; },
    useEffect: (effect, deps) => {
      if (!renderState) return; // Do not run the unrelated provider's alias-fetch effect.
      const [slots, i] = slot(() => null), prior = slots[i];
      if (!prior || !deps || deps.some((value, n) => !Object.is(value, prior.deps[n]))) {
        renderState.effects.push(() => { prior?.cleanup?.(); slots[i] = {deps, cleanup: effect()}; });
      }
    },
  };
  const jsx = (type, props) => { if (type?.context) type.context.value = props.value; return {type, props}; };
  function pathOf(path) { for (const suffix of ['', '.ts', '.tsx']) if (existsSync(path + suffix)) return path + suffix; throw Error(`Missing ${path}`); }
  function load(path) {
    const full = pathOf(resolve(root, path)); if (cache.has(full)) return cache.get(full).exports;
    const module = {exports: {}}; cache.set(full, module);
    const code = ts.transpileModule(readFileSync(full, 'utf8'), {fileName: full, compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText;
    const localRequire = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
      if (name === 'lucide-react') return new Proxy({}, {get: (_target, key) => key === '__esModule' ? true : () => null});
      if (/^(\.\/|\.\.\/learn\/)ui$/.test(name)) return {downloadText: (...args) => exports.push(args), formatDate: value => value, Empty: 'Empty', ErrorNote: 'ErrorNote', Loading: 'Loading', SectionHeader: 'SectionHeader'};
      if (name === './sources-section') return {SourcesSection: 'SourcesSection'};
      if (name.startsWith('.')) return load(resolve(dirname(full), name));
      if (name.startsWith('@/')) return load(resolve(root, name.slice(2)));
      return require(name);
    };
    new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
    return module.exports;
  }
  const progress = load('components/learn/progress.tsx');
  const backup = load('components/learn/high-backup.ts');
  const {RecordsView} = load('components/learn/records-view.tsx');
  const state = {slots: [], cursor: 0, effects: []};
  const api = () => { renderState = null; return progress.ProgressProvider({children: null}).props.value; };
  function render() {
    api(); state.cursor = 0; state.effects = []; renderState = state;
    const tree = RecordsView({bank: null, bankError: '', onReloadBank() {}});
    renderState = null; for (const effect of state.effects) effect(); return tree;
  }
  function unmount() { for (const item of state.slots) item?.cleanup?.(); }
  return {backup, progress, api, render, unmount, storage, writes, exports, failWrites: value => { writingFails = value; }};
}
function walk(tree, predicate) {
  if (Array.isArray(tree)) { for (const item of tree) { const found = walk(item, predicate); if (found) return found; } }
  else if (tree && typeof tree === 'object') { if (predicate(tree)) return tree; return walk(tree.props?.children, predicate); }
  return null;
}
function text(tree) { return Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree && typeof tree === 'object' ? `${tree.props?.message ?? ''}${text(tree.props?.children)}` : ''; }
const button = (tree, label) => { const found = walk(tree, node => node.type === 'button' && text(node) === label); assert.ok(found, `Missing button ${label}`); return found.props.onClick; };
const selected = (tree, file) => walk(tree, node => node.type === 'input' && node.props.type === 'file').props.onChange({target: {files: [file], value: 'selected'}});
const file = (data, name = 'backup.json') => { const value = JSON.stringify(data); return {name, size: Buffer.byteLength(value), text: async () => value}; };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const fresh = () => ({version: 1, learned: [], starred: [], words: {}, wrongbook: {}, dictation: [], practice: [], examAttempts: [], corrections: [], days: [], mistakes: {}, review: {}, log: {}, dailyGoal: 20});
function rich() {
  return {...fresh(), learned: ['exchange'], starred: ['exchange'], words: {exchange: word},
    wrongbook: {exchange: {word, misses: 2, lastAnswer: 'exchage', lastWrong: now}},
    dictation: [{attemptId: 'dictation-one', at: now, band: 'all', total: 2, correct: 1, source: 'textbook', scope: '必修一', book: word.book, units: ['welcome'], planned: 3}],
    practice: [{at: now, paperId: 'original-reading-1', title: '阅读', type: 'reading', origin: 'original', score: 5, maxScore: 10}],
    corrections: [{at: now, kind: 'essay', score: 10, maxScore: 15, summary: '注意冠词'}],
    examAttempts: ['exam-one'], days: ['2026-11-21'],
    mistakes: {'original-reading-1:1': {id: 'original-reading-1:1', kind: 'exercise', type: 'reading', title: '阅读', prompt: 'What is the main idea?', context: 'A primary school is discussed in this high-school passage.', options: ['A. School', 'B. Work'], correctAnswer: 'A', explanation: '依据首段', knowledge: '主旨大意', yourAnswer: 'B', misses: 1, createdAt: now, lastWrong: now}},
    review: {exchange: {step: 0, interval: 1, reviewCount: 1, lapses: 0, known: true, lastReviewed: now, dueAt: '2026-11-22T00:00:00.000Z'}},
    log: {'2026-11-21': {newWords: 1, reviews: 1, again: 0}}, dailyGoal: 40};
}

await check('named high-school backups preserve all valid records and unknown frequency metadata', () => {
  const h = harness(fresh()), original = rich(), envelope = h.backup.createHighBackup(original, new Date(now));
  assert.equal(envelope.kind, 'lexigo-high-progress'); assert.equal(envelope.stage, 'high');
  const result = h.backup.parseHighBackup(copy(envelope)); assert.equal(result.source, 'high');
  assert.deepEqual(result.progress, original); assert.equal(result.progress.words.exchange.frequencyBand, 'unknown');
});
await check('old raw exports retain their contents and receive an explicit legacy label', () => {
  const h = harness(fresh()), legacy = rich(); for (const key of ['mistakes', 'review', 'log', 'dailyGoal', 'examAttempts']) delete legacy[key];
  const preview = h.backup.parseHighBackup(legacy); assert.equal(preview.source, 'legacy');
  assert.deepEqual(preview.progress.dictation, legacy.dictation); assert.deepEqual(preview.progress.words, legacy.words);
  assert.deepEqual(preview.progress.mistakes, {}); assert.equal(h.writes.length, 0);
});
await check('foreign envelopes and arbitrary version objects cannot silently become empty progress', () => {
  const h = harness(rich()); for (const input of [{version: 1}, {kind: 'lexigo-primary-progress', version: 1, grade: 3, progress: fresh()}, {kind: 'unknown', version: 1, progress: fresh()}, {version: 1, progress: fresh()}, {...fresh(), version: 2}]) assert.throws(() => h.backup.parseHighBackup(input));
  assert.equal(h.writes.length, 0); assert.deepEqual(h.api().progress, rich());
});
await check('recognisable primary identifiers and grade metadata are rejected even inside a high envelope', () => {
  const h = harness(fresh());
  const primaryWord = {...word, id: 'p3-mother', grade: 3};
  const samples = [
    {...fresh(), learned: ['p3-mother']}, {...fresh(), learned: ['px-classroom']}, {...fresh(), starred: ['primary-g3-cat']},
    {...fresh(), words: {'p3-mother': primaryWord}}, {...fresh(), review: {'p3-mother': rich().review.exchange}},
    {...rich(), dictation: [{...rich().dictation[0], band: 'primary-grade-3'}]},
    {...rich(), practice: [{...rich().practice[0], paperId: 'ai-primary-g4-generated'}]},
    {...fresh(), words: {exchange: {...word, grade: 5}}},
  ];
  for (const sample of samples) assert.throws(() => h.backup.parseHighBackup(h.backup.createHighBackup(sample)));
  assert.doesNotThrow(() => h.backup.parseHighBackup(rich()), 'ordinary primary-school passage text is not a scope marker');
});
await check('malformed collections, discarded entries, excessive histories and unsafe keys stop the entire import', () => {
  const h = harness(fresh());
  for (const patch of [{learned: null}, {learned: [3]}, {wrongbook: []}, {mistakes: null}, {words: {bad: {id: 'bad'}}}, {review: {bad: {step: 1}}}, {dictation: [{at: now, total: 1, correct: 2}]}, {practice: [{...rich().practice[0], score: 11}]}, {corrections: Array(201).fill(rich().corrections[0])}, {days: ['not-a-date']}, {log: JSON.parse('{"__proto__":{}}')}]) assert.throws(() => h.backup.parseHighBackup({...fresh(), ...patch}));
});
await check('reading and previewing a file do not mutate records; cancel invalidates even an old confirm handler', async () => {
  const h = harness(rich()), before = h.storage.get('lexigo.progress.v1');
  await selected(h.render(), file(fresh())); const preview = h.render();
  assert.match(text(preview), /旧版备份未标注学段/); assert.match(text(preview), /当前记录尚未改变/);
  assert.equal(h.writes.length, 0); assert.equal(h.storage.get('lexigo.progress.v1'), before);
  const staleApply = button(preview, '确认替换高中记录'); button(preview, '取消导入')(); staleApply();
  assert.equal(h.writes.length, 0); assert.deepEqual(h.api().progress, rich());
});
await check('a later selection wins when file reads complete out of order', async () => {
  const h = harness(rich()), first = deferred(), second = deferred();
  const a = selected(h.render(), {name: 'first.json', size: 100, text: () => first.promise});
  const b = selected(h.render(), {name: 'second.json', size: 100, text: () => second.promise});
  second.resolve(JSON.stringify(fresh())); await b;
  first.resolve(JSON.stringify(rich())); await a;
  const preview = h.render(); assert.match(text(preview), /second.json/); assert.doesNotMatch(text(preview), /first.json/); assert.equal(h.writes.length, 0);
});
await check('cancelled or unmounted reads cannot recreate a preview or overwrite records', async () => {
  for (const finish of ['resolve', 'reject', 'unmount']) {
    const h = harness(rich()), task = deferred(); const reading = selected(h.render(), {name: 'late.json', size: 100, text: () => task.promise});
    if (finish === 'unmount') h.unmount(); else button(h.render(), '取消读取')();
    if (finish === 'reject') task.reject(Error('late failure')); else task.resolve(JSON.stringify(fresh()));
    await reading; assert.equal(h.writes.length, 0); assert.deepEqual(h.api().progress, rich());
    if (finish !== 'unmount') { assert.doesNotMatch(text(h.render()), /确认替换高中记录|late failure/); }
  }
});
await check('explicit apply persists once and keeps all primary-grade storage untouched', async () => {
  const h = harness(fresh()); await selected(h.render(), file(h.backup.createHighBackup(rich())));
  const apply = button(h.render(), '确认替换高中记录'); apply(); apply();
  assert.equal(h.writes.length, 1); assert.deepEqual(JSON.parse(h.storage.get('lexigo.progress.v1')), rich());
  assert.equal(h.storage.get('lexigo.progress.v1.primary.g3'), 'primary-preserved'); assert.match(text(h.render()), /已保存并恢复高中学习记录/);
});
await check('storage quota failures preserve disk and memory, keep preview retryable and never report success', async () => {
  const h = harness(rich()), originalDisk = h.storage.get('lexigo.progress.v1'), originalMemory = h.api().progress;
  await selected(h.render(), file(fresh())); h.failWrites(true); button(h.render(), '确认替换高中记录')();
  assert.equal(h.api().progress, originalMemory); assert.equal(h.storage.get('lexigo.progress.v1'), originalDisk); assert.equal(h.api().storageAvailable, false);
  const failed = h.render(); assert.match(text(failed), /保存失败/); assert.doesNotMatch(text(failed), /已保存并恢复/);
  h.failWrites(false); button(failed, '确认替换高中记录')(); assert.deepEqual(h.api().progress, fresh()); assert.equal(h.api().storageAvailable, true);
});
await check('invalid JSON and oversized files leave the current records intact', async () => {
  const h = harness(rich());
  await selected(h.render(), {name: 'bad.json', size: 10, text: async () => '{broken'}); assert.match(text(h.render()), /文件不是有效的 JSON/);
  await selected(h.render(), {name: 'huge.json', size: 21 * 1024 * 1024, text: async () => { throw Error('must not read'); }}); assert.match(text(h.render()), /文件太大/);
  assert.equal(h.writes.length, 0); assert.deepEqual(h.api().progress, rich());
});

console.log(JSON.stringify({suite: 'high-backup', passed: checks.filter(c => c.pass).length, total: checks.length, checks}, null, 2));
if (checks.some(c => !c.pass)) process.exitCode = 1;
