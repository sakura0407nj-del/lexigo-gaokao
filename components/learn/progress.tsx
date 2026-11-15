"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { ExerciseType, Frequency, Paper, Word } from "@/lib/learning-types";
import {scopedStorageKey} from '@/lib/learning-stage';
import {canonicalizeWord, canonicalWordId, migrateProgress, type WordAliases} from "@/lib/progress-migration";
import {getJson} from "./api";
import { mergeMistakes, parseMistake, type MistakeDraft, type MistakeEntry } from "./mistakes";
import { DAILY_GOALS, parseDayLog, parseReviewEntry, scheduleReview, type DailyGoal, type DayLog, type ReviewEntry, type StudyEventKind } from "./review";

export interface DictationAttempt {
  attemptId?: string;
  at: string;
  band: string;
  total: number;
  correct: number;
  source?: "textbook" | "frequency" | "wrongbook";
  scope?: string;
  book?: string;
  units?: string[];
  planned?: number;
}

export interface WrongEntry {
  word: Word;
  misses: number;
  lastAnswer: string;
  lastWrong: string;
}

export interface PracticeRecord {
  at: string;
  paperId: string;
  title: string;
  type: ExerciseType;
  origin: Paper["origin"];
  score: number;
  maxScore: number;
}

export interface CorrectionRecord {
  at: string;
  kind: "essay" | "questions";
  score: number;
  maxScore: number;
  summary: string;
}

export interface Progress {
  version: 1;
  learned: string[];
  starred: string[];
  words: Record<string, Word>;
  wrongbook: Record<string, WrongEntry>;
  dictation: DictationAttempt[];
  practice: PracticeRecord[];
  examAttempts: string[];
  corrections: CorrectionRecord[];
  days: string[];
  mistakes: Record<string, MistakeEntry>;
  review: Record<string, ReviewEntry>;
  log: Record<string, DayLog>;
  dailyGoal: DailyGoal;
}

const STORAGE_KEY = scopedStorageKey("lexigo.progress.v1");
const HISTORY_LIMIT = 200;
const LOG_DAYS = 180;
let wordAliases:WordAliases={};
let aliasesReady=false;
let aliasPromise:Promise<WordAliases>|null=null;

function loadWordAliases():Promise<WordAliases>{
  return aliasPromise??=getJson<{version:number;aliases:unknown}>("/api/vocabulary/aliases").then(data=>{
    if(data.version!==1||!isRecord(data.aliases))throw new Error("词条索引格式无效");
    const clean:Record<string,string>={};
    for(const [id,target] of Object.entries(data.aliases))if(typeof target==="string"&&id.length<=200&&target.length<=200)clean[id]=target;
    wordAliases=clean;aliasesReady=true;return wordAliases;
  }).catch(error=>{aliasPromise=null;throw error;});
}

function normalizedWord(word:Word):Word{return canonicalizeWord(word,wordAliases);}
function migrated(progress:Progress):Progress{return aliasesReady?migrateProgress(progress,wordAliases).progress:progress;}

export function emptyProgress(): Progress {
  return { version: 1, learned: [], starred: [], words: {}, wrongbook: {}, dictation: [], practice: [], examAttempts: [], corrections: [], days: [], mistakes: {}, review: {}, log: {}, dailyGoal: 20 };
}

export function todayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const FREQS: Frequency[] = ["high", "medium", "low"];
const TYPES: ExerciseType[] = ["reading", "grammar", "seven", "cloze"];

