"use client";

import { CheckCircle2, Clock, Download, RotateCcw, Send, Timer, XCircle } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Grade, Paper } from "@/lib/learning-types";
import { api, errorText, isAbort, ORIGIN_LABEL, TYPE_LABEL } from "./api";
import { exerciseMistakes } from "./mistakes";
import { clearDraft, isPaperGradingExpired, writeDraft } from "./practice-draft";
import { useProgress } from "./progress";
import { ErrorNote, Loading, cx, downloadText } from "./ui";

const LETTERS = "ABCDEFG";

function optionLetter(option: string, index: number) {
  const match = option.match(/^\s*([A-G])[.．、)\s]/);
  return match ? match[1] : LETTERS[index] ?? String(index + 1);
}

function optionText(option: string) {
  return option.replace(/^\s*[A-G][.．、)]\s*/, "");
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function paperToText(paper: Paper, answers: Record<string, string>, grade: Grade | null) {
  const lines = [paper.title, `${TYPE_LABEL[paper.type]} · ${paper.level} · ${paper.topic}`, `来源：${paper.source}（${ORIGIN_LABEL[paper.origin]}）`, "", paper.instructions, "", paper.passage, ""];
  if (paper.options?.length) {
    lines.push("选项：", ...paper.options, "");
  }
  paper.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.prompt}`);
    question.options?.forEach((option) => lines.push(`   ${option}`));
    if (answers[question.id]) lines.push(`   我的答案：${answers[question.id]}`);
    const item = grade?.items.find((entry) => entry.id === question.id);
    if (item) {
      lines.push(`   正确答案：${item.correctAnswer}  ${item.correct ? "✓" : "✗"}`);
      if (item.explanation) lines.push(`   解析：${item.explanation}`);
      if (item.evidence) lines.push(`   依据：${item.evidence}`);
    }
    lines.push("");
  });
  if (grade) lines.push(`得分：${grade.score} / ${grade.maxScore}`);
  return lines.join("\n");
}

export function PaperPlayer({
  paper,
  onBack,
  initialAnswers,
  initialElapsed = 0,
  restored = false,
}: {
  paper: Paper;
  onBack?: () => void;
  initialAnswers?: Record<string, string>;
  initialElapsed?: number;
  restored?: boolean;
}) {
  const { recordPractice, addMistakes } = useProgress();
  const [collected, setCollected] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => initialAnswers ?? {});
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [timerOn, setTimerOn] = useState(false);
  const [elapsed, setElapsed] = useState(initialElapsed);
  const [draftSaved, setDraftSaved] = useState<"idle" | "saved" | "failed">(restored ? "saved" : "idle");
  const controllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const latestDraft = useRef({ paper, answers, elapsed, active: true });
  const gradingExpired = isPaperGradingExpired(paper);

  useLayoutEffect(() => {
    latestDraft.current = { paper, answers, elapsed, active: !grade };
  }, [paper, answers, elapsed, grade]);

  useEffect(() => {
    const flush = () => {
      const current = latestDraft.current;
      if (current.active) writeDraft(current.paper, current.answers, current.elapsed);
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    // Keep even a just-generated paper; flush edits before tab navigation or reload.
    flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!timerOn || grade) return;
    const timer = window.setInterval(() => {
      const next = latestDraft.current.elapsed + 1;
      latestDraft.current = { ...latestDraft.current, elapsed: next };
      setElapsed(next);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timerOn, grade]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const answerCount = Object.values(answers).filter((value) => value.trim()).length;
  const elapsedBucket = Math.floor(elapsed / 10);
  useEffect(() => {
    if (grade) return;
    const timer = window.setTimeout(() => {
      const current = latestDraft.current;
      if (current.active) setDraftSaved(writeDraft(current.paper, current.answers, current.elapsed) ? "saved" : "failed");
    }, 400);
    return () => window.clearTimeout(timer);
    // elapsed is sampled every 10s through elapsedBucket to avoid writing each second
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, elapsedBucket, grade, paper, answerCount]);

  const sharedOptions = paper.type === "seven" ? paper.options ?? [] : [];
  const answered = paper.questions.filter((question) => (answers[question.id] ?? "").trim()).length;
  const gradeMap = useMemo(() => new Map(grade?.items.map((item) => [item.id, item]) ?? []), [grade]);
  const usedSeven = new Set(Object.values(answers));

  function setAnswer(id: string, value: string) {
    if (grade) return;
    const next = { ...latestDraft.current.answers, [id]: value };
    latestDraft.current = { ...latestDraft.current, answers: next };
    setAnswers(next);
    setDraftSaved(writeDraft(paper, next, latestDraft.current.elapsed) ? "saved" : "failed");
  }

  async function submit() {
    if (!answered || submitting) return;
    if (isPaperGradingExpired(paper)) {
      setError("这份 AI 练习的评分已过期，作答仍保留，可下载后复习；请重新生成一份新练习。");
      return;
    }
    setSubmitting(true);
    setError("");
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const trimmed = Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, value.trim()]));
      const result = await api.grade({ paperId: paper.id, answers: trimmed, ...(paper.sealed ? { sealed: paper.sealed } : {}) }, controller.signal);
      latestDraft.current.active = false;
      setGrade(result);
      clearDraft(paper.id);
      setDraftSaved("idle");
      setCollected(addMistakes(exerciseMistakes(paper, result)));
      recordPractice({ paperId: paper.id, title: paper.title, type: paper.type, origin: paper.origin, score: result.score, maxScore: result.maxScore });
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      if (!isAbort(err)) setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  function retry() {
    clearDraft(paper.id);
    latestDraft.current = { paper, answers: {}, elapsed: 0, active: true };
    setAnswers({});
    setGrade(null);
    setCollected(0);
    setElapsed(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <article className="paper">
      <header className="paper-head">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tag tag-green">{TYPE_LABEL[paper.type]}</span>
          <span className="tag">{paper.level}</span>
          {paper.topic ? <span className="tag">{paper.topic}</span> : null}
          <span className={cx("tag", paper.origin === "ai" ? "tag-orange" : paper.origin === "past" ? "tag-green" : "tag-lime")}>{ORIGIN_LABEL[paper.origin]}</span>
        </div>
        <h2 className="paper-title">{paper.title}</h2>
        <p className="meta-line">
          {paper.questions.length} 题 · 建议用时 {paper.minutes} 分钟 · {paper.source}
        </p>
        {gradingExpired ? <p className="note note-error">这份 AI 练习的评分已过期。你的作答仍保留，可继续查看和下载；需要评分时请重新生成新练习。</p> : paper.origin === "ai" ? <p className="hint">AI 练习评分通常自命题后 7 天内有效，旧版保存的练习可能更早失效。</p> : null}
        {!grade && draftSaved !== "idle" ? (
          <p className="hint" role="status">
            {draftSaved === "saved" ? (restored ? "已恢复上次的作答草稿，作答和计时会自动保存在本机。" : "作答和计时已自动保存在本机，离开后可从练习页继续。") : "本机存储不可用，草稿没有保存，请不要刷新页面。"}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {onBack ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
              {!grade && draftSaved === "saved" ? "返回列表（保留草稿）" : "返回列表"}
            </button>
          ) : null}
          <button type="button" className={cx("btn btn-ghost btn-sm", timerOn && "is-active-btn")} onClick={() => setTimerOn((value) => !value)} aria-pressed={timerOn} disabled={Boolean(grade)}>
            <Timer aria-hidden className="size-4" />
            {timerOn ? <span className="tabular-nums">计时 {formatClock(elapsed)}</span> : elapsed ? <span className="tabular-nums">已暂停 {formatClock(elapsed)}</span> : "开启计时（可选）"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadText(`${paper.title}.txt`, paperToText(paper, answers, grade))}>
            <Download aria-hidden className="size-4" /> 下载文本
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadText(`${paper.title}.json`, JSON.stringify({ paper, answers, grade }, null, 2), "application/json")}>
            <Download aria-hidden className="size-4" /> JSON
          </button>
        </div>
      </header>

      {paper.instructions ? <p className="paper-instructions">{paper.instructions}</p> : null}

      <div className="passage" lang="en">
        {paper.passage}
      </div>

      {sharedOptions.length ? (
        <div className="shared-options">
          <p className="field-label">七个选项（每项最多用一次，有两项为多余选项）</p>
          <ol className="space-y-1.5">
            {sharedOptions.map((option, index) => (
              <li key={option} lang="en" className={cx("shared-option", usedSeven.has(optionLetter(option, index)) && !grade && "is-used")}>
                <span className="opt-letter">{optionLetter(option, index)}</span>
                <span>{optionText(option)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <ol className="questions">
        {paper.questions.map((question, index) => {
          const item = gradeMap.get(question.id);
          const value = answers[question.id] ?? "";
          const choices = question.options?.length ? question.options : sharedOptions;
          return (
            <li key={question.id} className={cx("question", item && (item.correct ? "is-correct" : "is-wrong"))}>
              <div className="question-head">
                <span className="q-num">{index + 1}</span>
                <p className="question-prompt" lang="en">
                  {question.prompt}
                </p>
                <span className="q-points">{question.points} 分</span>
              </div>
              {choices.length ? (
                <div className={cx("choices", sharedOptions.length > 0 && !question.options?.length && "choices-compact")} role="radiogroup" aria-label={`第 ${index + 1} 题选项`}>
                  {choices.map((option, optionIndex) => {
                    const letter = optionLetter(option, optionIndex);
                    const selected = value === letter;
                    const isAnswer = item && item.correctAnswer.trim().toUpperCase().startsWith(letter);
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={Boolean(grade)}
                        className={cx("choice", selected && "is-selected", item && isAnswer && "is-answer", item && selected && !isAnswer && "is-miss")}
                        onClick={() => setAnswer(question.id, selected ? "" : letter)}
                      >
                        <span className="opt-letter">{letter}</span>
                        {sharedOptions.length && !question.options?.length ? null : <span lang="en">{optionText(option)}</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  className="text-input"
                  value={value}
                  onChange={(event) => setAnswer(question.id, event.target.value)}
                  readOnly={Boolean(grade)}
                  placeholder="填写答案"
                  aria-label={`第 ${index + 1} 题答案`}
                  lang="en"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={80}
                />
              )}
              {item ? (
                <div className="feedback">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
                    {item.correct ? <CheckCircle2 aria-hidden className="size-5 text-[var(--green)]" /> : <XCircle aria-hidden className="size-5 text-[var(--orange)]" />}
                    <span>正确答案：<span lang="en">{item.correctAnswer}</span></span>
                    {!item.correct ? <span className="font-normal text-[var(--ink-soft)]">你的答案：{item.yourAnswer || "未作答"}</span> : null}
                  </p>
                  {item.explanation ? <p>{item.explanation}</p> : null}
                  {item.knowledge ? <p className="text-sm"><span className="tag tag-lime">考点</span> {item.knowledge}</p> : null}
                  {item.evidence ? <blockquote lang="en">{item.evidence}</blockquote> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div ref={resultRef} className={cx("submit-bar", !grade && "is-compact")}>
        {error ? <ErrorNote message={`${error} 你的答案已保留。`} onRetry={submit} /> : null}
        {grade ? (
          <div className="score-block">
            <p className="eyebrow">得分</p>
            <p className="score-num">
              {grade.score}
              <span> / {grade.maxScore}</span>
            </p>
            <p className="text-[var(--ink-soft)]">
              答对 {grade.items.filter((item) => item.correct).length} / {grade.items.length} 题
              {elapsed ? (<> · <Clock aria-hidden className="inline size-4" /> 计时 {formatClock(elapsed)}</>) : null}
            </p>
            <p className="meta-line mt-2" role="status">
              {collected ? `${collected} 道错题已自动加入错题集，可在「错题集」里挑战清除。` : "本次没有错题需要加入错题集。"}
            </p>
            <button type="button" className="btn btn-ghost mt-3" onClick={retry}>
              <RotateCcw aria-hidden className="size-4" /> 重新作答
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="meta-line">
              已作答 {answered} / {paper.questions.length}
            </p>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!answered || submitting || gradingExpired}>
              {submitting ? <Loading label="批改中…" /> : (<><Send aria-hidden className="size-4" /> 提交批改</>)}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}


