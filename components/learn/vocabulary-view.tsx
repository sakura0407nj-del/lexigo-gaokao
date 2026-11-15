"use client";

import { ChevronLeft, ChevronRight, Info, Layers, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BAND_LABEL, errorText, isAbort, type Band } from "./api";
import { Flashcards, SESSION_SIZES } from "./flashcards";
import { useProgress } from "./progress";
import { dueIds } from "./review";
import { Empty, ErrorNote, Loading, SectionHeader, cx } from "./ui";
import type { SpeechState } from "./use-speech";
import { loadCatalog, POS_LABEL, queryWords, SOURCE_LABEL, type CatalogResult, type PosId, type RichWord, type RichWordsResponse, type VocabSort, type VocabSource } from "./vocab-api";
import { WordCard } from "./word-card";

type StateFilter = "all" | "starred" | "learned" | "due";

interface Filters {
  source: VocabSource;
  book: string;
  unit: string;
  pos: "all" | PosId;
  topic: string;
  band: Band;
  state: StateFilter;
  sort: VocabSort;
}

const DEFAULT_FILTERS: Filters = { source: "gaokao", book: "all", unit: "all", pos: "all", topic: "all", band: "all", state: "all", sort: "alpha" };
const BANDS: Band[] = ["all", "high", "medium", "low", "unknown"];
const LIMIT = 30;
const STATE_LABEL: Record<StateFilter, string> = { all: "全部", starred: "收藏", learned: "已掌握", due: "待复习" };
const SORT_LABEL: Record<VocabSort, string> = { alpha: "字母顺序", frequency: "词频从高到低", textbook: "教材顺序" };