function parseWord(value: unknown): Word | null {
  if (!isRecord(value)) return null;
  const { id, word, phonetic, translation, frequency, rank, example, exampleZh, accepted, book, unit, pos, topics, textbooks, inGaokao, aliasIds } = value;
  if (!isString(id) || !isString(word) || !isString(translation)) return null;
  return {
    id,
    word,
    phonetic: isString(phonetic) ? phonetic : "",
    translation,
    frequency: FREQS.includes(frequency as Frequency) ? (frequency as Frequency) : "low",
    rank: isNumber(rank) ? rank : 0,
    frequencyKnown:isNumber(rank)&&rank>0,
    frequencyBand:isNumber(rank)&&rank>0?(FREQS.includes(frequency as Frequency)?frequency as Frequency:"low"):"unknown",
    ...(isString(example) ? { example } : {}),
    ...(isString(exampleZh) ? { exampleZh } : {}),
    ...(Array.isArray(accepted) ? { accepted: accepted.filter(isString).slice(0, 20) } : {}),
    ...(isString(book) ? { book } : {}),
    ...(isString(unit) ? { unit } : {}),
    ...(Array.isArray(pos)?{pos:pos.filter(isString).slice(0,20)}:{}),
    ...(Array.isArray(topics)?{topics:topics.filter(isString).slice(0,30)}:{}),
    ...(Array.isArray(aliasIds)?{aliasIds:aliasIds.filter(isString).slice(0,100)}:{}),
    ...(typeof inGaokao==="boolean"?{inGaokao}:{}),
    ...(Array.isArray(textbooks)?{textbooks:textbooks.filter(isRecord).filter(item=>[item.bookId,item.bookTitle,item.unitId,item.unitTitle].every(isString)).slice(0,100).map(item=>({bookId:item.bookId as string,bookTitle:item.bookTitle as string,unitId:item.unitId as string,unitTitle:item.unitTitle as string,...(isString(item.originalId)?{originalId:item.originalId}:{})}))}:{}),
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("列表字段格式不正确");
  return Array.from(new Set(value.filter(isString)));
}

export function parseProgress(input: unknown): Progress {
  if (!isRecord(input)) throw new Error("文件内容不是有效的学习记录对象");
  if (input.version !== 1) throw new Error("不支持的记录版本");
  const result = emptyProgress();
  result.learned = stringList(input.learned ?? []);
  result.starred = stringList(input.starred ?? []);
  result.days = stringList(input.days ?? []).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  if (isRecord(input.words)) {
    for (const [key, raw] of Object.entries(input.words)) {
      const word = parseWord(raw);
      if (word && word.id === key) result.words[key] = word;
    }
  }
  if (isRecord(input.wrongbook)) {
    for (const [key, raw] of Object.entries(input.wrongbook)) {
      if (!isRecord(raw)) continue;
      const word = parseWord(raw.word);
      if (!word || word.id !== key || !isNumber(raw.misses)) continue;
      result.wrongbook[key] = {
        word,
        misses: Math.max(1, Math.round(raw.misses)),
        lastAnswer: isString(raw.lastAnswer) ? raw.lastAnswer : "",
        lastWrong: isString(raw.lastWrong) ? raw.lastWrong : "",
      };
    }
  }
  if (Array.isArray(input.dictation)) {
    result.dictation = input.dictation
      .filter(isRecord)
      .filter((item) => isString(item.at) && isNumber(item.total) && isNumber(item.correct) && item.correct <= item.total)
      .map((item) => ({
        at: item.at as string,
        ...(isString(item.attemptId)&&item.attemptId.length<=160?{attemptId:item.attemptId}:{}),
        band: isString(item.band) ? item.band : "all",
        total: item.total as number,
        correct: item.correct as number,
        ...(item.source === "textbook" || item.source === "frequency" || item.source === "wrongbook" ? { source: item.source as NonNullable<DictationAttempt["source"]> } : {}),
        ...(isString(item.scope) ? { scope: item.scope.slice(0, 200) } : {}),
        ...(isString(item.book) ? { book: item.book } : {}),
        ...(Array.isArray(item.units) ? { units: item.units.filter(isString).slice(0, 50) } : {}),
        ...(isNumber(item.planned) ? { planned: item.planned } : {}),
      }))
      .slice(-HISTORY_LIMIT);
  }
  if (Array.isArray(input.practice)) {
    result.practice = input.practice
      .filter(isRecord)
      .filter((item) => isString(item.at) && isString(item.paperId) && isNumber(item.score) && isNumber(item.maxScore) && TYPES.includes(item.type as ExerciseType))
      .map((item) => ({
        at: item.at as string,
        paperId: item.paperId as string,
        title: isString(item.title) ? item.title : "练习",
        type: item.type as ExerciseType,
        origin: (item.origin === "ai" || item.origin === "past" ? item.origin : "original") as Paper["origin"],
        score: item.score as number,
        maxScore: item.maxScore as number,
      }))
      .slice(-HISTORY_LIMIT);
  }
  if (Array.isArray(input.corrections)) {
    result.corrections = input.corrections
      .filter(isRecord)
      .filter((item) => isString(item.at) && isNumber(item.score) && isNumber(item.maxScore) && (item.kind === "essay" || item.kind === "questions"))
      .map((item) => ({
        at: item.at as string,
        kind: item.kind as "essay" | "questions",
        score: item.score as number,
        maxScore: item.maxScore as number,
        summary: isString(item.summary) ? item.summary.slice(0, 400) : "",
      }))
      .slice(-HISTORY_LIMIT);
  }
  if (Array.isArray(input.examAttempts)) result.examAttempts = [...new Set(input.examAttempts.filter(isString).filter(id => id.length > 0 && id.length <= 160))].slice(-HISTORY_LIMIT);
  if (isRecord(input.mistakes)) {
    for (const [key, raw] of Object.entries(input.mistakes)) {
      const entry = parseMistake(key, raw);
      if (entry) result.mistakes[key] = entry;
    }
  }
  if (isRecord(input.review)) {
    for (const [key, raw] of Object.entries(input.review)) {
      const entry = parseReviewEntry(raw);
      if (entry) result.review[key] = entry;
    }
  }
  if (isRecord(input.log)) {
    for (const [key, raw] of Object.entries(input.log)) {
      const entry = /^\d{4}-\d{2}-\d{2}$/.test(key) ? parseDayLog(raw) : null;
      if (entry) result.log[key] = entry;
    }
  }
  if (DAILY_GOALS.includes(input.dailyGoal as DailyGoal)) result.dailyGoal = input.dailyGoal as DailyGoal;
  return result;
}

function logEvent(progress: Progress, kind: StudyEventKind, delta = 1): Progress {
  const today = todayKey();
  const prior = progress.log[today] ?? { newWords: 0, reviews: 0, again: 0 };
  const field = kind === "new" ? "newWords" : kind === "review" ? "reviews" : "again";
  const entry = { ...prior, [field]: Math.max(0, prior[field] + delta) };
  const keys = Object.keys(progress.log).sort();
  const log: Record<string, DayLog> = {};
  for (const key of keys.slice(-(LOG_DAYS - 1))) if (key !== today) log[key] = progress.log[key];
  log[today] = entry;
  return { ...progress, log };
}

function markToday(progress: Progress): Progress {
  const today = todayKey();
  if (progress.days.includes(today)) return progress;
  return { ...progress, days: [...progress.days, today].slice(-730) };
}

interface ProgressApi {
  progress: Progress;
  hydrated: boolean;
  storageAvailable: boolean;
  isLearned: (id: string) => boolean;
  isStarred: (id: string) => boolean;
  toggleLearned: (word: Word) => void;
  toggleStarred: (word: Word) => void;
  reviewWord: (word: Word, known: boolean) => void;
  setDailyGoal: (goal: DailyGoal) => void;
  markStudyDay: () => void;
  recordDictation: (attempt: Omit<DictationAttempt, "at">, results: { word: Word; correct: boolean; answer: string }[]) => void;
  removeWrong: (id: string) => void;
  recordPractice: (record: Omit<PracticeRecord, "at">) => void;
  recordExam: (attemptId: string, records: Omit<PracticeRecord, "at">[], mistakes: MistakeDraft[]) => void;
  recordCorrection: (record: Omit<CorrectionRecord, "at">) => void;
  addMistakes: (drafts: MistakeDraft[]) => number;
  masterMistake: (id: string) => void;
  restoreMistake: (id: string) => void;
  replaceAll: (next: Progress) => void;
  clearAll: () => void;
}

const ProgressContext = createContext<ProgressApi | null>(null);

/** Keep the exam completion marker, scores and mistake intake in one storage write. */
export function applyExamRecord(current: Progress, attemptId: string, records: Omit<PracticeRecord, "at">[], mistakes: MistakeDraft[], at = new Date().toISOString()): Progress {
  if (!attemptId || attemptId.length > 160 || current.examAttempts.includes(attemptId) || records.length < 1 || records.length > 8) return current;
  if (records.some(record => !Number.isFinite(record.score) || !Number.isFinite(record.maxScore) || record.score < 0 || record.maxScore <= 0 || record.score > record.maxScore || !TYPES.includes(record.type))) return current;
  return markToday({
    ...current,
    examAttempts: [...current.examAttempts, attemptId].slice(-HISTORY_LIMIT),
    practice: [...current.practice, ...records.map(record => ({ ...record, at }))].slice(-HISTORY_LIMIT),
    mistakes: mergeMistakes(current.mistakes, mistakes, at),
  });
}

interface StoreSnapshot {
  progress: Progress;
  storageAvailable: boolean;
}

const SERVER_SNAPSHOT: StoreSnapshot = { progress: emptyProgress(), storageAvailable: true };
let snapshot: StoreSnapshot | null = null;
const listeners = new Set<() => void>();

function readStorage(): StoreSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return { progress: raw ? migrated(parseProgress(JSON.parse(raw))) : emptyProgress(), storageAvailable: true };
  } catch (error) {
    const available = !(error instanceof DOMException);
    return { progress: emptyProgress(), storageAvailable: available };
  }
}

