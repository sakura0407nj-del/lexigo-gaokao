"use client";

import { BookOpenText, Search, SlidersHorizontal, Sparkles, StopCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseType, Paper } from "@/lib/learning-types";
import { api, errorText, isAbort, ORIGIN_LABEL, TYPE_LABEL, type BankResponse, type Level, type Origin } from "./api";
import { activeMistakes, pickWeaknesses, toWeakness } from "./mistakes";
import { PaperPlayer } from "./paper-player";
import { answeredCount, clearDraft, readDraft, type PracticeDraft } from "./practice-draft";
import { useProgress } from "./progress";
import { Empty, ErrorNote, Loading, SectionHeader, cx, formatDate } from "./ui";

type Filter = "all" | ExerciseType;
type OriginFilter = "all" | Origin;
type DoneFilter = "all" | "todo" | "done";
const PAGE = 12;

function paperYear(source: string, title: string, origin: Origin) {
  if (origin !== "past") return "";
  const match = `${title} ${source}`.match(/\b(19[89]\d|20[0-4]\d)\b/);
  return match ? match[1] : "";
}
const TYPES: ExerciseType[] = ["reading", "grammar", "seven", "cloze"];
const LEVELS: Level[] = ["基础", "标准", "挑战"];
const TOPIC_IDEAS = ["校园生活", "科技与创新", "环境保护", "传统文化", "体育健康", "志愿服务"];

