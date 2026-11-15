"use client";

import { Archive, CheckCircle2, Headphones, Lightbulb, RotateCcw, Search, Send, StopCircle, Swords, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseType } from "@/lib/learning-types";
import { api, errorText, isAbort, TYPE_LABEL, type ChallengeResponse } from "./api";
import { challengePrompt, KIND_LABEL, type MistakeEntry, type MistakeKind } from "./mistakes";
import type { TabId } from "./nav";
import { useProgress } from "./progress";
import { Empty, ErrorNote, Loading, SectionHeader, cx, formatDate } from "./ui";

type Shelf = "active" | "mastered";
type KindFilter = "all" | MistakeKind;
type TypeFilter = "all" | ExerciseType;
type SortMode = "recent" | "misses" | "oldest";
const SORT_LABEL: Record<SortMode, string> = { recent: "最近出错", misses: "错误次数最多", oldest: "最久未复习" };
const LIST_PAGE = 20;

function reviewHint(entry: MistakeEntry, now: number) {
  const days = Math.floor((now - Date.parse(entry.lastWrong)) / 86400000);
  if (!Number.isFinite(days)) return "";
  if (entry.misses >= 3) return "多次出错，建议先看解析和相关知识卡，再挑战。";
  if (days >= 7) return `已 ${days} 天未复习，建议今天挑战一次。`;
  if (days >= 1) return "隔天复习效果更好，可以现在挑战。";
  return "刚出错，建议明天再挑战一次检验是否记住。";
}
const KINDS: MistakeKind[] = ["exercise", "essay", "questions"];
const TYPES: ExerciseType[] = ["reading", "grammar", "seven", "cloze"];
const LETTERS = "ABCDEFG";
const MAX_ANSWER = 2500;

function optionLetter(option: string, index: number) {
  const match = option.match(/^\s*([A-G])[.．、)\s]/);
  return match ? match[1] : LETTERS[index] ?? String(index + 1);
}

function optionText(option: string) {
  return option.replace(/^\s*[A-G][.．、)]\s*/, "");
}

function sourceLabel(entry: MistakeEntry) {
  return entry.kind === "exercise" && entry.type ? TYPE_LABEL[entry.type] : KIND_LABEL[entry.kind];
}