function getSnapshot(): StoreSnapshot {
  if (!snapshot) snapshot = readStorage();
  return snapshot;
}

function getServerSnapshot(): StoreSnapshot {
  return SERVER_SNAPSHOT;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    snapshot = readStorage();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function setProgress(update: (current: Progress) => Progress) {
  const current = getSnapshot();
  const progress = update(current.progress);
  if (progress === current.progress) return;
  let storageAvailable = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    storageAvailable = false;
  }
  snapshot = { progress, storageAvailable };
  emit();
}

const noopSubscribe = () => () => {};

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { progress, storageAvailable } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  useEffect(()=>{
    let active=true;
    void loadWordAliases().then(()=>{if(active)setProgress(current=>migrated(current));}).catch(()=>{/* Existing local progress remains usable; the next mount retries. */});
    return ()=>{active=false;};
  },[]);
  const toggleLearned = useCallback((word: Word) => {
    word=normalizedWord(word);
    setProgress((current) => {
      const has = current.learned.includes(word.id);
      const words = { ...current.words, [word.id]: word };
      if (has) {
        const review = { ...current.review };
        const prior = review[word.id];
        delete review[word.id];
        const undoToday = prior && prior.reviewCount === 1 && todayKey(new Date(prior.lastReviewed)) === todayKey();
        const next = { ...current, learned: current.learned.filter((id) => id !== word.id), words, review };
        return undoToday ? logEvent(next, "new", -1) : next;
      }
      const prior = current.review[word.id];
      const next = {
        ...current,
        learned: [...current.learned, word.id],
        words,
        review: { ...current.review, [word.id]: scheduleReview(prior, true) },
      };
      return markToday(logEvent(next, prior ? "review" : "new"));
    });
  }, []);

  const reviewWord = useCallback((word: Word, known: boolean) => {
    word=normalizedWord(word);
    setProgress((current) => {
      const prior = current.review[word.id];
      const has = current.learned.includes(word.id);
      const learned = known ? (has ? current.learned : [...current.learned, word.id]) : current.learned.filter((id) => id !== word.id);
      const next = {
        ...current,
        learned,
        words: { ...current.words, [word.id]: word },
        review: { ...current.review, [word.id]: scheduleReview(prior, known) },
      };
      const kind: StudyEventKind = !known ? "again" : prior ? "review" : "new";
      return markToday(logEvent(next, kind));
    });
  }, []);

  const setDailyGoal = useCallback((goal: DailyGoal) => {
    setProgress((current) => (current.dailyGoal === goal ? current : { ...current, dailyGoal: goal }));
  }, []);

  const markStudyDay = useCallback(() => setProgress(current => markToday(current)), []);

  const toggleStarred = useCallback((word: Word) => {
    word=normalizedWord(word);
    setProgress((current) => {
      const has = current.starred.includes(word.id);
      return {
        ...current,
        starred: has ? current.starred.filter((id) => id !== word.id) : [...current.starred, word.id],
        words: { ...current.words, [word.id]: word },
      };
    });
  }, []);

  const recordDictation = useCallback<ProgressApi["recordDictation"]>((attempt, results) => {
    setProgress((current) => {
      if(attempt.attemptId&&current.dictation.some(record=>record.attemptId===attempt.attemptId))return current;
      const wrongbook = { ...current.wrongbook };
      const now = new Date().toISOString();
      for (const result of results) {
        if (result.correct) continue;
        const word=normalizedWord(result.word);
        const prior = wrongbook[word.id];
        wrongbook[word.id] = { word, misses: (prior?.misses ?? 0) + 1, lastAnswer: result.answer, lastWrong: now };
      }
      return markToday({
        ...current,
        wrongbook,
        dictation: [...current.dictation, { ...attempt, at: now }].slice(-HISTORY_LIMIT),
      });
    });
  }, []);

  const removeWrong = useCallback((id: string) => {
    id=canonicalWordId(id,wordAliases);
    setProgress((current) => {
      const wrongbook = { ...current.wrongbook };
      delete wrongbook[id];
      return { ...current, wrongbook };
    });
  }, []);

  const recordPractice = useCallback((record: Omit<PracticeRecord, "at">) => {
    setProgress((current) => markToday({ ...current, practice: [...current.practice, { ...record, at: new Date().toISOString() }].slice(-HISTORY_LIMIT) }));
  }, []);

  const recordExam = useCallback((attemptId: string, records: Omit<PracticeRecord, "at">[], mistakes: MistakeDraft[]) => {
    setProgress(current => applyExamRecord(current, attemptId, records, mistakes));
  }, []);

  const recordCorrection = useCallback((record: Omit<CorrectionRecord, "at">) => {
    setProgress((current) =>
      markToday({ ...current, corrections: [...current.corrections, { ...record, summary: record.summary.slice(0, 400), at: new Date().toISOString() }].slice(-HISTORY_LIMIT) }),
    );
  }, []);

  const addMistakes = useCallback((drafts: MistakeDraft[]) => {
    if (!drafts.length) return 0;
    setProgress((current) => ({ ...current, mistakes: mergeMistakes(current.mistakes, drafts, new Date().toISOString()) }));
    return drafts.length;
  }, []);

  const masterMistake = useCallback((id: string) => {
    setProgress((current) => {
      const entry = current.mistakes[id];
      if (!entry || entry.masteredAt) return current;
      return markToday({ ...current, mistakes: { ...current.mistakes, [id]: { ...entry, masteredAt: new Date().toISOString() } } });
    });
  }, []);

  const restoreMistake = useCallback((id: string) => {
    setProgress((current) => {
      const entry = current.mistakes[id];
      if (!entry?.masteredAt) return current;
      const rest = { ...entry };
      delete rest.masteredAt;
      return { ...current, mistakes: { ...current.mistakes, [id]: rest } };
    });
  }, []);

  const replaceAll = useCallback((next: Progress) => setProgress(() => migrated(next)), []);
  const clearAll = useCallback(() => setProgress(() => emptyProgress()), []);

  const value = useMemo<ProgressApi>(() => {
    const learnedSet = new Set(progress.learned.map(id=>canonicalWordId(id,wordAliases)));
    const starredSet = new Set(progress.starred.map(id=>canonicalWordId(id,wordAliases)));
    return {
      progress,
      hydrated,
      storageAvailable,
      isLearned: (id) => learnedSet.has(canonicalWordId(id,wordAliases)),
      isStarred: (id) => starredSet.has(canonicalWordId(id,wordAliases)),
      toggleLearned,
      toggleStarred,
      reviewWord,
      setDailyGoal,
      markStudyDay,
      recordDictation,
      removeWrong,
      recordPractice,
      recordExam,
      recordCorrection,
      addMistakes,
      masterMistake,
      restoreMistake,
      replaceAll,
      clearAll,
    };
  }, [progress, hydrated, storageAvailable, toggleLearned, toggleStarred, reviewWord, setDailyGoal, markStudyDay, recordDictation, removeWrong, recordPractice, recordExam, recordCorrection, addMistakes, masterMistake, restoreMistake, replaceAll, clearAll]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressApi {
  const context = useContext(ProgressContext);
  if (!context) throw new Error("useProgress must be used inside ProgressProvider");
  return context;
}

export function streakDays(days: string[]): number {
  if (!days.length) return 0;
  const set = new Set(days);
  const cursor = new Date();
  if (!set.has(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (set.has(todayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}




