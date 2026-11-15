"use client";

import { ArrowRight, BookOpen, CheckCircle2, Download, Headphones, ListChecks, Play, RotateCcw, SkipForward, Square, Trash2, Volume2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Word } from "@/lib/learning-types";
import { api, BAND_LABEL, errorText, isAbort, type Band, type DictationOrder, type Textbook, type TextbooksResponse } from "./api";
import { todayKey, useProgress, type DictationAttempt } from "./progress";
import { Empty, ErrorNote, Loading, SectionHeader, cx, downloadText, formatDate } from "./ui";
import type { Accent, SpeechState } from "./use-speech";

type Phase = "setup" | "loading" | "running" | "done";
type Source = "textbook" | "frequency" | "wrong";
type Count = 5 | 10 | 20 | 50 | "all";
type Rate = 0.7 | 0.85 | 1;

interface Result {
  word: Word;
  answer: string;
  correct: boolean;
  skipped: boolean;
}

interface SessionMeta {
  source: Source;
  scope: string;
  band: string;
  book?: string;
  units?: string[];
  retry?: boolean;
}

const COUNTS: Count[] = [5, 10, 20, 50, "all"];
const FREQ_COUNTS = [5, 10, 20, 50] as const;
const RATES: [Rate, string][] = [
  [0.7, "慢速 0.7×"],
  [0.85, "稍慢 0.85×"],
  [1, "正常 1×"],
];
const SOURCE_LABEL: Record<Source, string> = { textbook: "教材分单元", frequency: "通用词频", wrong: "错词复听" };
const DEFAULT_BOOK = "pep2019-compulsory-1";