export function MistakesView({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { progress, hydrated, masterMistake, restoreMistake } = useProgress();
  const [shelf, setShelf] = useState<Shelf>("active");
  const [kind, setKind] = useState<KindFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [shown, setShown] = useState(LIST_PAGE);
  const [now] = useState(() => Date.now());
  const [queue, setQueue] = useState<string[] | null>(null);
  const [position, setPosition] = useState(0);
  const [passed, setPassed] = useState(0);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [verdict, setVerdict] = useState<ChallengeResponse | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const all = useMemo(() => Object.values(progress.mistakes), [progress.mistakes]);
  const activeAll = all.filter((entry) => !entry.masteredAt);
  const masteredAll = all.filter((entry) => entry.masteredAt);
  const shelfItems = shelf === "active" ? activeAll : masteredAll;
  const needle = search.trim().toLowerCase();
  const visible = shelfItems
    .filter((entry) => (kind === "all" || entry.kind === kind) && (kind !== "exercise" || type === "all" || entry.type === type))
    .filter((entry) => !needle || `${entry.title} ${entry.knowledge} ${entry.prompt} ${entry.yourAnswer}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      if (sort === "misses") return b.misses - a.misses || b.lastWrong.localeCompare(a.lastWrong);
      if (sort === "oldest") return a.lastWrong.localeCompare(b.lastWrong);
      return shelf === "active" ? b.lastWrong.localeCompare(a.lastWrong) : (b.masteredAt ?? "").localeCompare(a.masteredAt ?? "");
    });
  const repeatCount = activeAll.filter((entry) => entry.misses >= 2).length;
  const staleCount = activeAll.filter((entry) => now - Date.parse(entry.lastWrong) >= 3 * 86400000).length;
  const selectedActive = selected.filter((id) => progress.mistakes[id] && !progress.mistakes[id].masteredAt);
  const currentId = queue ? queue[position] : undefined;
  const current = currentId ? progress.mistakes[currentId] : undefined;
  const finished = queue !== null && position >= queue.length;

  function toggleSelect(id: string) {
    setSelected((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
  }

  function resetAttempt() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setAnswer("");
    setError("");
    setVerdict(null);
    setPending(false);
  }

  function start(ids: string[]) {
    if (!ids.length) return;
    resetAttempt();
    setQueue(ids);
    setPosition(0);
    setPassed(0);
    window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function next() {
    resetAttempt();
    setPosition((value) => value + 1);
  }

  function exit() {
    resetAttempt();
    setQueue(null);
    setPosition(0);
    setSelected([]);
  }

  async function submit() {
    const studentAnswer = answer.trim();
    if (!current || !studentAnswer || pending || verdict?.correct) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setError("");
    setVerdict(null);
    try {
      const result = await api.challenge(
        {
          prompt: challengePrompt(current),
          ...(current.context ? { context: current.context.slice(0, 6000) } : {}),
          correctAnswer: current.correctAnswer.slice(0, 2500),
          studentAnswer: studentAnswer.slice(0, MAX_ANSWER),
          ...(current.explanation ? { explanation: current.explanation.slice(0, 2500) } : {}),
        },
        controller.signal,
      );
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      setVerdict(result);
      if (result.correct) {
        masterMistake(current.id);
        setPassed((value) => value + 1);
      }
    } catch (err) {
      if (controllerRef.current !== controller) return;
      setError(isAbort(err) ? "已取消判定，错题仍保留在错题集。" : `${errorText(err)} 错题仍保留在错题集。`);
    } finally {
      if (controllerRef.current === controller) setPending(false);
    }
  }

  return (
    <section className="view">
      <SectionHeader
        eyebrow="Mistakes"
        title="错题集"
        description="练习判分和 AI 批改中的错误会自动收进这里。挑战答对后移入「已掌握」，答错继续留在待复习。"
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate("dictation")}>
            <Headphones aria-hidden className="size-4" /> 听写错词复听
          </button>
        }
      />

      <div className="stat-grid mistakes-stats">
        <div className="stat">
          <p className="stat-label">待复习</p>
          <p className="stat-value">
            {hydrated ? activeAll.length : "—"}
            <span>道</span>
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">已掌握</p>
          <p className="stat-value">
            {hydrated ? masteredAll.length : "—"}
            <span>道</span>
          </p>
        </div>
      </div>

      {queue ? (
        <div ref={panelRef} className="card card-pad challenge scroll-mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sub-title m-0 flex items-center gap-2">
              <Swords aria-hidden className="size-5" /> 错题挑战 {finished ? "" : `· ${Math.min(position + 1, queue.length)} / ${queue.length}`}
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={exit}>
              结束挑战
            </button>
          </div>
          {finished ? (
            <div className="space-y-3">
              <p>
                本轮完成：通过 <strong>{passed}</strong> / {queue.length} 道。通过的题已移入「已掌握」。
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={exit}>
                  返回错题集
                </button>
              </div>
            </div>
          ) : !current || (current.masteredAt && !verdict?.correct) ? (
            <div className="space-y-3">
              <p className="hint">这道错题已不在待复习列表中。</p>
              <button type="button" className="btn btn-primary" onClick={next}>
                下一题
              </button>
            </div>
          ) : (
            <ChallengeCard
              entry={current}
              answer={answer}
              setAnswer={setAnswer}
              pending={pending}
              verdict={verdict}
              error={error}
              onSubmit={submit}
              onCancel={() => controllerRef.current?.abort()}
              onRetry={() => {
                setVerdict(null);
                setError("");
              }}
              onNext={next}
              isLast={position + 1 >= queue.length}
            />
          )}
        </div>
      ) : null}

      {!queue ? <>
      {hydrated && activeAll.length ? (
        <aside className="note note-info">
          <Lightbulb aria-hidden className="size-5 shrink-0" />
          <div className="min-w-0 space-y-1">
            <p>
              <strong className="font-semibold">复盘建议：</strong>
              {repeatCount ? `有 ${repeatCount} 道错了 2 次以上，按“错误次数最多”排序先攻克；` : ""}
              {staleCount ? `${staleCount} 道已超过 3 天没复习；` : ""}
              每次挑战 5–10 道，答错的会留在待复习。
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate("knowledge")}>
              查看知识卡
            </button>
          </div>
        </aside>
      ) : null}
      <div className="segmented" role="tablist" aria-label="错题分组">
        <button type="button" role="tab" aria-selected={shelf === "active"} className={cx("seg", shelf === "active" && "is-active")} onClick={() => { setShelf("active"); setShown(LIST_PAGE); }}>
          待复习 {activeAll.length}
        </button>
        <button type="button" role="tab" aria-selected={shelf === "mastered"} className={cx("seg", shelf === "mastered" && "is-active")} onClick={() => { setShelf("mastered"); setShown(LIST_PAGE); }}>
          <Archive aria-hidden className="size-4" /> 已掌握 {masteredAll.length}
        </button>
      </div>

      <div className="band-row" role="radiogroup" aria-label="来源筛选">
        {(["all", ...KINDS] as KindFilter[]).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={kind === value} className={cx("band-chip", kind === value && "is-active")} onClick={() => setKind(value)}>
            {value === "all" ? "全部来源" : KIND_LABEL[value]}
            <span className="band-count">{value === "all" ? shelfItems.length : shelfItems.filter((entry) => entry.kind === value).length}</span>
          </button>
        ))}
      </div>
      {kind === "exercise" ? (
        <div className="band-row" role="radiogroup" aria-label="题型筛选">
          {(["all", ...TYPES] as TypeFilter[]).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={type === value} className={cx("band-chip", type === value && "is-active")} onClick={() => setType(value)}>
              {value === "all" ? "全部题型" : TYPE_LABEL[value]}
              <span className="band-count">{shelfItems.filter((entry) => entry.kind === "exercise" && (value === "all" || entry.type === value)).length}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="vocab-toolbar">
        <label className="search">
          <Search aria-hidden className="size-[18px] shrink-0 text-[var(--ink-soft)]" />
          <span className="sr-only">搜索错题</span>
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setShown(LIST_PAGE); }} placeholder="搜索考点、题干或关键词" maxLength={40} enterKeyHint="search" />
          {search ? (
            <button type="button" className="icon-btn" onClick={() => setSearch("")} aria-label="清空搜索">
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
        </label>
        <label className="sort-field">
          <span className="sr-only">排序</span>
          <select className="select-input" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
            {(Object.keys(SORT_LABEL) as SortMode[]).map((value) => (
              <option key={value} value={value}>
                {SORT_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {needle ? <p className="meta-line" aria-live="polite">找到 {visible.length} 道</p> : null}

      {shelf === "active" && visible.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => start(selectedActive.length ? selectedActive : visible.map((entry) => entry.id))} disabled={pending}>
            <Swords aria-hidden className="size-4" />
            {selectedActive.length ? `挑战已选 ${selectedActive.length} 道` : `挑战当前筛选 ${visible.length} 道`}
          </button>
          {selectedActive.length ? (
            <button type="button" className="btn btn-ghost" onClick={() => setSelected([])}>
              清除选择
            </button>
          ) : null}
        </div>
      ) : null}

      {!hydrated ? (
        <Loading label="正在读取本机错题…" />
      ) : visible.length ? (
        <>
        <ol className="mistake-list">
          {visible.slice(0, shown).map((entry) => (
            <li key={entry.id} className="card mistake-card">
              <div className="flex flex-wrap items-center gap-2">
                {shelf === "active" ? (
                  <label className="mistake-select">
                    <input type="checkbox" checked={selected.includes(entry.id)} onChange={() => toggleSelect(entry.id)} />
                    <span className="sr-only">选择这道错题</span>
                  </label>
                ) : null}
                <span className="tag tag-green">{sourceLabel(entry)}</span>
                {entry.knowledge ? <span className="tag tag-lime">{entry.knowledge}</span> : null}
                <span className="tag">错 {entry.misses} 次</span>
                <span className="meta-line">{entry.masteredAt ? `掌握于 ${formatDate(entry.masteredAt)}` : `最近出错 ${formatDate(entry.lastWrong)}`}</span>
              </div>
              <p className="mistake-title">{entry.title}</p>
              {shelf === "active" ? <p className="review-hint">{reviewHint(entry, now)}</p> : null}
              <p className="mistake-prompt" lang="en">
                {entry.prompt}
              </p>
              {entry.options?.length ? (
                <ul className="mistake-options" lang="en">
                  {entry.options.map((option, index) => (
                    <li key={`${option}-${index}`}>
                      <span className="opt-letter">{optionLetter(option, index)}</span> {optionText(option)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <details className="mistake-details">
                <summary>查看答案与解析</summary>
                <div className="space-y-2 pt-2">
                  <p>
                    <span className="field-label">我的答案：</span>
                    <span lang="en">{entry.yourAnswer || "（未作答）"}</span>
                  </p>
                  <p>
                    <span className="field-label">正确答案：</span>
                    <span lang="en">{entry.correctAnswer}</span>
                  </p>
                  {entry.explanation ? <p className="mistake-explain">{entry.explanation}</p> : null}
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                {shelf === "active" ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => start([entry.id])}>
                    <Swords aria-hidden className="size-4" /> 挑战这道
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => restoreMistake(entry.id)}>
                    <RotateCcw aria-hidden className="size-4" /> 恢复到待复习
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
        {visible.length > shown ? (
          <div className="pager">
            <button type="button" className="btn btn-ghost" onClick={() => setShown((value) => value + LIST_PAGE)}>
              再显示 {Math.min(LIST_PAGE, visible.length - shown)} 道（已显示 {shown} / {visible.length}）
            </button>
          </div>
        ) : null}
        </>
      ) : (
        <Empty title={shelf === "active" ? (shelfItems.length ? "当前筛选下没有待复习错题" : "错题集是空的") : "还没有已掌握的错题"}>
          {shelf === "active" && !shelfItems.length ? <p>在「练习与命题」提交判分，或在作文/题目批改中拿到结果后，错误会自动加入这里。</p> : null}
        </Empty>
      )}
      </> : null}
    </section>
  );
}

function ChallengeCard({
  entry,
  answer,
  setAnswer,
  pending,
  verdict,
  error,
  onSubmit,
  onCancel,
  onRetry,
  onNext,
  isLast,
}: {
  entry: MistakeEntry;
  answer: string;
  setAnswer: (value: string) => void;
  pending: boolean;
  verdict: ChallengeResponse | null;
  error: string;
  onSubmit: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onNext: () => void;
  isLast: boolean;
}) {
  const locked = pending || Boolean(verdict);
  const options = entry.options ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag tag-green">{sourceLabel(entry)}</span>
        {entry.knowledge ? <span className="tag tag-lime">{entry.knowledge}</span> : null}
        <span className="meta-line">{entry.title}</span>
      </div>
      {entry.context ? (
        <details className="mistake-details">
          <summary>{entry.kind === "exercise" ? "查看原文 / 文章背景" : "查看原题与原文"}</summary>
          <div className="passage challenge-context" lang="en">
            {entry.context}
          </div>
        </details>
      ) : null}
      <p className="mistake-prompt" lang="en">
        {entry.prompt}
      </p>
      {options.length ? (
        <div className="choices" role="radiogroup" aria-label="选项">
          {options.map((option, index) => {
            const letter = optionLetter(option, index);
            const isSelected = answer === letter;
            return (
              <button key={`${option}-${index}`} type="button" role="radio" aria-checked={isSelected} disabled={locked} className={cx("choice", isSelected && "is-selected")} onClick={() => setAnswer(isSelected ? "" : letter)}>
                <span className="opt-letter">{letter}</span>
                <span lang="en">{optionText(option)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="field">
          <label htmlFor="challenge-answer" className="field-label">
            我的答案
          </label>
          <textarea
            id="challenge-answer"
            className="text-area challenge-input"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            readOnly={locked}
            maxLength={MAX_ANSWER}
            rows={entry.kind === "exercise" ? 2 : 3}
            lang="en"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={entry.kind === "essay" ? "写出修改后的正确表达" : "写出你的答案"}
          />
        </div>
      )}
      {error ? <ErrorNote message={error} onRetry={onSubmit} /> : null}
      {verdict ? (
        <div className={cx("note", verdict.correct ? "note-success" : "note-error")} role="status">
          {verdict.correct ? <CheckCircle2 aria-hidden className="size-5 shrink-0" /> : <XCircle aria-hidden className="size-5 shrink-0" />}
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">
              {verdict.correct ? "答对了！已移入「已掌握」。" : "还不对，这道题继续留在待复习。"}
              <span className="meta-line ml-2">{verdict.method === "exact" ? "按标准答案判定" : "AI 判定"}</span>
            </p>
            {verdict.explanation ? <p>{verdict.explanation}</p> : null}
            {verdict.correct ? (
              <p>
                参考答案：<span lang="en">{entry.correctAnswer}</span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {verdict ? (
          <>
            {!verdict.correct ? (
              <button type="button" className="btn btn-ghost" onClick={onRetry}>
                <RotateCcw aria-hidden className="size-4" /> 再试一次
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={onNext}>
              {isLast ? "完成本轮" : verdict.correct ? "下一题" : "跳过，下一题"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={pending || !answer.trim()}>
              {pending ? <Loading label="判定中…" /> : (<><Send aria-hidden className="size-4" /> 提交答案</>)}
            </button>
            {pending ? (
              <button type="button" className="btn btn-ghost" onClick={onCancel}>
                <StopCircle aria-hidden className="size-4" /> 取消
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={onNext}>
                {isLast ? "结束本轮" : "跳过"}
              </button>
            )}
          </>
        )}
      </div>
      {!options.length ? <p className="hint">与标准答案一致时直接判定；其他写法会发送给已配置的 AI 服务判断是否正确。</p> : null}
    </div>
  );
}
