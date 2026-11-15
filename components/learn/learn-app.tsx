"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorText, isAbort, type BankResponse } from "./api";
import { CorrectionView } from "./correction-view";
import { DictationView } from "./dictation-view";
import { KnowledgeSection } from "./knowledge-section";
import { aiStatusInfo, type StatusLike } from "./ai-status";
import { activeMistakes } from "./mistakes";
import { dueIds } from "./review";
import { SectionHeader } from "./ui";
import { MistakesView } from "./mistakes-view";
import { MobileNav, Monogram, Sidebar, TABS, type TabId } from "./nav";
import { PracticeView } from "./practice-view";
import { ProgressProvider, useProgress } from "./progress";
import { RecordsView } from "./records-view";
import { TodayView } from "./today-view";
import { useSpeech } from "./use-speech";
import { VocabularyView } from "./vocabulary-view";

const TAB_IDS = new Set<string>(TABS.map((tab) => tab.id));
const ExamView = lazy(() => import("./exam-view").then(module => ({ default: module.ExamView })));
const GameHub = lazy(() => import("./game-hub").then(module => ({ default: module.GameHub })));

export function LearnApp() {
  return (
    <ProgressProvider>
      <Shell />
    </ProgressProvider>
  );
}

function Shell() {
  const { storageAvailable, progress, hydrated } = useProgress();
  const [tab, setTab] = useState<TabId>("today");
  const [status, setStatus] = useState<StatusLike | null>(null);
  const [statusError, setStatusError] = useState("");
  const [bank, setBank] = useState<BankResponse | null>(null);
  const [bankError, setBankError] = useState("");
  const [bankRound, setBankRound] = useState(0);
  const speech = useSpeech();
  const { stop } = speech;
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash === "game-fish" || hash === "game-runner") { setTab("game"); window.scrollTo({ top: 0 }); }
      else if (TAB_IDS.has(hash)) { setTab(hash as TabId); window.scrollTo({ top: 0 }); }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .status(controller.signal)
      .then(setStatus)
      .catch((err: unknown) => {
        if (!isAbort(err)) setStatusError(errorText(err));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .bank(controller.signal)
      .then(setBank)
      .catch((err: unknown) => {
        if (!isAbort(err)) setBankError(errorText(err));
      });
    return () => controller.abort();
  }, [bankRound]);

  useEffect(() => {
    stop();
  }, [tab, stop]);

  const select = useCallback((next: TabId) => {
    setTab(next);
    if (window.location.hash.slice(1) !== next) window.history.replaceState(null, "", `#${next}`);
    // Selecting the game navigation always returns to its choice page, even from a deep route.
    if (next === "game") window.dispatchEvent(new Event("hashchange"));
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, []);

  const reloadBank = useCallback(() => {
    setBankError("");
    setBankRound((value) => value + 1);
  }, []);
  const ai = aiStatusInfo(status, statusError);
  const badges = useMemo(() => {
    if (!hydrated) return {};
    return { vocab: dueIds(progress.review).length, mistakes: activeMistakes(progress.mistakes).length };
  }, [hydrated, progress.review, progress.mistakes]);

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        跳到正文
      </a>
      <Sidebar active={tab} onSelect={select} aiLabel={ai.label} badges={badges} />
      <div className="app-body">
        <header className="mobile-top">
          <Monogram size={32} />
          <span className="brand-name">拾词 LexiGo</span>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="main">
          {!storageAvailable ? <div role="alert" className="card card-pad mb-4">
            <p>浏览器存储已满或不可用，最新学习记录尚未保存。请先导出备份再刷新。</p>
            <button type="button" className="btn btn-primary" onClick={() => select("records")}>前往导出备份</button>
          </div> : null}
          {tab === "today" ? <TodayView status={status} statusError={statusError} speech={speech} onNavigate={select} /> : null}
          {tab === "vocab" ? <VocabularyView speech={speech} frequencyNote={status?.frequencyNote} /> : null}
          {tab === "dictation" ? <DictationView speech={speech} /> : null}
          {tab === "practice" ? <PracticeView bank={bank} bankError={bankError} onReloadBank={reloadBank} aiNotice={ai.notice} /> : null}
          {tab === "exam" ? <Suspense fallback={<p role="status">正在准备模拟卷工作台…</p>}><ExamView aiNotice={ai.notice} /></Suspense> : null}
          {tab === "game" ? <Suspense fallback={<p role="status">正在准备英语游乐场…</p>}><GameHub speech={speech} /></Suspense> : null}
          {tab === "mistakes" ? <MistakesView onNavigate={select} /> : null}
          {tab === "essay" ? <CorrectionView key="essay" kind="essay" aiNotice={ai.notice} /> : null}
          {tab === "questions" ? <CorrectionView key="questions" kind="questions" aiNotice={ai.notice} /> : null}
          {tab === "knowledge" ? (
            <section className="view">
              <SectionHeader eyebrow="Knowledge" title="知识卡" description="语法、写作与易错点，一张卡讲清一个点。做错题后可以回到这里复习对应考点。" />
              <KnowledgeSection />
            </section>
          ) : null}
          {tab === "records" ? <RecordsView bank={bank} bankError={bankError} onReloadBank={reloadBank} /> : null}
        </main>
      </div>
      <MobileNav active={tab} onSelect={select} badges={badges} />
    </div>
  );
}