export function normalizeAnswer(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u02bc\u2032`\u00b4]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isAccepted(answer: string, word: Word) {
  const given = normalizeAnswer(answer);
  if (!given) return false;
  return [word.word, ...(word.accepted ?? [])].some((target) => normalizeAnswer(target) === given);
}

function speakable(text: string) {
  return text
    .replace(/\bsb\.?(?=\s|$|')/gi, "somebody")
    .replace(/\bsth\.?(?=\s|$|')/gi, "something")
    .replace(/[/()（）…]+/g, " ");
}

function shuffle<T>(list: T[]) {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export function DictationView({ speech }: { speech: SpeechState }) {
  const { progress, hydrated, recordDictation, removeWrong } = useProgress();
  const [source, setSource] = useState<Source>("textbook");
  const [catalog, setCatalog] = useState<TextbooksResponse | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogRound, setCatalogRound] = useState(0);
  const [bookId, setBookId] = useState(DEFAULT_BOOK);
  const [unitsByBook, setUnitsByBook] = useState<Record<string, string[]>>({});
  const [count, setCount] = useState<Count>(10);
  const [order, setOrder] = useState<DictationOrder>("textbook");
  const [includePhrases, setIncludePhrases] = useState(true);
  const [band, setBand] = useState<Band>("high");
  const [freqSize, setFreqSize] = useState<(typeof FREQ_COUNTS)[number]>(10);
  const [accent, setAccent] = useState<Accent>("en-US");
  const [rate, setRate] = useState<Rate>(0.85);
  const [repeat, setRepeat] = useState<1 | 2 | 3>(2);
  const [showChinese, setShowChinese] = useState(false);

  const [phase, setPhase] = useState<Phase>("setup");
  const [items, setItems] = useState<Word[]>([]);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [endedEarly, setEndedEarly] = useState(false);
  const [error, setError] = useState("");
  const [speakFailed, setSpeakFailed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const { stop } = speech;

  const audioOk = speech.supported && speech.hasEnglish && !speakFailed;
  const current = items[index];
  const wrongList = useMemo(() => Object.values(progress.wrongbook).sort((a, b) => b.misses - a.misses), [progress.wrongbook]);
  const books = useMemo(() => catalog?.books ?? [], [catalog]);
  const book: Textbook | undefined = books.find((item) => item.id === bookId) ?? books[0];
  const units = book ? (unitsByBook[book.id] ?? (book.units[0] ? [book.units[0].id] : [])) : [];
  const selectedUnits = book ? book.units.filter((unit) => units.includes(unit.id)) : [];
  const allSelected = !!book && book.units.length > 0 && selectedUnits.length === book.units.length;
  const selectedCount = selectedUnits.reduce((sum, unit) => sum + unit.count, 0);

  useEffect(
    () => () => {
      stop();
      controllerRef.current?.abort();
    },
    [stop],
  );

  useEffect(() => {
    const controller = new AbortController();
    api
      .textbooks(controller.signal)
      .then((data) => {
        setCatalog(data);
        setCatalogError("");
      })
      .catch((err: unknown) => {
        if (!isAbort(err)) setCatalogError(errorText(err));
      });
    return () => controller.abort();
  }, [catalogRound]);

  useEffect(() => {
    if (phase !== "running") return;
    if (revealed) nextRef.current?.focus();
    else inputRef.current?.focus();
  }, [phase, revealed, index]);

  const unitTitle = useCallback(
    (word: Word) => {
      if (!word.book && !word.unit) return "";
      const owner = books.find((item) => item.id === word.book);
      const unit = owner?.units.find((item) => item.id === word.unit);
      return [owner?.title, unit?.title ?? word.unit].filter(Boolean).join(" · ");
    },
    [books],
  );

  function say(word: Word | undefined, times: number) {
    if (!word) return;
    const ok = speech.speak(speakable(word.word), {
      accent,
      rate,
      repeat: times,
      gapMs: 1000,
      onEnd: () => setSpeaking(false),
      onError: () => {
        setSpeaking(false);
        setSpeakFailed(true);
      },
    });
    setSpeaking(ok);
    if (!ok && speech.supported && speech.hasEnglish) setSpeakFailed(true);
  }

  function launch(list: Word[], sessionMeta: SessionMeta) {
    setItems(list);
    setMeta(sessionMeta);
    setIndex(0);
    setAnswer("");
    setRevealed(false);
    setResults([]);
    setEndedEarly(false);
    setHintOpen(false);
    setPhase("running");
    say(list[0], repeat);
  }

  function setBookUnits(list: string[]) {
    if (!book) return;
    setUnitsByBook((prev) => ({ ...prev, [book.id]: list }));
  }

  function toggleUnit(id: string) {
    setBookUnits(units.includes(id) ? units.filter((item) => item !== id) : [...units, id]);
  }

  function selectAll() {
    if (!book) return;
    setBookUnits(allSelected ? (book.units[0] ? [book.units[0].id] : []) : book.units.map((unit) => unit.id));
  }
  async function start() {
    setError("");
    speech.prime();
    if (source === "wrong") {
      const pool = shuffle(wrongList.map((entry) => entry.word));
      const picked = count === "all" ? pool : pool.slice(0, count);
      if (!picked.length) return;
      launch(picked, { source, band: "wrongbook", scope: `错词复听 · ${picked.length} 词` });
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("loading");
    try {
      if (source === "frequency") {
        const data = await api.sample(band, freqSize, controller.signal);
        const picked = data.items.slice(0, freqSize);
        if (!picked.length) {
          setError("这个词频分层暂时没有可用的词。");
          setPhase("setup");
          return;
        }
        launch(picked, { source, band, scope: `通用词频 · ${BAND_LABEL[band]}` });
        return;
      }
      if (!book || !selectedUnits.length) {
        setError("请先选择至少一个单元。");
        setPhase("setup");
        return;
      }
      const data = await api.dictation(
        { book: book.id, units: allSelected ? "all" : selectedUnits.map((unit) => unit.id), count, order, includePhrases },
        controller.signal,
      );
      const picked = count === "all" ? data.items : data.items.slice(0, count);
      if (!picked.length) {
        setError(includePhrases ? "所选单元暂时没有可听写的词条。" : "关闭词组后所选单元没有单词了，可以打开“包含词组”再试。");
        setPhase("setup");
        return;
      }
      const fallbackScope = `${book.title} · ${allSelected ? "全部单元" : selectedUnits.map((unit) => unit.title).join("、")}`;
      launch(picked, {
        source,
        band: book.id,
        book: book.id,
        units: selectedUnits.map((unit) => unit.id),
        scope: data.scope || fallbackScope,
      });
    } catch (err) {
      if (isAbort(err)) return;
      setError(errorText(err));
      setPhase("setup");
    }
  }

  function grade(skipped: boolean) {
    if (!current || revealed) return;
    const correct = !skipped && isAccepted(answer, current);
    setResults((list) => [...list, { word: current, answer: skipped ? "" : answer.trim(), correct, skipped }]);
    setRevealed(true);
    setSpeaking(false);
    stop();
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (revealed) {
      next();
      return;
    }
    if (!answer.trim()) return;
    grade(false);
  }

  function finish(finalResults: Result[], early: boolean) {
    stop();
    setSpeaking(false);
    setEndedEarly(early);
    if (!finalResults.length || !meta) {
      setPhase("setup");
      setItems([]);
      return;
    }
    recordDictation(
      {
        band: meta.band,
        total: finalResults.length,
        correct: finalResults.filter((item) => item.correct).length,
        source: meta.source === "wrong" ? "wrongbook" : meta.source,
        scope: meta.retry ? `${meta.scope} · 错词重练` : meta.scope,
        planned: items.length,
        ...(meta.book ? { book: meta.book } : {}),
        ...(meta.units ? { units: meta.units } : {}),
      },
      finalResults,
    );
    if (meta.source === "wrong" || meta.retry) finalResults.filter((item) => item.correct).forEach((item) => removeWrong(item.word.id));
    setPhase("done");
  }

  function next() {
    if (index + 1 >= items.length) {
      finish(results, false);
      return;
    }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    setAnswer("");
    setRevealed(false);
    setHintOpen(false);
    say(items[nextIndex], repeat);
  }

  function retryWrong() {
    if (!meta) return;
    const wrongWords = results.filter((item) => !item.correct).map((item) => item.word);
    if (!wrongWords.length) return;
    speech.prime();
    launch(wrongWords, { ...meta, retry: true });
  }

  function backToSetup() {
    stop();
    setSpeaking(false);
    setPhase("setup");
    setItems([]);
    setResults([]);
  }

  function exportReport() {
    if (!meta) return;
    const right = results.filter((item) => item.correct).length;
    const lines = [
      "拾词 LexiGo 听写报告",
      `时间：${new Date().toLocaleString("zh-CN")}`,
      `范围：${meta.scope}${meta.retry ? " · 错词重练" : ""}`,
      `来源：${SOURCE_LABEL[meta.source]}`,
      `成绩：${right} / ${results.length}（本轮共 ${items.length} 词${endedEarly && results.length < items.length ? "，提前结束，未作答的不计入" : ""}）`,
      "",
      "序号\t结果\t正确拼写\t你的答案\t中文",
      ...results.map(
        (item, i) =>
          `${i + 1}\t${item.correct ? "对" : item.skipped ? "跳过" : "错"}\t${item.word.word}\t${item.skipped ? "" : item.answer || "（空）"}\t${item.word.translation.replace(/\s+/g, " ")}`,
      ),
    ];
    downloadText(`lexigo-听写报告-${todayKey()}.txt`, lines.join("\n"));
  }

  const lastResult = revealed ? results[results.length - 1] : undefined;
  const score = results.filter((item) => item.correct).length;
  const wrongResults = results.filter((item) => !item.correct);
  const hintVisible = showChinese || hintOpen;
  const noVoice = speech.ready && !(speech.supported && speech.hasEnglish);
  const historyLabel = (item: DictationAttempt) => item.scope ?? (item.band === "wrongbook" ? "错词本" : (BAND_LABEL[item.band as Band] ?? item.band));
  const replay = () => say(current, 1);
  const alternatives = current?.accepted?.filter((item) => normalizeAnswer(item) !== normalizeAnswer(current.word)) ?? [];
  return (
    <section className="view">
      <SectionHeader
        eyebrow="Dictation"
        title="听写练习"
        description="按人教版（2019）高中教材分册、分单元听写。点“开始听写”后才会发音；提交前不显示单词。按 Enter 提交，再按 Enter 进入下一词。"
      />

      {noVoice ? <VoiceGuide supported={speech.supported} /> : null}
      {speakFailed && speech.hasEnglish ? (
        <ErrorNote message="这次发音没有播放成功，已显示中文释义帮你继续。可以点“重听”再试；如果一直没声音，请检查系统音量，或换用 Chrome / Edge / Safari。" />
      ) : null}

      {phase === "setup" || phase === "loading" ? (
        <div className="card card-pad space-y-6">
          <fieldset className="field">
            <legend className="field-label">听写来源</legend>
            <div className="segmented">
              <button type="button" className={cx("seg", source === "textbook" && "is-active")} aria-pressed={source === "textbook"} onClick={() => setSource("textbook")}>
                <BookOpen aria-hidden className="size-4" /> 教材分单元
              </button>
              <button type="button" className={cx("seg", source === "frequency" && "is-active")} aria-pressed={source === "frequency"} onClick={() => setSource("frequency")}>
                通用词频
              </button>
              {hydrated && wrongList.length ? (
                <button type="button" className={cx("seg", source === "wrong" && "is-active")} aria-pressed={source === "wrong"} onClick={() => setSource("wrong")}>
                  错词复听 {wrongList.length}
                </button>
              ) : null}
            </div>
          </fieldset>

          {source === "textbook" ? (
            <div className="space-y-5">
              {catalogError ? (
                <ErrorNote
                  message={`教材目录加载失败：${catalogError}`}
                  onRetry={() => {
                    setCatalogError("");
                    setCatalogRound((value) => value + 1);
                  }}
                />
              ) : null}
              {!catalog && !catalogError ? <Loading label="正在读取教材目录…" /> : null}
              {catalog && !books.length ? <Empty title="暂时没有教材词表">可以先用“通用词频”练习。</Empty> : null}
              {book ? (
                <>
                  <fieldset className="field">
                    <legend className="field-label">教材分册{book.edition ? ` · ${book.edition}` : ""}</legend>
                    <div className="book-grid">
                      {books.map((item) => (
                        <button key={item.id} type="button" className={cx("book-chip", item.id === book.id && "is-active")} aria-pressed={item.id === book.id} onClick={() => setBookId(item.id)}>
                          <span className="book-chip-title">{item.title}</span>
                          <span className="book-chip-meta">{item.wordCount} 个词条</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="field">
                    <legend className="field-label">选择单元（可多选）</legend>
                    <div className="unit-toolbar">
                      <button type="button" className="chip-btn" onClick={selectAll}>
                        {allSelected ? "只选第一单元" : "全选本册"}
                      </button>
                    </div>
                    <div className="unit-grid">
                      {book.units.map((unit) => {
                        const checked = units.includes(unit.id);
                        return (
                          <label key={unit.id} className={cx("unit-chip", checked && "is-active")}>
                            <input type="checkbox" checked={checked} onChange={() => toggleUnit(unit.id)} />
                            <span className="min-w-0 flex-1">{unit.title}</span>
                            <span className="unit-count">{unit.count}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="scope-line" aria-live="polite">
                      {selectedUnits.length ? (
                        <>
                          已选 <strong>{book.title}</strong> · {allSelected ? "全部单元" : selectedUnits.map((unit) => unit.title).join("、")}，共 <strong>{selectedCount}</strong> 个词条
                          {!includePhrases ? "（只听单词时会少一些）" : ""}
                        </>
                      ) : (
                        "还没有选择单元，请至少勾选一个。"
                      )}
                    </p>
                  </fieldset>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <fieldset className="field">
                      <legend className="field-label">题量</legend>
                      <div className="segmented">
                        {COUNTS.map((value) => (
                          <button key={value} type="button" className={cx("seg", count === value && "is-active")} aria-pressed={count === value} onClick={() => setCount(value)}>
                            {value === "all" ? "所选全部" : `${value} 个`}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className="field">
                      <legend className="field-label">顺序</legend>
                      <div className="segmented">
                        <button type="button" className={cx("seg", order === "textbook" && "is-active")} aria-pressed={order === "textbook"} onClick={() => setOrder("textbook")}>
                          按课本顺序
                        </button>
                        <button type="button" className={cx("seg", order === "random" && "is-active")} aria-pressed={order === "random"} onClick={() => setOrder("random")}>
                          随机打乱
                        </button>
                      </div>
                    </fieldset>
                  </div>
                  <label className="switch-line">
                    <input type="checkbox" checked={includePhrases} onChange={(event) => setIncludePhrases(event.target.checked)} />
                    <span>包含词组（如 take part in）。取消勾选则只听写单词。</span>
                  </label>
                  {count === "all" && selectedCount > 60 ? <p className="hint">这一轮约 {selectedCount} 个词条，中途可以点“结束并看结果”，只统计已作答的词，没做的不算错。</p> : null}
                  {catalog?.note ? <p className="hint">{catalog.note}</p> : null}
                </>
              ) : null}
            </div>
          ) : null}

          {source === "frequency" ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <fieldset className="field">
                <legend className="field-label">词频分层</legend>
                <div className="segmented">
                  {(["high", "medium", "low", "all"] as Band[]).map((value) => (
                    <button key={value} type="button" className={cx("seg", band === value && "is-active")} aria-pressed={band === value} onClick={() => setBand(value)}>
                      {BAND_LABEL[value]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="field">
                <legend className="field-label">题量</legend>
                <div className="segmented">
                  {FREQ_COUNTS.map((value) => (
                    <button key={value} type="button" className={cx("seg", freqSize === value && "is-active")} aria-pressed={freqSize === value} onClick={() => setFreqSize(value)}>
                      {value} 个
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          {source === "wrong" ? (
            <fieldset className="field">
              <legend className="field-label">题量（错词本共 {wrongList.length} 个，随机抽取）</legend>
              <div className="segmented">
                {COUNTS.map((value) => (
                  <button key={value} type="button" className={cx("seg", count === value && "is-active")} aria-pressed={count === value} onClick={() => setCount(value)}>
                    {value === "all" ? "全部错词" : `${value} 个`}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="setting-box space-y-5">
            <p className="field-label">发音与提示</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <fieldset className="field">
                <legend className="field-label">口音</legend>
                <div className="segmented">
                  {(
                    [
                      ["en-GB", "英音"],
                      ["en-US", "美音"],
                    ] as [Accent, string][]
                  ).map(([value, label]) => (
                    <button key={value} type="button" className={cx("seg", accent === value && "is-active")} aria-pressed={accent === value} onClick={() => setAccent(value)} disabled={!speech.hasEnglish}>
                      {label}
                      {speech.ready && speech.hasEnglish && !speech.hasAccent(value) ? <span className="text-[0.75em] opacity-70">（替代）</span> : null}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="field">
                <legend className="field-label">语速</legend>
                <div className="segmented">
                  {RATES.map(([value, label]) => (
                    <button key={value} type="button" className={cx("seg", rate === value && "is-active")} aria-pressed={rate === value} onClick={() => setRate(value)} disabled={!speech.hasEnglish}>
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="field">
                <legend className="field-label">每词自动读几遍（间隔 1 秒）</legend>
                <div className="segmented">
                  {([1, 2, 3] as const).map((value) => (
                    <button key={value} type="button" className={cx("seg", repeat === value && "is-active")} aria-pressed={repeat === value} onClick={() => setRepeat(value)} disabled={!speech.hasEnglish}>
                      {value} 遍
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="field">
                <legend className="field-label">中文提示</legend>
                <div className="segmented">
                  <button type="button" className={cx("seg", !showChinese && "is-active")} aria-pressed={!showChinese} onClick={() => setShowChinese(false)}>
                    标准听写（不显示）
                  </button>
                  <button type="button" className={cx("seg", showChinese && "is-active")} aria-pressed={showChinese} onClick={() => setShowChinese(true)}>
                    显示中文
                  </button>
                </div>
              </fieldset>
            </div>
            {speech.ready && speech.hasEnglish && !speech.hasAccent(accent) ? (
              <p className="hint">这台设备没有{accent === "en-US" ? "美式" : "英式"}英语语音，会用其它英语语音朗读。可以在系统设置里添加对应语音。</p>
            ) : null}
          </div>

          {error ? <ErrorNote message={error} /> : null}
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={start}
            disabled={phase === "loading" || (source === "textbook" && (!book || !selectedUnits.length)) || (source === "wrong" && !wrongList.length)}
          >
            {phase === "loading" ? (
              "正在准备词表…"
            ) : (
              <>
                <Play aria-hidden className="size-5" /> 开始听写
              </>
            )}
          </button>
        </div>
      ) : null}

      {phase === "running" && current && meta ? (
        <div className="card card-pad dictation-stage">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">
                第 {index + 1} / {items.length} 词{meta.retry ? " · 错词重练" : ""}
              </p>
              <p className="meta-line">{meta.scope}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => finish(results, true)}>
              <Square aria-hidden className="size-4" /> {results.length ? "结束并看结果" : "退出"}
            </button>
          </div>
          <div className="progress-track" aria-hidden>
            <span style={{ width: `${((index + (revealed ? 1 : 0)) / items.length) * 100}%` }} />
          </div>

          <div className="dictation-center">
            {audioOk ? (
              <button type="button" className={cx("play-orb", speaking && "is-speaking")} onClick={replay} aria-label="重听发音">
                <Headphones aria-hidden className="size-9" />
                <span>{speaking ? "播放中" : "重听"}</span>
              </button>
            ) : (
              <p className="fallback-prompt">
                <span className="eyebrow block">看释义拼写</span>
                {current.translation}
              </p>
            )}
            {audioOk && !revealed ? (
              hintVisible ? (
                <p className="hint-text">{current.translation}</p>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHintOpen(true)}>
                  看中文提示
                </button>
              )
            ) : null}
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label htmlFor="dictation-input" className="field-label">
              你的拼写
            </label>
            <input
              id="dictation-input"
              ref={inputRef}
              className={cx("text-input text-input-lg", lastResult && (lastResult.correct ? "is-correct" : "is-wrong"))}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              readOnly={revealed}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              lang="en"
              maxLength={80}
              placeholder="输入听到的单词或词组"
            />
            {!revealed ? (
              <div className="dictation-actions">
                <button type="button" className="btn btn-ghost" onClick={replay} disabled={!audioOk}>
                  <Volume2 aria-hidden className="size-4" /> 重听
                </button>
                <button type="submit" className="btn btn-primary" disabled={!answer.trim()}>
                  提交
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => grade(true)}>
                  <SkipForward aria-hidden className="size-4" /> 不会，跳过
                </button>
              </div>
            ) : null}
          </form>

          {lastResult ? (
            <div className={cx("reveal", lastResult.correct ? "is-correct" : "is-wrong")} aria-live="polite">
              <div className="flex items-center gap-2 font-semibold">
                {lastResult.correct ? <CheckCircle2 aria-hidden className="size-5" /> : <XCircle aria-hidden className="size-5" />}
                {lastResult.correct ? "拼写正确" : lastResult.skipped ? "已跳过，记入错词本" : "拼写有误"}
              </div>
              <p className="reveal-word" lang="en">
                {current.word} {current.phonetic ? <span className="word-phonetic">{current.phonetic}</span> : null}
              </p>
              <p className="text-[var(--ink-soft)]">{current.translation}</p>
              {alternatives.length ? (
                <p className="text-sm">
                  也可写作：<span lang="en">{alternatives.join(" / ")}</span>
                </p>
              ) : null}
              {unitTitle(current) ? <p className="hint">{unitTitle(current)}</p> : null}
              {!lastResult.correct && !lastResult.skipped ? (
                <p className="text-sm">
                  你的答案：<span lang="en" className="line-through decoration-[var(--orange)]">{lastResult.answer || "（空）"}</span>
                </p>
              ) : null}
              <div className="dictation-actions mt-2">
                <button type="button" className="btn btn-ghost" onClick={replay} disabled={!audioOk}>
                  <Volume2 aria-hidden className="size-4" /> 重听
                </button>
                <button ref={nextRef} type="button" className="btn btn-primary" onClick={next}>
                  {index + 1 >= items.length ? "查看结果" : "下一词"} <ArrowRight aria-hidden className="size-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {phase === "done" && meta ? (
        <div className="card card-pad space-y-5">
          <div className="score-block">
            <p className="eyebrow">本轮结果</p>
            <p className="meta-line">
              {meta.scope}
              {meta.retry ? " · 错词重练" : ""}
            </p>
            <p className="score-num">
              {score}
              <span> / {results.length}</span>
            </p>
            <p className="text-[var(--ink-soft)]">
              正确率 {results.length ? Math.round((score / results.length) * 100) : 0}%。
              {endedEarly && results.length < items.length ? `提前结束：完成 ${results.length} / ${items.length} 词，没作答的不算错。` : ""}
              {wrongResults.length ? "错词已存入本机错词本。" : ""}
            </p>
          </div>
          {wrongResults.length ? (
            <div>
              <h2 className="sub-title">需要再练的词（{wrongResults.length}）</h2>
              <ul className="wrong-list">
                {wrongResults.map((item, i) => (
                  <li key={`${item.word.id}-${i}`}>
                    <span lang="en" className="font-semibold">
                      {item.word.word}
                    </span>
                    <span className="text-[var(--ink-soft)]">{item.word.translation}</span>
                    <span className="text-sm">
                      {item.skipped ? (
                        "跳过"
                      ) : (
                        <>
                          你写的：<span lang="en">{item.answer || "（空）"}</span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="note note-success">全部正确，很棒！</p>
          )}
          <div className="flex flex-wrap gap-3">
            {wrongResults.length ? (
              <button type="button" className="btn btn-primary" onClick={retryWrong}>
                <ListChecks aria-hidden className="size-4" /> 只重听错词
              </button>
            ) : null}
            <button type="button" className={cx("btn", wrongResults.length ? "btn-ghost" : "btn-primary")} onClick={start}>
              <RotateCcw aria-hidden className="size-4" /> 按当前设置再来一轮
            </button>
            <button type="button" className="btn btn-ghost" onClick={exportReport}>
              <Download aria-hidden className="size-4" /> 导出报告
            </button>
            <button type="button" className="btn btn-ghost" onClick={backToSetup}>
              调整设置
            </button>
          </div>
        </div>
      ) : null}

      {phase === "setup" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="card card-pad">
            <h2 className="sub-title">错词本</h2>
            {!hydrated ? (
              <Loading />
            ) : wrongList.length ? (
              <ul className="wrong-list">
                {wrongList.slice(0, 12).map((entry) => (
                  <li key={entry.word.id}>
                    <span lang="en" className="font-semibold">
                      {entry.word.word}
                    </span>
                    <span className="text-[var(--ink-soft)]">{entry.word.translation}</span>
                    <span className="flex items-center gap-2 text-sm">
                      错 {entry.misses} 次
                      <button type="button" className="icon-btn icon-btn-sm" onClick={() => removeWrong(entry.word.id)} aria-label={`从错词本移除 ${entry.word.word}`}>
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="暂时没有错词">听写时答错或跳过的词会自动收进来。</Empty>
            )}
          </div>
          <div className="card card-pad">
            <h2 className="sub-title">最近听写</h2>
            {!hydrated ? (
              <Loading />
            ) : progress.dictation.length ? (
              <ul className="history-list">
                {progress.dictation
                  .slice(-6)
                  .reverse()
                  .map((item) => (
                    <li key={item.at}>
                      <span className="min-w-0">
                        <span className="line-clamp-2">{historyLabel(item)}</span>
                        <span className="block text-xs text-[var(--ink-faint)]">
                          {formatDate(item.at)}
                          {item.planned && item.planned > item.total ? ` · 完成 ${item.total}/${item.planned}` : ""}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">
                        {item.correct}/{item.total}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <Empty title="还没有听写记录" />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function VoiceGuide({ supported }: { supported: boolean }) {
  return (
    <div className="note note-warn" role="status">
      <Volume2 aria-hidden className="size-5 shrink-0" />
      <div className="min-w-0 space-y-2">
        <p>
          {supported ? "这个浏览器里没有找到英语发音，" : "这个浏览器不支持语音朗读，"}
          暂时听不到读音。你仍然可以练习：题目会显示中文释义，请拼写对应的英文。
        </p>
        <ul className="voice-tips">
          <li>请用系统浏览器打开本页：Chrome、Edge 或 Safari。微信、QQ 等应用内打开时常常没有声音。</li>
          <li>Windows：设置 → 时间和语言 → 语音 → 添加语音，选“英语(英国)”或“英语(美国)”。</li>
          <li>iPhone / iPad / Mac：设置 → 辅助功能 → 朗读内容 → 声音，下载英语声音。</li>
          <li>安卓：设置 → 文字转语音输出，安装英语语音数据。</li>
        </ul>
        <p className="hint">发音来自你这台设备和浏览器自带的语音，有些语音需要联网才能用。装好后刷新本页即可。</p>
      </div>
    </div>
  );
}
