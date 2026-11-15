export const REVIEW_STEPS = [1, 3, 7, 14, 30] as const;
export const DAILY_GOALS = [10, 20, 40] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];

export interface ReviewEntry {
  step: number;
  interval: number;
  reviewCount: number;
  lapses: number;
  lastReviewed: string;
  dueAt: string;
  known?: boolean;
}

export type StudyEventKind = "new" | "review" | "again";

export interface DayLog {
  newWords: number;
  reviews: number;
  again: number;
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(from: Date, days: number) {
  const next = startOfDay(from);
  next.setDate(next.getDate() + days);
  return next;
}

export function scheduleReview(prior: ReviewEntry | undefined, known: boolean, now = new Date()): ReviewEntry {
  const reviewCount = (prior?.reviewCount ?? 0) + 1;
  const lapses = (prior?.lapses ?? 0) + (known ? 0 : 1);
  const priorKnown = prior?.known ?? (prior ? !(prior.step === 0 && prior.lapses > 0) : false);
  const earlySuccess = Boolean(known && prior && priorKnown && !isDue(prior, now));
  const step = known ? (earlySuccess ? prior!.step : !prior || !priorKnown ? 0 : Math.min(REVIEW_STEPS.length - 1, prior.step + 1)) : 0;
  const interval = REVIEW_STEPS[step];
  return { step, interval, reviewCount, lapses, known, lastReviewed: now.toISOString(), dueAt: earlySuccess ? prior!.dueAt : addDays(now, interval).toISOString() };
}

export function isDue(entry: ReviewEntry, now = new Date()) {
  const due = Date.parse(entry.dueAt);
  return Number.isFinite(due) && due <= now.getTime();
}

export function dueIds(review: Record<string, ReviewEntry>, now = new Date()) {
  return Object.entries(review)
    .filter(([, entry]) => isDue(entry, now))
    .sort((a, b) => a[1].dueAt.localeCompare(b[1].dueAt))
    .map(([id]) => id);
}

export function daysUntil(iso: string, now = new Date()) {
  const due = Date.parse(iso);
  if (!Number.isFinite(due)) return 0;
  return Math.round((startOfDay(new Date(due)).getTime() - startOfDay(now).getTime()) / DAY);
}

export function dueLabel(entry: ReviewEntry, now = new Date()) {
  const days = daysUntil(entry.dueAt, now);
  if (days <= 0) return days < 0 ? `已逾期 ${-days} 天` : "今天复习";
  if (days === 1) return "明天复习";
  return `${days} 天后复习`;
}

export function parseReviewEntry(raw: unknown): ReviewEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const step = num(record.step);
  const reviewCount = num(record.reviewCount);
  if (step === null || reviewCount === null || typeof record.dueAt !== "string" || !Number.isFinite(Date.parse(record.dueAt))) return null;
  const safeStep = Math.max(0, Math.min(REVIEW_STEPS.length - 1, Math.round(step)));
  return {
    step: safeStep,
    interval: REVIEW_STEPS[safeStep],
    reviewCount: Math.max(0, Math.round(reviewCount)),
    lapses: Math.max(0, Math.round(num(record.lapses) ?? 0)),
    lastReviewed: typeof record.lastReviewed === "string" && Number.isFinite(Date.parse(record.lastReviewed)) ? record.lastReviewed : record.dueAt,
    dueAt: record.dueAt,
    ...(typeof record.known === "boolean" ? {known:record.known} : {}),
  };
}

export function parseDayLog(raw: unknown): DayLog | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);
  return { newWords: count(record.newWords), reviews: count(record.reviews), again: count(record.again) };
}
