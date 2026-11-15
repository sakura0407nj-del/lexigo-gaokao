"use client";

import { Check, ChevronDown, Star, Volume2 } from "lucide-react";
import { BAND_LABEL } from "./api";
import { useProgress } from "./progress";
import { dueLabel } from "./review";
import { cx } from "./ui";
import type { SpeechState } from "./use-speech";
import { posLabel, type RichWord } from "./vocab-api";

export function formatPhonetic(phonetic: string) {
  return phonetic.startsWith("/") || phonetic.startsWith("[") ? phonetic : `/${phonetic}/`;
}
export function frequencyBand(word: RichWord) {
  return word.frequencyBand ?? (word.rank > 0 ? word.frequency : 'unknown');
}

export function WordCard({ word, speech, compact = false, topicLabels }: { word: RichWord; speech: SpeechState; compact?: boolean; topicLabels?: Record<string, string> }) {
  const { progress, isLearned, isStarred, toggleLearned, toggleStarred } = useProgress();
  const learned = isLearned(word.id);
  const starred = isStarred(word.id);
  const canSpeak = speech.supported && speech.hasEnglish;
  const review = progress.review[word.id];
  const textbooks = word.textbooks ?? [];
  const pos = word.pos ?? [];
  const topics = word.topics ?? [];
  const hasDetail = !compact && (textbooks.length > 0 || pos.length > 0 || topics.length > 0 || typeof word.inGaokao === "boolean" || Boolean(word.example));

  return (
    <article className={cx("word-card", learned && "is-learned", compact && "is-compact")}>
      <div className="word-head">
        <div className="word-title-line">
          <h3 className="word-term" lang="en">
            {word.word}
          </h3>
          {word.phonetic ? (
            <span className="word-phonetic" lang="en">
              {formatPhonetic(word.phonetic)}
            </span>
          ) : null}
        </div>
        <div className="word-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => speech.speak(word.word, { rate: 0.9 })}
            disabled={!canSpeak}
            aria-label={canSpeak ? `朗读 ${word.word}` : "此浏览器没有可用的英语语音"}
            title={canSpeak ? "朗读" : "此浏览器没有可用的英语语音"}
          >
            <Volume2 aria-hidden className="size-[18px]" />
          </button>
          <button
            type="button"
            className={cx("icon-btn", starred && "is-on-star")}
            onClick={() => toggleStarred(word)}
            aria-pressed={starred}
            aria-label={starred ? `取消收藏 ${word.word}` : `收藏 ${word.word}`}
            title={starred ? "取消收藏" : "收藏"}
          >
            <Star aria-hidden className="size-[18px]" fill={starred ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            className={cx("icon-btn", learned && "is-on-learned")}
            onClick={() => toggleLearned(word)}
            aria-pressed={learned}
            aria-label={learned ? `取消已掌握 ${word.word}` : `标记已掌握 ${word.word}`}
            title={learned ? "取消已掌握（撤销）" : "标记已掌握"}
          >
            <Check aria-hidden className="size-[18px]" />
          </button>
        </div>
      </div>
      <div className="word-tags">
        <span className={cx("band-tag", `band-${frequencyBand(word)}`)}>{BAND_LABEL[frequencyBand(word)]}</span>
        {pos.slice(0, 3).map((item) => (
          <span key={item} className="mini-tag">
            {posLabel(item)}
          </span>
        ))}
        {review ? <span className="mini-tag mini-tag-review">{dueLabel(review)}</span> : null}
      </div>
      <p className="word-translation">{word.translation}</p>
      {hasDetail ? (
        <details className="word-detail">
          <summary>
            <ChevronDown aria-hidden className="word-detail-chevron size-4" />
            来源与分类
          </summary>
          <dl className="word-detail-body">
            {typeof word.inGaokao === "boolean" ? (
              <div>
                <dt>高考词表</dt>
                <dd>{word.inGaokao ? "收录（ECDICT gk 标签）" : "未收录，仅出现在教材词表"}</dd>
              </div>
            ) : null}
            {textbooks.length ? (
              <div>
                <dt>教材出处</dt>
                <dd>
                  {textbooks.map((ref) => (
                    <span key={`${ref.bookId}-${ref.unitId}`} className="block">
                      {ref.bookTitle} · {ref.unitTitle}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
            {pos.length ? (
              <div>
                <dt>词性</dt>
                <dd>{pos.map(posLabel).join("、")}</dd>
              </div>
            ) : null}
            {topics.length ? (
              <div>
                <dt>主题</dt>
                <dd>{topics.map((id) => topicLabels?.[id] ?? id).join("、")}</dd>
              </div>
            ) : null}
            {word.example ? (
              <div>
                <dt>例句</dt>
                <dd>
                  <span lang="en">{word.example}</span>
                  {word.exampleZh ? <span className="block text-[var(--ink-soft)]">{word.exampleZh}</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </details>
      ) : null}
    </article>
  );
}