export function PracticeView({ bank, bankError, onReloadBank, aiNotice }: { bank: BankResponse | null; bankError: string; onReloadBank: () => void; aiNotice?: string }) {
  const [mode, setMode] = useState<"bank" | "generate">("bank");
  const [filter, setFilter] = useState<Filter>("all");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [paper, setPaper] = useState<Paper | null>(null);
  const [resume, setResume] = useState<PracticeDraft | null>(null);
  const [draftState, setDraft] = useState<PracticeDraft | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState<"all" | Level>("all");
  const [doneFilter, setDoneFilter] = useState<DoneFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [lastOpened, setLastOpened] = useState("");
  const [loadingId, setLoadingId] = useState("");
  const [paperError, setPaperError] = useState("");
  const [genType, setGenType] = useState<ExerciseType>("reading");
  const [genLevel, setGenLevel] = useState<Level>("标准");
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [genSeconds, setGenSeconds] = useState(0);
  const [targeted, setTargeted] = useState(false);
  const { progress, hydrated } = useProgress();
  const draft = draftState === undefined ? (hydrated ? readDraft() : null) : draftState;
  const activeCount = useMemo(() => activeMistakes(progress.mistakes).length, [progress.mistakes]);
  const picked = useMemo(() => (targeted ? pickWeaknesses(progress.mistakes, genType) : []), [targeted, progress.mistakes, genType]);
  const controllerRef = useRef<AbortController | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function closePaper() {
    setPaper(null);
    setResume(null);
    setDraft(readDraft());
  }

  useEffect(() => {
    if (!generating) return;
    const timer = window.setInterval(() => setGenSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  const bestScores = useMemo(() => {
    const map = new Map<string, string>();
    const best = new Map<string, number>();
    for (const record of progress.practice) {
      const ratio = record.maxScore ? record.score / record.maxScore : 0;
      if ((best.get(record.paperId) ?? -1) < ratio) {
        best.set(record.paperId, ratio);
        map.set(record.paperId, `${record.score}/${record.maxScore}`);
      }
    }
    return map;
  }, [progress.practice]);
  const years = useMemo(() => Array.from(new Set((bank?.papers ?? []).map((item) => paperYear(item.source, item.title, item.origin)).filter(Boolean))).sort().reverse(), [bank]);
  const needle = search.trim().toLowerCase();
  const papers = (bank?.papers ?? []).filter(
    (item) =>
      (filter === "all" || item.type === filter) &&
      (originFilter === "all" || item.origin === originFilter) &&
      (levelFilter === "all" || item.level === levelFilter) &&
      (yearFilter === "all" || paperYear(item.source, item.title, item.origin) === yearFilter) &&
      (doneFilter === "all" || (doneFilter === "done") === bestScores.has(item.id)) &&
      (!needle || `${item.title} ${item.topic} ${item.source}`.toLowerCase().includes(needle)),
  );
  const activeFilters = [filter !== "all", originFilter !== "all", levelFilter !== "all", yearFilter !== "all", doneFilter !== "all"].filter(Boolean).length;

  function resetFilters() {
    setFilter("all");
    setOriginFilter("all");
    setLevelFilter("all");
    setYearFilter("all");
    setDoneFilter("all");
    setSearch("");
    setShown(PAGE);
  }

  function resumeDraft() {
    const current = readDraft();
    if (!current) {
      setDraft(null);
      return;
    }
    setResume(current);
    setPaper(current.paper);
  }

  function discardDraft() {
    clearDraft();
    setDraft(null);
  }
  const originsPresent = (["past", "original"] as Origin[]).filter((origin) => bank?.papers.some((item) => item.origin === origin));

  async function openPaper(id: string) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoadingId(id);
    setLastOpened(id);
    setPaperError("");
    const saved = readDraft();
    if (saved && saved.paper.id === id && !saved.paper.sealed) {
      setLoadingId("");
      setResume(saved);
      setPaper(saved.paper);
      return;
    }
    try {
      const result = await api.paper(id, controller.signal);
      setResume(null);
      setPaper(result);
      window.setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    } catch (err) {
      if (!isAbort(err)) setPaperError(errorText(err));
    } finally {
      setLoadingId("");
    }
  }

  async function generate() {
    const cleanTopic = topic.trim();
    if (!cleanTopic || cleanTopic.length > 40 || generating) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setGenerating(true);
    setGenSeconds(0);
    setGenError("");
    try {
      const result = await api.generate({ type: genType, level: genLevel, topic: cleanTopic, ...(targeted && picked.length ? { weaknesses: picked.map(toWeakness) } : {}) }, controller.signal);
      setResume(null);
      setPaper(result);
      window.setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    } catch (err) {
      if (!isAbort(err)) setGenError(errorText(err));
      else setGenError("已停止等待结果。服务器端可能仍在处理，主题与设置已保留，可重新生成。");
    } finally {
      setGenerating(false);
    }
  }

  function cancel() {
    controllerRef.current?.abort();
  }

  return (
    <section className="view">
      <div ref={topRef} className="scroll-mt-6" />
      <SectionHeader eyebrow="Practice" title="练习与命题" description="做历年真题或原创模拟，提交后由服务器判分并给出逐题解析；也可以按主题和难度让 AI 命一套新题。" />

      {paper ? (
        <PaperPlayer
          key={`${paper.id}-${paper.sealed ?? ""}-${resume?.savedAt ?? ""}`}
          paper={paper}
          initialAnswers={resume?.paper.id === paper.id ? resume.answers : undefined}
          initialElapsed={resume?.paper.id === paper.id ? resume.elapsed : 0}
          restored={resume?.paper.id === paper.id}
          onBack={closePaper}
        />
      ) : (
        <>
          <div className="segmented" role="tablist" aria-label="练习方式">
            <button type="button" role="tab" aria-selected={mode === "bank"} className={cx("seg", mode === "bank" && "is-active")} onClick={() => setMode("bank")}>
              <BookOpenText aria-hidden className="size-4" /> 题库
            </button>
            <button type="button" role="tab" aria-selected={mode === "generate"} className={cx("seg", mode === "generate" && "is-active")} onClick={() => setMode("generate")}>
              <Sparkles aria-hidden className="size-4" /> AI 命题
            </button>
          </div>

          {mode === "bank" ? (
            <>
              {draft && !paper ? (
                <div className="draft-banner" role="status">
                  <div className="min-w-0">
                    <p className="font-semibold">有未提交的作答草稿</p>
                    <p className="hint truncate">
                      {draft.paper.title} · 已答 {answeredCount(draft)} / {draft.paper.questions.length} 题{draft.elapsed ? ` · 计时 ${Math.floor(draft.elapsed / 60)} 分钟` : ""} · {formatDate(draft.savedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary btn-sm" onClick={resumeDraft}>
                      继续作答
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={discardDraft}>
                      丢弃草稿
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="vocab-toolbar">
                <label className="search">
                  <Search aria-hidden className="size-[18px] shrink-0 text-[var(--ink-soft)]" />
                  <span className="sr-only">搜索练习</span>
                  <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setShown(PAGE); }} placeholder="搜索标题、主题或来源" maxLength={40} enterKeyHint="search" />
                  {search ? (
                    <button type="button" className="icon-btn" onClick={() => { setSearch(""); setShown(PAGE); }} aria-label="清空搜索">
                      <X aria-hidden className="size-4" />
                    </button>
                  ) : null}
                </label>
                <button type="button" className={cx("btn btn-ghost filter-toggle", filtersOpen && "is-active-btn")} aria-expanded={filtersOpen} aria-controls="practice-filters" onClick={() => setFiltersOpen((value) => !value)}>
                  <SlidersHorizontal aria-hidden className="size-4" /> 筛选{activeFilters ? ` · ${activeFilters}` : ""}
                </button>
              </div>

              <div className="band-row" role="radiogroup" aria-label="题型筛选">
                {(["all", ...TYPES] as Filter[]).map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={filter === value} className={cx("band-chip", filter === value && "is-active")} onClick={() => { setFilter(value); setShown(PAGE); }}>
                    {value === "all" ? "全部题型" : TYPE_LABEL[value]}
                    {bank ? <span className="band-count">{value === "all" ? bank.papers.length : bank.papers.filter((item) => item.type === value).length}</span> : null}
                  </button>
                ))}
              </div>

              <div id="practice-filters" className={cx("filter-panel", filtersOpen && "is-open")}>
                <div className="filter-grid">
                  <label className="field">
                    <span className="field-label">来源</span>
                    <select className="select-input" value={originFilter} onChange={(event) => { setOriginFilter(event.target.value as OriginFilter); setShown(PAGE); }}>
                      <option value="all">全部来源</option>
                      {originsPresent.map((origin) => (
                        <option key={origin} value={origin}>
                          {ORIGIN_LABEL[origin]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">真题年份</span>
                    <select className="select-input" value={yearFilter} onChange={(event) => { setYearFilter(event.target.value); setShown(PAGE); }} disabled={!years.length}>
                      <option value="all">{years.length ? "全部年份" : "暂无年份信息"}</option>
                      {years.map((year) => (
                        <option key={year} value={year}>
                          {year} 年
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">难度</span>
                    <select className="select-input" value={levelFilter} onChange={(event) => { setLevelFilter(event.target.value as "all" | Level); setShown(PAGE); }}>
                      <option value="all">全部难度</option>
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">完成情况</span>
                    <select className="select-input" value={doneFilter} onChange={(event) => { setDoneFilter(event.target.value as DoneFilter); setShown(PAGE); }}>
                      <option value="all">全部</option>
                      <option value="todo">未做过</option>
                      <option value="done">做过</option>
                    </select>
                  </label>
                </div>
                <p className="hint">年份只从带年份的真题来源中读取；原创模拟没有年份。</p>
              </div>

              {activeFilters || search ? (
                <div className="chip-row">
                  <span className="meta-line">找到 {papers.length} 组练习</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
                    清除筛选
                  </button>
                </div>
              ) : null}

              {bank?.note ? <p className="hint">{bank.note}</p> : null}
              {bankError ? <ErrorNote message={bankError} onRetry={onReloadBank} /> : null}
              {paperError ? <ErrorNote message={paperError} onRetry={lastOpened ? () => openPaper(lastOpened) : undefined} /> : null}
              {!bank && !bankError ? <Loading label="正在载入题库…" /> : null}
              {bank ? (
                papers.length ? (
                  <>
                    <div className="paper-grid">
                      {papers.slice(0, shown).map((item) => {
                        const best = bestScores.get(item.id);
                        return (
                          <button key={item.id} type="button" className="paper-card" onClick={() => openPaper(item.id)} disabled={Boolean(loadingId)}>
                            <span className="flex flex-wrap gap-2">
                              <span className="tag tag-green">{TYPE_LABEL[item.type]}</span>
                              <span className="tag">{item.level}</span>
                              <span className={cx("tag", item.origin === "past" ? "tag-lime" : item.origin === "ai" ? "tag-orange" : "")}>{ORIGIN_LABEL[item.origin]}</span>
                              {best ? <span className="tag tag-done">最好 {best}</span> : null}
                              {draft?.paper.id === item.id ? <span className="tag tag-orange">有草稿</span> : null}
                            </span>
                            <span className="paper-card-title">{item.title}</span>
                            {item.origin === "past" && item.source ? <span className="hint">{item.source}</span> : null}
                            <span className="meta-line">
                              {item.topic} · {item.questionCount} 题 · 约 {item.minutes} 分钟
                            </span>
                            <span className="paper-card-foot">{loadingId === item.id ? <Loading label="打开中…" /> : draft?.paper.id === item.id ? "继续草稿 →" : "开始练习 →"}</span>
                          </button>
                        );
                      })}
                    </div>
                    {papers.length > shown ? (
                      <div className="pager">
                        <button type="button" className="btn btn-ghost" onClick={() => setShown((value) => value + PAGE)}>
                          再显示 {Math.min(PAGE, papers.length - shown)} 组（已显示 {shown} / {papers.length}）
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Empty title="没有符合条件的练习">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
                      清除筛选
                    </button>
                  </Empty>
                )
              ) : null}
            </>
          ) : (
            <div className="card card-pad space-y-6">
              <p className="note note-warn">AI 命题为原创模拟练习，不是高考真题；结果仅供练习参考，请结合解析判断。高峰时可能需要排队，通常 1–2 分钟。</p>
              {aiNotice ? <p className="note note-info">{aiNotice}</p> : null}
              <fieldset className="field">
                <legend className="field-label">题型</legend>
                <div className="segmented">
                  {TYPES.map((value) => (
                    <button key={value} type="button" className={cx("seg", genType === value && "is-active")} aria-pressed={genType === value} onClick={() => setGenType(value)} disabled={generating}>
                      {TYPE_LABEL[value]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="field">
                <legend className="field-label">难度</legend>
                <div className="segmented">
                  {LEVELS.map((value) => (
                    <button key={value} type="button" className={cx("seg", genLevel === value && "is-active")} aria-pressed={genLevel === value} onClick={() => setGenLevel(value)} disabled={generating}>
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <label htmlFor="gen-topic" className="field-label">
                  主题
                </label>
                <input id="gen-topic" className="text-input" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={40} placeholder="例如：校园生活、人工智能、非遗文化" disabled={generating} />
                <div className="flex flex-wrap gap-2 pt-1">
                  {TOPIC_IDEAS.map((idea) => (
                    <button key={idea} type="button" className="chip-btn" onClick={() => setTopic(idea)} disabled={generating}>
                      {idea}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label className="switch-line">
                  <input type="checkbox" checked={targeted && activeCount > 0} onChange={(event) => setTargeted(event.target.checked)} disabled={generating || activeCount === 0} />
                  <span>根据错题集针对性命题（错题集待复习 {activeCount} 道）</span>
                </label>
                {activeCount === 0 ? (
                  <p className="hint">错题集还是空的。做练习或批改后，错题会自动收集，之后就可以按错题命题。</p>
                ) : targeted ? (
                  <div className="space-y-2">
                    <p className="hint">将选取 {picked.length} 道待复习错题（优先{TYPE_LABEL[genType]}）的考点发给 AI，AI 会围绕这些考点出一套新的相关题目，不会照搬原题。</p>
                    <div className="flex flex-wrap gap-2">
                      {picked.map((entry) => (
                        <span key={entry.id} className="tag tag-lime weak-chip" title={entry.prompt}>
                          {entry.knowledge || entry.title}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              {genError ? <ErrorNote message={genError} /> : null}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-primary" onClick={generate} disabled={generating || !topic.trim()}>
                  {generating ? <Loading label={`正在命题… ${genSeconds}s`} /> : (<><Sparkles aria-hidden className="size-4" /> 生成一套练习</>)}
                </button>
                {generating ? (
                  <button type="button" className="btn btn-ghost" onClick={cancel}>
                    <StopCircle aria-hidden className="size-4" /> 取消
                  </button>
                ) : null}
              </div>
              <p className="hint">主题{targeted && activeCount ? "和所选错题的考点" : "等内容"}会发送给已配置的第三方 AI 模型服务用于命题。</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}


