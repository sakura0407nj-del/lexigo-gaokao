import type { Correction, ExerciseType, Grade, Paper } from "@/lib/learning-types";

export type MistakeKind = "exercise" | "essay" | "questions";

export interface MistakeEntry {
  id: string;
  kind: MistakeKind;
  type?: ExerciseType;
  title: string;
  prompt: string;
  context: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  knowledge: string;
  yourAnswer: string;
  misses: number;
  createdAt: string;
  lastWrong: string;
  masteredAt?: string;
}

export type MistakeDraft = Omit<MistakeEntry, "misses" | "createdAt" | "lastWrong" | "masteredAt">;

export interface Weakness {
  knowledge: string;
  prompt: string;
  yourAnswer?: string;
  correctAnswer?: string;
}

const CONTEXT_LIMIT = 6000;
const KINDS: MistakeKind[] = ["exercise", "essay", "questions"];
const TYPES: ExerciseType[] = ["reading", "grammar", "seven", "cloze"];

export const KIND_LABEL: Record<MistakeKind, string> = {
  exercise: "练习错题",
  essay: "作文句子修改",
  questions: "题目批改订正",
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";

function clip(text: string, max: number) {
  const clean = text.replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g, "[图片]").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function hash(text: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(36);
}

export function parseMistake(key: string, raw: unknown): MistakeEntry | null {
  if (!isRecord(raw)) return null;
  const { id, kind, type, title, prompt, context, options, correctAnswer, explanation, knowledge, yourAnswer, misses, createdAt, lastWrong, masteredAt } = raw;
  if (id !== key || !isString(id) || !KINDS.includes(kind as MistakeKind) || !isString(prompt) || !isString(correctAnswer)) return null;
  const created = isString(createdAt) ? createdAt : new Date(0).toISOString();
  return {
    id,
    kind: kind as MistakeKind,
    ...(TYPES.includes(type as ExerciseType) ? { type: type as ExerciseType } : {}),
    title: isString(title) ? clip(title, 200) : "错题",
    prompt: clip(prompt, 3000),
    context: isString(context) ? clip(context, CONTEXT_LIMIT) : "",
    ...(Array.isArray(options) && options.some(isString) ? { options: options.filter(isString).slice(0, 10).map((item) => clip(item, 300)) } : {}),
    correctAnswer: clip(correctAnswer, 2500),
    explanation: isString(explanation) ? clip(explanation, 2500) : "",
    knowledge: isString(knowledge) ? clip(knowledge, 400) : "",
    yourAnswer: isString(yourAnswer) ? clip(yourAnswer, 2500) : "",
    misses: typeof misses === "number" && Number.isFinite(misses) ? Math.max(1, Math.round(misses)) : 1,
    createdAt: created,
    lastWrong: isString(lastWrong) ? lastWrong : created,
    ...(isString(masteredAt) ? { masteredAt } : {}),
  };
}

export function mergeMistakes(current: Record<string, MistakeEntry>, drafts: MistakeDraft[], now: string): Record<string, MistakeEntry> {
  const next = { ...current };
  for (const draft of drafts) {
    const prior = next[draft.id];
    next[draft.id] = {
      ...draft,
      misses: (prior?.misses ?? 0) + 1,
      createdAt: prior?.createdAt ?? now,
      lastWrong: now,
    };
  }
  return next;
}

export function exerciseMistakes(paper: Paper, grade: Grade): MistakeDraft[] {
  const questions = new Map(paper.questions.map((question, index) => [question.id, { question, index }]));
  const context = clip([paper.instructions, paper.passage].filter(Boolean).join("\n\n"), CONTEXT_LIMIT);
  const shared = paper.type === "seven" ? paper.options ?? [] : [];
  const drafts: MistakeDraft[] = [];
  for (const item of grade.items) {
    if (item.correct) continue;
    const found = questions.get(item.id);
    const options = found?.question.options?.length ? found.question.options : shared;
    const explanation = [item.explanation, item.evidence ? `依据：${item.evidence}` : ""].filter(Boolean).join("\n");
    drafts.push({
      id: `${paper.id}:${item.id}`,
      kind: "exercise",
      type: paper.type,
      title: clip(`${paper.title} · 第 ${(found?.index ?? 0) + 1} 题`, 200),
      prompt: clip(found?.question.prompt || `第 ${(found?.index ?? 0) + 1} 题`, 3000),
      context,
      ...(options.length ? { options: options.slice(0, 10).map((option) => clip(option, 300)) } : {}),
      correctAnswer: clip(item.correctAnswer, 2500),
      explanation: clip(explanation, 2500),
      knowledge: clip(item.knowledge || found?.question.knowledge || "", 400),
      yourAnswer: clip(item.yourAnswer ?? "", 2500),
    });
  }
  return drafts;
}

export function correctionMistakes(kind: "essay" | "questions", result: Correction, input: { text: string; prompt: string }): MistakeDraft[] {
  const transcript = result.recognized?.trim() || input.text.trim();
  const parts = [input.prompt.trim() ? `题目要求：\n${input.prompt.trim()}` : "", transcript ? `${kind === "essay" ? "原文" : "原作答"}：\n${transcript}` : ""];
  const context = clip(parts.filter(Boolean).join("\n\n"), CONTEXT_LIMIT);
  const seen = new Set<string>();
  const drafts: MistakeDraft[] = [];
  result.errors.forEach((error, index) => {
    const original = error.original.trim();
    const corrected = error.corrected.trim();
    if (!corrected) return;
    const id = `${kind}:${hash(`${kind}|${original}|${corrected}|${context}`)}`;
    if (seen.has(id)) return;
    seen.add(id);
    drafts.push({
      id,
      kind,
      title: kind === "essay" ? `作文句子修改 · 第 ${index + 1} 处` : `题目订正 · 第 ${index + 1} 处`,
      prompt: clip(kind === "essay" ? `下面这处表达有错误，请写出修改后的正确表达：\n${original}` : `下面这处作答有错误，请写出正确答案：\n${original}`, 3000),
      context,
      correctAnswer: clip(corrected, 2500),
      explanation: clip(error.reason, 2500),
      knowledge: clip(error.category, 400),
      yourAnswer: clip(original, 2500),
    });
  });
  return drafts;
}

export function activeMistakes(mistakes: Record<string, MistakeEntry>) {
  return Object.values(mistakes)
    .filter((entry) => !entry.masteredAt)
    .sort((a, b) => b.lastWrong.localeCompare(a.lastWrong));
}

export function pickWeaknesses(mistakes: Record<string, MistakeEntry>, type: ExerciseType, limit = 8): MistakeEntry[] {
  return activeMistakes(mistakes)
    .sort((a, b) => Number(b.type === type) - Number(a.type === type) || b.misses - a.misses || b.lastWrong.localeCompare(a.lastWrong))
    .slice(0, limit);
}

export function toWeakness(entry: MistakeEntry): Weakness {
  return {
    knowledge: clip(entry.knowledge || entry.title, 400),
    prompt: clip(entry.prompt, 1200),
    ...(entry.yourAnswer.trim() ? { yourAnswer: clip(entry.yourAnswer, 500) } : {}),
    ...(entry.correctAnswer.trim() ? { correctAnswer: clip(entry.correctAnswer, 1000) } : {}),
  };
}

export function challengePrompt(entry: MistakeEntry) {
  const lines = [entry.prompt];
  if (entry.options?.length) lines.push("", "选项：", ...entry.options, "", "请作答选项字母。");
  return clip(lines.join("\n"), 3000);
}
