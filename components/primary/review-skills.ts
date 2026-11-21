import type {MistakeEntry} from '../learn/mistakes';

// Only these curriculum labels leave the device. The original question, essay
// and child's response may contain personal details and stay in the notebook.
const readingSkills: [string, RegExp][] = [
  ['归纳主旨', /主旨|大意|概括|标题/],
  ['根据线索推断', /推断|推理|意图/],
  ['理解上下文指代', /指代/],
  ['定位短文细节', /细节|信息|定位|事实/],
];
const languageSkills: [string, RegExp][] = [
  ['主谓一致', /主谓一致|第三人称|have与has/],
  ['一般过去时', /过去时|过去式/],
  ['一般将来时', /将来时/],
  ['现在进行时', /进行时/],
  ['一般现在时', /一般现在时|be动词/],
  ['人称与物主代词', /代词|指代/],
  ['名词单复数', /复数|单复数/],
  ['介词与位置', /介词|方位/],
  ['比较级', /比较级/],
  ['情态动词', /情态动词/],
  ['句子衔接', /连词|并列|衔接/],
  ['辨别词性', /词性|形容词|副词/],
];
export type SkillFocus = {knowledge: string; prompt: string};
const focusPrompt = '用新语境练习这个知识点';
export function getSkillFocus(mistakes: Record<string, MistakeEntry>, type: 'grammar' | 'reading'): SkillFocus[] {
  const scores = new Map<string, {misses: number; lastWrong: string}>();
  for (const entry of Object.values(mistakes)) {
    if (entry.masteredAt) continue;
    const rules = type === 'reading' ? readingSkills : languageSkills;
    const label = rules.find(([, pattern]) => pattern.test(entry.knowledge))?.[0];
    if (!label) continue;
    const prior = scores.get(label);
    scores.set(label, {misses: (prior?.misses ?? 0) + entry.misses, lastWrong: prior && prior.lastWrong > entry.lastWrong ? prior.lastWrong : entry.lastWrong});
  }
  return [...scores].sort(([,a],[,b]) => b.misses - a.misses || b.lastWrong.localeCompare(a.lastWrong))
    .slice(0, 3).map(([knowledge]) => ({knowledge, prompt: focusPrompt}));
}
export function isSavedFocus(value: unknown, type: 'reading' | 'grammar'): value is SkillFocus[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return false;
  const labels = new Set((type === 'reading' ? readingSkills : languageSkills).map(([label]) => label));
  return value.every(item => item && Object.keys(item).length === 2 && labels.has(item.knowledge) && item.prompt === focusPrompt)
    && new Set(value.map(item => item.knowledge)).size === value.length;
}
