"use client";

import { Check, RotateCcw, Undo2, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BAND_LABEL } from "./api";
import { useProgress } from "./progress";
import { cx } from "./ui";
import type { SpeechState } from "./use-speech";
import { formatPhonetic, frequencyBand } from "./word-card";
import {wordExample} from './word-example';
import type { RichWord } from "./vocab-api";

export const SESSION_SIZES = [20, 30, 50] as const;

interface Outcome {
  id: string;
  known: boolean;
}

export function Flashcards({ words, title, speech, onExit }: { words: RichWord[]; title: string; speech: SpeechState; onExit: () => void }) {
  const { reviewWord, toggleLearned, isLearned } = useProgress();
  const [deck, setDeck] = useState(() => words.slice(0, 50));
  const [round, setRound] = useState(1);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const canSpeak = speech.supported && speech.hasEnglish;
  const current = deck[index];
  const example=current?wordExample(current):undefined;
  const unit=current?.textbooks?.find(ref=>ref.bookId===current.book && ref.unitId===current.unit)??current?.textbooks?.[0];
  const finished = index >= deck.length;
  const known = outcomes.filter((item) => item.known).length;
  const byId = useMemo(() => new Map(deck.map((word) => [word.id, word])), [deck]);
  const { speak } = speech;

  useEffect(() => {
    if (autoSpeak && canSpeak && current) speak(current.word, { rate: 0.9 });
  }, [autoSpeak, canSpeak, current, speak]);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [index]);

  function answer(isKnown: boolean) {
    if (!current || !flipped) return;
    reviewWord(current, isKnown);
    setOutcomes((list) => [...list, { id: current.id, known: isKnown }]);
    setFlipped(false);
    setIndex((value) => value + 1);
  }

  function restart(next: RichWord[]) {
    if (!next.length) return;
    setDeck(next);
    setRound((value) => value + 1);
    setOutcomes([]);
    setFlipped(false);
    setIndex(0);
  }

  function onKey(event: KeyboardEvent) {
    if (finished) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!flipped) setFlipped(true);
    } else if (flipped && (event.key === "1" || event.key === "ArrowLeft")) {
      answer(false);
    } else if (flipped && (event.key === "2" || event.key === "ArrowRight")) {
      answer(true);
    }
  }

  if (!deck.length) {
    return (
      <div className="card card-pad space-y-3">
        <p>当前筛选没有可学习的词。</p>
        <button type="button" className="btn btn-ghost" onClick={onExit}>
          返回词库
        </button>
      </div>
    );
  }

  if (finished) {
    const again = outcomes.filter((item) => !item.known);
    return (
      <div className="card card-pad flash-summary space-y-4" role="status">
        <p className="eyebrow">Session done</p>
        <h2 className="sub-title m-0">本轮完成：{title}{round > 1 ? ` · 第 ${round} 轮` : ""}</h2>
        <div className="stat-grid">
          <div className="stat">
            <p className="stat-label">已记住</p>
            <p className="stat-value">
              {known}
              <span>词</span>
            </p>
            <p className="stat-note">下次按 1/3/7/14/30 天间隔复习</p>
          </div>
          <div className="stat">
            <p className="stat-label">还不熟</p>
            <p className="stat-value">
              {again.length}
              <span>词</span>
            </p>
            <p className="stat-note">明天会再次出现在待复习里</p>
          </div>
        </div>
        {outcomes.length ? (
          <ul className="flash-result-list">
            {outcomes.map((item) => {
              const word = byId.get(item.id);
              if (!word) return null;
              const learnedNow = isLearned(word.id);
              return (
                <li key={item.id} className={cx(item.known ? "is-known" : "is-again")}>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold" lang="en">
                      {word.word}
                    </span>
                    <span className="flash-result-meaning">{word.translation.split("\n")[0]}</span>
                  </span>
                  {item.known && learnedNow ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleLearned(word)} aria-label={`撤销已掌握 ${word.word}`}>
                      <Undo2 aria-hidden className="size-4" /> 撤销
                    </button>
                  ) : (
                    <span className="tag">{item.known ? "已撤销" : "还不熟"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {again.length ? (
            <button type="button" className="btn btn-ghost" onClick={() => restart(again.map((item) => byId.get(item.id)).filter((word): word is RichWord => Boolean(word)))}>
              <RotateCcw aria-hidden className="size-4" /> 重练不熟的 {again.length} 个
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={onExit}>
            返回词库
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flash-wrap space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow">Flashcards</p>
          <p className="sub-title m-0 truncate">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="switch-line">
            <input type="checkbox" checked={autoSpeak} onChange={(event) => setAutoSpeak(event.target.checked)} disabled={!canSpeak} />
            <span>自动朗读</span>
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onExit}>
            结束
          </button>
        </div>
      </div>
      <div className="flash-progress" aria-hidden>
        <span style={{ width: `${(index / deck.length) * 100}%` }} />
      </div>
      <p className="meta-line" aria-live="polite">
        第 {index + 1} / {deck.length} 张 · 已记住 {known} · 还不熟 {outcomes.length - known}
      </p>
      <div
        ref={cardRef}
        tabIndex={0}
        className={cx("flash-card", flipped && "is-flipped")}
        onKeyDown={onKey}
        onClick={() => !flipped && setFlipped(true)}
        role="group"
        aria-label={flipped ? `${current.word}：${current.translation}` : `${current.word}，点击或按空格查看释义`}
      >
        <div className="flash-front">
          <p className="flash-word" lang="en">
            {current.word}
          </p>
          {current.phonetic ? (
            <p className="word-phonetic" lang="en">
              {formatPhonetic(current.phonetic)}
            </p>
          ) : null}
          <span className={cx("band-tag", `band-${frequencyBand(current)}`)}>{BAND_LABEL[frequencyBand(current)]}</span>
        </div>
        {flipped ? (
          <div className="flash-back">
            <p className="word-translation">{current.translation}</p>
            {example ? (
              <p className="word-example">
                <span lang="en">{example.english}</span>
                {example.note ? <span className="block">{example.note}</span> : null}
              </p>
            ) : null}
            {unit && <p className="hint">{unit.bookTitle} · {unit.unitTitle}</p>}
          </div>
        ) : (
          <p className="flash-hint">先在心里回想意思，再点击卡片查看</p>
        )}
      </div>
      <div className="flash-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={(event) => {
            event.stopPropagation();
            speak(current.word, { rate: 0.9 });
          }}
          disabled={!canSpeak}
          aria-label={canSpeak ? `朗读 ${current.word}` : "此浏览器没有可用的英语语音"}
        >
          <Volume2 aria-hidden className="size-5" />
        </button>
        {flipped ? (
          <>
            <button type="button" className="btn btn-ghost flash-btn" onClick={() => answer(false)}>
              <X aria-hidden className="size-4" /> 还不熟
            </button>
            <button type="button" className="btn btn-primary flash-btn" onClick={() => answer(true)}>
              <Check aria-hidden className="size-4" /> 已记住
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary flash-btn" onClick={() => setFlipped(true)}>
            <RotateCcw aria-hidden className="size-4" /> 翻开看释义
          </button>
        )}
      </div>
      <p className="hint">键盘：空格翻面，1 / ← 还不熟，2 / → 已记住。“已记住”会安排下次复习并计入已掌握；“还不熟”明天再复习。</p>
    </div>
  );
}