export function VocabularyView({ speech, frequencyNote }: { speech: SpeechState; frequencyNote?: string }) {
  const { progress, hydrated } = useProgress();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<CatalogResult | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogRound, setCatalogRound] = useState(0);
  const [data, setData] = useState<RichWordsResponse | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; error: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sessionSize, setSessionSize] = useState<number>(20);
  const [session, setSession] = useState<{ words: RichWord[]; title: string } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");

  const extended = catalog?.extended ?? false;
  const due = useMemo(() => (hydrated ? dueIds(progress.review) : []), [hydrated, progress.review]);
  const stateIds = useMemo(() => {
    if (filters.state === "starred") return progress.starred;
    if (filters.state === "learned") return progress.learned;
    if (filters.state === "due") return due;
    return null;
  }, [filters.state, progress.starred, progress.learned, due]);
  const stateKey = stateIds ? stateIds.join(",") : "";
  const serverMode = filters.state === "all" || extended;
  const localFallback = filters.state !== "all" && !serverMode;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = input.trim().slice(0, 60);
      if (next === query) return;
      setQuery(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [input, query]);

  useEffect(() => {
    const controller = new AbortController();
    loadCatalog(controller.signal)
      .then((result) => {
        setCatalog(result);
        setCatalogError("");
      })
      .catch((err: unknown) => {
        if (!isAbort(err)) setCatalogError(errorText(err));
      });
    return () => controller.abort();
  }, [catalogRound]);

  const requestKey = JSON.stringify([filters, query, page, reload, extended, stateKey]);
  const waitingIds = filters.state !== "all" && !hydrated;
  const emptyIds = Boolean(stateIds && stateIds.length === 0);
  const loading = serverMode && !emptyIds && loaded?.key !== requestKey;
  const error = loaded?.key === requestKey ? loaded.error : "";

  useEffect(() => {
    if (!serverMode || waitingIds || emptyIds || (!catalog && !catalogError)) return;
    const controller = new AbortController();
    const key = requestKey;
    queryWords(
      {
        band: filters.band,
        q: query,
        page,
        limit: LIMIT,
        source: filters.source,
        book: filters.book,
        unit: filters.unit,
        pos: filters.pos,
        topic: filters.topic,
        sort: filters.sort,
        ...(stateIds ? { ids: stateIds } : {}),
      },
      extended,
      controller.signal,
    )
      .then((result) => {
        setData(result);
        setLoaded({ key, error: "" });
      })
      .catch((err: unknown) => {
        if (!isAbort(err)) setLoaded({ key, error: errorText(err) });
      });
    return () => controller.abort();
    // stateIds is captured through stateKey inside requestKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, serverMode, waitingIds, emptyIds, catalog, catalogError]);

  const localList = useMemo(() => {
    if (serverMode || !stateIds) return [];
    const needle = query.toLowerCase();
    return stateIds
      .map((id) => progress.words[id])
      .filter((word): word is NonNullable<typeof word> => Boolean(word))
      .filter((word) => filters.band === "all" || (word.frequencyBand ?? (word.rank > 0 ? word.frequency : 'unknown')) === filters.band)
      .filter((word) => !needle || word.word.toLowerCase().includes(needle) || word.translation.includes(query))
      .reverse();
  }, [serverMode, stateIds, progress.words, filters.band, query]);

  const books = catalog?.catalog.books ?? [];
  const selectedBook = books.find((book) => book.id === filters.book);
  const posFacets = useMemo(() => catalog?.catalog.pos ?? [], [catalog]);
  const topicFacets = useMemo(() => catalog?.catalog.topics ?? [], [catalog]);
  const topicLabels = useMemo(() => Object.fromEntries(topicFacets.map((item) => [item.id, item.label])), [topicFacets]);

  function update(patch: Partial<Filters>) {
    setFilters((current) => {
      const next = { ...current, ...patch };
      if (patch.book !== undefined && patch.book !== current.book) {
        next.unit = "all";
        if (patch.book !== "all") next.source = "textbook";
        else if (next.sort === "textbook") next.sort = "alpha";
      }
      if (patch.source !== undefined && patch.source === "gaokao" && current.book !== "all") {
        next.book = "all";
        next.unit = "all";
        if (next.sort === "textbook") next.sort = "alpha";
      }
      return next;
    });
    setPage(1);
  }

  function clearAll() {
    setFilters(DEFAULT_FILTERS);
    setInput("");
    setQuery("");
    setPage(1);
  }

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.source !== DEFAULT_FILTERS.source && filters.book === "all") chips.push({ key: "source", label: SOURCE_LABEL[filters.source], clear: () => update({ source: "gaokao" }) });
  if (selectedBook) chips.push({ key: "book", label: selectedBook.title, clear: () => update({ book: "all" }) });
  if (selectedBook && filters.unit !== "all") chips.push({ key: "unit", label: selectedBook.units.find((unit) => unit.id === filters.unit)?.title ?? filters.unit, clear: () => update({ unit: "all" }) });
  if (filters.pos !== "all") chips.push({ key: "pos", label: POS_LABEL[filters.pos], clear: () => update({ pos: "all" }) });
  if (filters.topic !== "all") chips.push({ key: "topic", label: topicLabels[filters.topic] ?? filters.topic, clear: () => update({ topic: "all" }) });
  if (filters.band !== "all") chips.push({ key: "band", label: BAND_LABEL[filters.band], clear: () => update({ band: "all" }) });
  if (filters.state !== "all") chips.push({ key: "state", label: STATE_LABEL[filters.state], clear: () => update({ state: "all" }) });
  if (query) chips.push({ key: "q", label: `“${query}”`, clear: () => setInput("") });

  const total = serverMode ? (emptyIds ? 0 : data?.total ?? 0) : localList.length;
  const pages = serverMode ? Math.max(1, data?.pages ?? 1) : 1;
  const items: RichWord[] = serverMode ? (emptyIds ? [] : data?.items ?? []) : localList;
  const note = data?.note || frequencyNote;
  const counts = emptyIds ? {high:0,medium:0,low:0,unknown:0} : data?.counts;
  const scopeTitle = chips.length ? chips.map((chip) => chip.label).join(" · ") : "高考词表";

  async function startSession() {
    if (sessionLoading) return;
    setSessionError("");
    if (!serverMode) {
      setSession({ words: shuffle(localList).slice(0, sessionSize), title: scopeTitle });
      return;
    }
    if (total <= items.length && page === 1) {
      setSession({ words: shuffle(items).slice(0, sessionSize), title: scopeTitle });
      return;
    }
    setSessionLoading(true);
    try {
      const result = await queryWords(
        { band: filters.band, q: query, sample: sessionSize, limit: sessionSize, source: filters.source, book: filters.book, unit: filters.unit, pos: filters.pos, topic: filters.topic, sort: filters.sort, ...(stateIds ? { ids: stateIds } : {}) },
        extended,
      );
      setSession({ words: result.items, title: scopeTitle });
    } catch (err) {
      setSessionError(errorText(err));
    } finally {
      setSessionLoading(false);
    }
  }

  if (session) {
    return (
      <section className="view">
        <Flashcards key={session.title + session.words.length} words={session.words} title={session.title} speech={speech} onExit={() => setSession(null)} />
      </section>
    );
  }

  return (
    <section className="view">
      <SectionHeader
        eyebrow="Vocabulary"
        title="分类词库"
        description="按 2019 人教版教材册别与单元、主题、词性、词频筛选高考词汇；收藏、掌握与复习记录保存在本机。"
      />

      {catalog ? (
        <div className="vocab-summary">
          <span>
            高考词表 <strong>{catalog.catalog.total.toLocaleString("zh-CN")}</strong> 词
          </span>
          {catalog.catalog.textbookEntries ? (
            <span>
              教材词条 <strong>{catalog.catalog.textbookEntries.toLocaleString("zh-CN")}</strong> 条 · {books.length} 册
            </span>
          ) : null}
          {extended && catalog.catalog.combinedWords !== catalog.catalog.total ? (
            <span>
              合并去重 <strong>{catalog.catalog.combinedWords.toLocaleString("zh-CN")}</strong> 词
            </span>
          ) : null}
        </div>
      ) : null}
      {catalogError ? <ErrorNote message={`分类目录加载失败：${catalogError}`} onRetry={() => { setCatalogError(""); setCatalogRound((value) => value + 1); }} /> : null}

      <div className="vocab-toolbar">
        <label className="search">
          <Search aria-hidden className="size-[18px] shrink-0 text-[var(--ink-soft)]" />
          <span className="sr-only">搜索单词</span>
          <input type="search" value={input} onChange={(event) => setInput(event.target.value)} placeholder="搜索英文或中文释义" maxLength={60} enterKeyHint="search" />
          {input ? (
            <button type="button" className="icon-btn" onClick={() => setInput("")} aria-label="清空搜索">
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
        </label>
        <button type="button" className={cx("btn btn-ghost filter-toggle", filtersOpen && "is-active-btn")} aria-expanded={filtersOpen} aria-controls="vocab-filters" onClick={() => setFiltersOpen((value) => !value)}>
          <SlidersHorizontal aria-hidden className="size-4" /> 筛选{chips.length ? ` · ${chips.length}` : ""}
        </button>
      </div>

      <div className="segmented" role="radiogroup" aria-label="学习状态">
        {(Object.keys(STATE_LABEL) as StateFilter[]).map((value) => {
          const count = value === "starred" ? progress.starred.length : value === "learned" ? progress.learned.length : value === "due" ? due.length : null;
          return (
            <button key={value} type="button" role="radio" aria-checked={filters.state === value} className={cx("seg", filters.state === value && "is-active")} onClick={() => update({ state: value })}>
              {STATE_LABEL[value]}
              {hydrated && count !== null ? <span className="band-count">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div id="vocab-filters" className={cx("filter-panel", filtersOpen && "is-open")}>
        {extended ? (
          <div className="filter-grid">
            <label className="field">
              <span className="field-label">词表来源</span>
              <select className="select-input" value={filters.book !== "all" ? "textbook" : filters.source} onChange={(event) => update({ source: event.target.value as VocabSource })} disabled={filters.book !== "all"}>
                {(Object.keys(SOURCE_LABEL) as VocabSource[]).map((value) => (
                  <option key={value} value={value}>
                    {SOURCE_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">教材册别（人教版 2019）</span>
              <select className="select-input" value={filters.book} onChange={(event) => update({ book: event.target.value })}>
                <option value="all">全部册别</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}（{book.wordCount}）
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">单元</span>
              <select className="select-input" value={filters.unit} onChange={(event) => update({ unit: event.target.value })} disabled={!selectedBook}>
                <option value="all">{selectedBook ? "全部单元" : "先选择册别"}</option>
                {selectedBook?.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.title}（{unit.count}）
                  </option>
                ))}
              </select>
            </label>
            {topicFacets.length ? (
              <label className="field">
                <span className="field-label">主题</span>
                <select className="select-input" value={filters.topic} onChange={(event) => update({ topic: event.target.value })}>
                  <option value="all">全部主题</option>
                  {topicFacets.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.label}（{data?.facets?.topics[topic.id] ?? topic.count}）
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {posFacets.length ? (
              <label className="field">
                <span className="field-label">词性</span>
                <select className="select-input" value={filters.pos} onChange={(event) => update({ pos: event.target.value as Filters["pos"] })}>
                  <option value="all">全部词性</option>
                  {posFacets.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {POS_LABEL[pos.id as PosId] ?? pos.label}（{data?.facets?.pos[pos.id] ?? pos.count}）
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field">
              <span className="field-label">排序</span>
              <select className="select-input" value={filters.sort} onChange={(event) => update({ sort: event.target.value as VocabSort })}>
                {(Object.keys(SORT_LABEL) as VocabSort[])
                  .filter((value) => value !== "textbook" || filters.book !== "all")
                  .map((value) => (
                    <option key={value} value={value}>
                      {SORT_LABEL[value]}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        ) : catalog ? (
          <p className="hint">教材、主题与词性分类正在接入，当前可按词频、学习状态和关键词筛选。</p>
        ) : null}
        <div className="field">
          <span className="field-label">词频分层（按通用语料估算）</span>
          <div className="band-row" role="radiogroup" aria-label="词频分层">
            {BANDS.map((value) => {
              const count = counts ? (value === "all" ? counts.high + counts.medium + counts.low + (counts.unknown ?? 0) : counts[value]) : undefined;
              return (
                <button key={value} type="button" role="radio" aria-checked={filters.band === value} className={cx("band-chip", filters.band === value && "is-active")} onClick={() => update({ band: value })}>
                  {BAND_LABEL[value]}
                  {count !== undefined ? <span className="band-count">{count.toLocaleString("zh-CN")}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        {note ? (
          <details className="inline-note">
            <summary>
              <Info aria-hidden className="size-4" /> 关于词频与词表来源
            </summary>
            <p>{note}</p>
            {catalog?.catalog.note && catalog.catalog.note !== note ? <p>{catalog.catalog.note}</p> : null}
          </details>
        ) : null}
      </div>

      {chips.length ? (
        <div className="chip-row" aria-label="已选筛选条件">
          {chips.map((chip) => (
            <button key={chip.key} type="button" className="filter-chip" onClick={chip.clear} aria-label={`移除筛选：${chip.label}`}>
              {chip.label}
              <X aria-hidden className="size-3.5" />
            </button>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
            清除全部
          </button>
        </div>
      ) : null}

      <div className="study-launch">
        <div className="min-w-0">
          <p className="font-semibold">
            <Layers aria-hidden className="mr-1 inline size-4" /> 卡片背词
          </p>
          <p className="hint">从当前筛选结果{total ? `（${total.toLocaleString("zh-CN")} 词）` : ""}中抽取，先回想再翻面。</p>
        </div>
        <div className="study-launch-actions flex flex-wrap items-center gap-2">
          <div className="segmented" role="radiogroup" aria-label="每轮张数">
            {SESSION_SIZES.map((size) => (
              <button key={size} type="button" role="radio" aria-checked={sessionSize === size} className={cx("seg", sessionSize === size && "is-active")} onClick={() => setSessionSize(size)}>
                {size}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={startSession} disabled={!total || sessionLoading || loading}>
            {sessionLoading ? <Loading label="准备中…" /> : "开始"}
          </button>
        </div>
        {sessionError ? <ErrorNote message={sessionError} onRetry={startSession} /> : null}
      </div>

      {localFallback && hydrated ? (
        <p className="hint">
          {extended ? `记录较多（${stateIds?.length ?? 0} 词），按本机保存的词条筛选；教材、主题和词性条件暂不作用于此列表。` : "按本机保存的词条筛选；教材、主题和词性条件暂不作用于此列表。"}
        </p>
      ) : null}
      {error ? <ErrorNote message={error} onRetry={() => setReload((value) => value + 1)} /> : null}
      {waitingIds ? (
        <Loading label="正在读取本机记录…" />
      ) : loading && !data ? (
        <Loading label="正在载入词库…" />
      ) : !error ? (
        <>
          <p className="meta-line" aria-live="polite">
            共 {total.toLocaleString("zh-CN")} 个词{serverMode && pages > 1 ? ` · 第 ${Math.min(page, pages)} / ${pages} 页` : ""}
            {loading ? " · 更新中…" : ""}
          </p>
          {items.length ? (
            <div className={cx("word-grid", loading && "opacity-60")}>
              {items.map((word) => (
                <WordCard key={word.id} word={word} speech={speech} topicLabels={topicLabels} />
              ))}
            </div>
          ) : (
            <Empty title={filters.state === "starred" ? "还没有收藏的词" : filters.state === "learned" ? "还没有标记已掌握的词" : filters.state === "due" ? "今天没有待复习的词" : "没有找到匹配的词"}>
              {filters.state === "due" ? "用卡片背词或标记已掌握后，系统会按 1/3/7/14/30 天安排复习。" : filters.state !== "all" ? "在词库中点击星标或对勾即可加入。记录只保存在这台设备的浏览器里。" : "换个关键词，或减少筛选条件试试。"}
              {chips.length ? (
                <div className="pt-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
                    清除全部筛选
                  </button>
                </div>
              ) : null}
            </Empty>
          )}
          {serverMode && pages > 1 ? (
            <nav className="pager" aria-label="分页">
              <button type="button" className="btn btn-ghost" disabled={page <= 1 || loading} onClick={() => { setPage((value) => Math.max(1, value - 1)); window.scrollTo({ top: 0 }); }}>
                <ChevronLeft aria-hidden className="size-4" /> 上一页
              </button>
              <span className="pager-info">
                {Math.min(page, pages)} / {pages}
              </span>
              <button type="button" className="btn btn-ghost" disabled={page >= pages || loading} onClick={() => { setPage((value) => Math.min(pages, value + 1)); window.scrollTo({ top: 0 }); }}>
                下一页 <ChevronRight aria-hidden className="size-4" />
              </button>
            </nav>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}
