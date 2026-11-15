"use client";

import { ArrowRight, BookMarked, BookX, Check, FileCheck2, Gamepad2, Headphones, Lightbulb, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Word } from "@/lib/learning-types";
import { aiStatusInfo, type StatusLike } from "./ai-status";
import { api, errorText, isAbort } from "./api";
import { Flashcards } from "./flashcards";
import { activeMistakes } from "./mistakes";
import type { TabId } from "./nav";
import { streakDays, todayKey, useProgress } from "./progress";
import { Stat } from "./records-view";
import { DAILY_GOALS, dueIds } from "./review";
import { ErrorNote, Loading, cx } from "./ui";
import type { SpeechState } from "./use-speech";
import { WordCard } from "./word-card";

const SAMPLE = 8;

export function TodayView({ status, statusError, speech, onNavigate }: { status: StatusLike | null; statusError: string; speech: SpeechState; onNavigate: (tab: TabId) => void }) {
  const { progress, hydrated, setDailyGoal } = useProgress();
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const [session, setSession] = useState<{ words: Word[]; title: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .sample("high", SAMPLE, controller.signal)
      .then((data) => setWords(data.items))
      .catch((err: unknown) => {
        if (!isAbort(err)) setError(errorText(err));
      });
    return () => controller.abort();
  }, [round]);

  const today = todayKey();
  const log = progress.log[today] ?? { newWords: 0, reviews: 0, again: 0 };
  const due = useMemo(() => (hydrated ? dueIds(progress.review) : []), [hydrated, progress.review]);
  const dueWords = useMemo(() => due.map((id) => progress.words[id]).filter((word): word is Word => Boolean(word)), [due, progress.words]);
  const goal = progress.dailyGoal;
  const wordsDone = Object.values(progress.review).filter(entry => entry.reviewCount > 0 && todayKey(new Date(entry.lastReviewed)) === today).length;
  const dictationToday = progress.dictation.filter((item) => todayKey(new Date(item.at)) === today);
  const practiceToday = progress.practice.filter((item) => todayKey(new Date(item.at)) === today);
  const mistakesActive = useMemo(() => activeMistakes(progress.mistakes), [progress.mistakes]);
  const mistakesClearedToday = Object.values(progress.mistakes).filter((entry) => entry.masteredAt && todayKey(new Date(entry.masteredAt)) === today).length;
  const wrongWords = Object.keys(progress.wrongbook).length;
  const ai = aiStatusInfo(status, statusError);
  const studiedToday = hydrated && progress.days.includes(today);

  const steps: { id: TabId; icon: typeof BookMarked; title: string; detail: string; done: boolean; action: () => void; cta: string }[] = [
    {
      id: "vocab",
      icon: BookMarked,
      title: "词汇",
      detail: due.length ? `待复习 ${due.length} 词 · 今日已学 ${wordsDone} / ${goal}` : `今日已学 ${wordsDone} / ${goal} 词`,
      done: wordsDone >= goal,
      action: () => (dueWords.length ? setSession({ words: dueWords.slice(0, 50), title: `今日复习 · ${Math.min(50, dueWords.length)} 词` }) : onNavigate("vocab")),
      cta: dueWords.length ? "复习到期词" : "去背词",
    },
    {
      id: "dictation",
      icon: Headphones,
      title: "听写",
      detail: dictationToday.length ? `今日 ${dictationToday.length} 次 · 正确 ${dictationToday.reduce((n, item) => n + item.correct, 0)} / ${dictationToday.reduce((n, item) => n + item.total, 0)}` : wrongWords ? `错词本 ${wrongWords} 个可复听` : "按教材单元听写",
      done: dictationToday.length > 0,
      action: () => onNavigate("dictation"),
      cta: "去听写",
    },
    {
      id: "practice",
      icon: Sparkles,
      title: "练习",
      detail: practiceToday.length ? `今日完成 ${practiceToday.length} 组` : "做一组真题或原创模拟",
      done: practiceToday.length > 0,
      action: () => onNavigate("practice"),
      cta: "去练习",
    },
    {
      id: "mistakes",
      icon: BookX,
      title: "错题复盘",
      detail: mistakesActive.length ? `待复习 ${mistakesActive.length} 道${mistakesClearedToday ? ` · 今日清除 ${mistakesClearedToday}` : ""}` : mistakesClearedToday ? `今日清除 ${mistakesClearedToday} 道` : "暂无待复习错题",
      done: hydrated && (mistakesActive.length === 0 ? practiceToday.length > 0 || mistakesClearedToday > 0 : mistakesClearedToday > 0),
      action: () => onNavigate("mistakes"),
      cta: "去复盘",
    },
  ];
  const doneSteps = steps.filter((step) => step.done).length;

  if (session) {
    return (
      <section className="view">
        <Flashcards words={session.words} title={session.title} speech={speech} onExit={() => setSession(null)} />
      </section>
    );
  }

  return (
    <section className="view">
      <div className="hero hero-compact">
        <p className="eyebrow">拾词 LexiGo · 高考英语</p>
        <h1 className="hero-title">
          每天一点，<br className="sm:hidden" />
          让英语成为你的<em>优势</em>。
        </h1>
        <p className="hero-sub">按“词汇 → 听写 → 练习 → 错题复盘”完成今天的学习。进度只保存在这台设备的浏览器里。</p>
      </div>

      <div className="study-expansion">
        <button type="button" className="study-expansion-card" onClick={() => onNavigate("exam")}>
          <FileCheck2 aria-hidden className="size-6" />
          <span><strong>定制一张模拟卷</strong><small>自选题型与时长 · 交卷后找到提升方向</small></span><ArrowRight aria-hidden className="size-5" />
        </button>
        <button type="button" className="study-expansion-card study-expansion-game" onClick={() => onNavigate("game")}>
          <Gamepad2 aria-hidden className="size-6" />
          <span><strong>带着单词去闯关</strong><small>选对英语之门 · 集结你的知识小队</small></span><ArrowRight aria-hidden className="size-5" />
        </button>
      </div>

      <div className="card card-pad today-path">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Today&apos;s path</p>
            <h2 className="sub-title m-0">今日学习路线 · {hydrated ? `${doneSteps} / 4` : "…"}</h2>
          </div>
          <div className="goal-picker">
            <span className="field-label">每日词汇目标</span>
            <div className="segmented" role="radiogroup" aria-label="每日词汇目标">
              {DAILY_GOALS.map((value) => (
                <button key={value} type="button" role="radio" aria-checked={goal === value} className={cx("seg", goal === value && "is-active")} onClick={() => setDailyGoal(value)} disabled={!hydrated}>
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="goal-bar" aria-hidden>
          <span style={{ width: `${Math.min(100, (wordsDone / goal) * 100)}%` }} />
        </div>
        <p className="meta-line">
          今日词汇：新掌握 {log.newWords} · 复习记住 {log.reviews} · 还不熟 {log.again}（只统计你今天实际做过的操作）
        </p>
        <ol className="path-list">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.id} className={cx("path-step", step.done && "is-done")}>
                <span className="path-index" aria-hidden>
                  {step.done ? <Check className="size-4" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="path-title">
                    <Icon aria-hidden className="size-4" /> {step.title}
                    {step.done ? <span className="sr-only">（已完成）</span> : null}
                  </span>
                  <span className="path-detail">{hydrated ? step.detail : "…"}</span>
                </span>
                <button type="button" className={cx("btn btn-sm", step.done ? "btn-ghost" : "btn-primary")} onClick={step.action}>
                  {step.cta} <ArrowRight aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {hydrated && dueWords.length ? (
        <div className="card card-pad space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Due review</p>
              <h2 className="sub-title m-0">到期复习 · {due.length} 词</h2>
              <p className="meta-line">按 1/3/7/14/30 天间隔安排；“还不熟”的词明天再出现。</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setSession({ words: dueWords.slice(0, 50), title: `今日复习 · ${Math.min(50, dueWords.length)} 词` })}>
              一键复习{dueWords.length > 50 ? "前 50 词" : ""}
            </button>
          </div>
          <ul className="due-list">
            {dueWords.slice(0, 12).map((word) => (
              <li key={word.id} lang="en">
                {word.word}
              </li>
            ))}
            {dueWords.length > 12 ? <li className="due-more">等 {dueWords.length} 词</li> : null}
          </ul>
        </div>
      ) : null}

      <div className="stat-grid">
        {hydrated ? (
          <>
            <Stat label="连续学习" value={streakDays(progress.days)} unit="天" note={studiedToday ? "今天已打卡" : "今天还没开始"} />
            <Stat label="累计已掌握" value={progress.learned.length} unit="词" note={status ? `高考词表共 ${status.vocabulary.toLocaleString("zh-CN")} 词` : undefined} />
          </>
        ) : (
          <>
            <Stat label="连续学习" value="…" />
            <Stat label="累计已掌握" value="…" />
          </>
        )}
        <Stat label="题库练习" value={status ? status.papers : "…"} unit="组" note={status ? `${status.questions} 道题` : undefined} />
        <Stat label="AI 批改" value={ai.short} note={ai.tone === "ok" && status?.model ? status.model : undefined} />
      </div>
      {statusError ? <ErrorNote message={`暂时无法获取服务状态：${statusError}`} /> : null}

      <div className="card card-pad">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Today&apos;s words</p>
            <h2 className="sub-title m-0">随机高频词 · {SAMPLE} 个</h2>
            {words ? <p className="meta-line">本组已掌握 {words.filter((word) => progress.learned.includes(word.id)).length} / {words.length}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {words?.length ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSession({ words, title: `随机高频词 · ${words.length} 个` })}>
                卡片背这组
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setWords(null); setError(""); setRound((value) => value + 1); }}>
              <RefreshCw aria-hidden className="size-4" /> 换一组
            </button>
          </div>
        </div>
        {error ? <ErrorNote message={error} onRetry={() => { setError(""); setRound((value) => value + 1); }} /> : null}
        {!words && !error ? <Loading label="正在挑选今日词汇…" /> : null}
        {words ? (
          <div className="word-grid">
            {words.map((word) => (
              <WordCard key={word.id} word={word} speech={speech} compact />
            ))}
          </div>
        ) : null}
      </div>

      <div className="quick-grid">
        <button type="button" className="quick" onClick={() => onNavigate("knowledge")}>
          <Lightbulb aria-hidden className="size-6" />
          <span className="quick-title">知识卡</span>
          <span className="quick-desc">语法、写作与易错点速查</span>
        </button>
        <button type="button" className="quick" onClick={() => onNavigate("essay")}>
          <PenLine aria-hidden className="size-6" />
          <span className="quick-title">作文批改</span>
          <span className="quick-desc">应用文 15 分 · 读后续写 25 分</span>
        </button>
        <button type="button" className="quick" onClick={() => onNavigate("questions")}>
          <Sparkles aria-hidden className="size-6" />
          <span className="quick-title">题目批改</span>
          <span className="quick-desc">拍照或粘贴作答，获取订正建议</span>
        </button>
      </div>

      {status?.frequencyNote ? <p className="hint">{status.frequencyNote}</p> : null}
    </section>
  );
}
