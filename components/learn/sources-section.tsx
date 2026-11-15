"use client";

import { ExternalLink, Info } from "lucide-react";
import type { BankResponse } from "./api";
import { Empty, ErrorNote, Loading, SectionHeader } from "./ui";

export function SourcesSection({ bank, bankError, onReloadBank }: { bank: BankResponse | null; bankError: string; onReloadBank: () => void }) {
  return (
    <section className="card card-pad space-y-4">
      <div>
        <p className="eyebrow">Sources</p>
        <h2 className="sub-title">真题与官方来源</h2>
        <p className="section-desc">题库中的“历年真题”来自公开数据集转录，可能存在误差；“原创模拟”和“AI 原创”不是真题。以下链接在新窗口打开外部网站，可核对原卷和官方考试说明。</p>
      </div>
      {bankError ? <ErrorNote message={bankError} onRetry={onReloadBank} /> : null}
      {!bank && !bankError ? <Loading /> : null}
      {bank ? (
        bank.sources.length ? (
          <ul className="source-list">
            {bank.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="source-link">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{source.title}</span>
                      {source.kind ? <span className="tag">{source.kind}</span> : null}
                    </span>
                    {source.description ? <span className="mt-1 block text-sm text-[var(--ink-soft)]">{source.description}</span> : null}
                    <span className="mt-1 block truncate text-xs text-[var(--ink-faint)]">{source.url}</span>
                  </span>
                  <ExternalLink aria-hidden className="size-4 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="暂无来源链接" />
        )
      ) : null}
      {bank?.note ? (
        <p className="hint flex gap-2">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {bank.note}
        </p>
      ) : null}
    </section>
  );
}

export { SectionHeader };

