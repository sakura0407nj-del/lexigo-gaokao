import type { Paper } from "@/lib/learning-types";

const KEY = "lexigo.practice-draft.v1";
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const AI_AGE = 7 * 24 * 60 * 60 * 1000;
const CLOCK_TOLERANCE = 5 * 60 * 1000;

export interface PracticeDraft {
  paper: Paper;
  answers: Record<string, string>;
  elapsed: number;
  savedAt: string;
  firstSavedAt: string;
}

export function isPaperGradingExpired(paper: Paper, now = Date.now()): boolean {
  if (paper.origin !== "ai" || !paper.expiresAt) return false;
  const expiry = Date.parse(paper.expiresAt);
  return Number.isFinite(expiry) && expiry <= now;
}

function stripKeys(paper: Paper): Paper {
  return {
    ...paper,
    questions: paper.questions.map((question) => ({ id: question.id, prompt: question.prompt, points: question.points, ...(question.options ? { options: question.options } : {}) })),
  };
}

export function readDraft(): PracticeDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PracticeDraft>;
    const paper = data.paper;
    if (!paper || typeof paper.id !== "string" || !Array.isArray(paper.questions) || typeof paper.passage !== "string") return null;
    if (!paper.questions.every(question => question && typeof question.id === "string" && typeof question.prompt === "string" && Number.isFinite(question.points))) return null;
    const savedAt = typeof data.savedAt === "string" ? data.savedAt : "";
    const savedTime = Date.parse(savedAt);
    const now = Date.now();
    if (!Number.isFinite(savedTime) || savedTime > now + CLOCK_TOLERANCE || now - savedTime > MAX_AGE) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    const firstTime = typeof data.firstSavedAt === "string" ? Date.parse(data.firstSavedAt) : savedTime;
    const firstSavedAt = new Date(Number.isFinite(firstTime) ? Math.min(firstTime, savedTime) : savedTime).toISOString();
    const answers: Record<string, string> = {};
    if (data.answers && typeof data.answers === "object") {
      for (const [id, value] of Object.entries(data.answers)) if (typeof value === "string") answers[id] = value.slice(0, 200);
    }
    const safePaper = stripKeys(paper);
    if (paper.origin === "ai" && !Number.isFinite(Date.parse(paper.expiresAt ?? ""))) {
      // Older saved papers lack server expiry; the server remains authoritative.
      safePaper.expiresAt = new Date(Date.parse(firstSavedAt) + AI_AGE).toISOString();
    }
    return { paper: safePaper, answers, elapsed: typeof data.elapsed === "number" && Number.isFinite(data.elapsed) && data.elapsed >= 0 ? Math.min(7 * 86400, Math.round(data.elapsed)) : 0, savedAt, firstSavedAt };
  } catch {
    return null;
  }
}

export function writeDraft(paper: Paper, answers: Record<string, string>, elapsed: number): boolean {
  try {
    const savedAt = new Date().toISOString();
    const prior = readDraft();
    const firstSavedAt = prior?.paper.id === paper.id ? prior.firstSavedAt : savedAt;
    const safeElapsed = Number.isFinite(elapsed) && elapsed >= 0 ? Math.min(7 * 86400, Math.round(elapsed)) : 0;
    const draft: PracticeDraft = { paper: stripKeys(paper), answers, elapsed: safeElapsed, savedAt, firstSavedAt };
    window.localStorage.setItem(KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(paperId?: string) {
  try {
    if (paperId) {
      const current = readDraft();
      if (current && current.paper.id !== paperId) return;
    }
    window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable; nothing to clear
  }
}

export function answeredCount(draft: PracticeDraft) {
  return Object.values(draft.answers).filter((value) => value.trim()).length;
}
