"use client";

import { BookMarked, BookX, CalendarCheck, ClipboardCheck, FileCheck2, Gamepad2, Headphones, History, Lightbulb, MoreHorizontal, PenLine, Sparkles, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

export type TabId = "today" | "vocab" | "dictation" | "practice" | "exam" | "game" | "mistakes" | "knowledge" | "essay" | "questions" | "records";

export const TABS: { id: TabId; label: string; short: string; icon: LucideIcon; group: "learn" | "tools" }[] = [
  { id: "today", label: "今日学习", short: "今日", icon: CalendarCheck, group: "learn" },
  { id: "vocab", label: "分类词库", short: "词库", icon: BookMarked, group: "learn" },
  { id: "dictation", label: "听写练习", short: "听写", icon: Headphones, group: "learn" },
  { id: "practice", label: "练习与命题", short: "练习", icon: Sparkles, group: "learn" },
  { id: "exam", label: "定制模拟卷", short: "试卷", icon: FileCheck2, group: "learn" },
  { id: "game", label: "英语闯关", short: "闯关", icon: Gamepad2, group: "learn" },
  { id: "mistakes", label: "错题集", short: "错题", icon: BookX, group: "learn" },
  { id: "knowledge", label: "知识卡", short: "知识", icon: Lightbulb, group: "learn" },
  { id: "essay", label: "作文批改", short: "作文", icon: PenLine, group: "tools" },
  { id: "questions", label: "题目批改", short: "批改", icon: ClipboardCheck, group: "tools" },
  { id: "records", label: "学习记录 / 来源", short: "记录", icon: History, group: "tools" },
];

const MOBILE_MAIN: TabId[] = ["today", "vocab", "practice", "mistakes"];

export function Monogram({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#1f4d3a" />
      <path d="M14 46h36" stroke="#c9e86a" strokeWidth="3" strokeLinecap="round" />
      <text x="32" y="40" textAnchor="middle" fontSize="30" fontFamily="'Songti SC','STSong','Noto Serif SC','SimSun',serif" fontWeight="700" fill="#fbf7ee">
        拾
      </text>
    </svg>
  );
}

export function Sidebar({ active, onSelect, aiLabel, badges }: { active: TabId; onSelect: (tab: TabId) => void; aiLabel: string; badges?: Partial<Record<TabId, number>> }) {
  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="brand">
        <Monogram />
        <div>
          <p className="brand-name">拾词</p>
          <p className="brand-sub">LexiGo · 高考英语</p>
        </div>
      </div>
      <nav className="side-nav">
        <p className="side-group">学习</p>
        {TABS.filter((tab) => tab.group === "learn").map((tab) => (
          <SideLink key={tab.id} tab={tab} active={active === tab.id} onSelect={onSelect} badge={badges?.[tab.id]} />
        ))}
        <p className="side-group">批改与记录</p>
        {TABS.filter((tab) => tab.group === "tools").map((tab) => (
          <SideLink key={tab.id} tab={tab} active={active === tab.id} onSelect={onSelect} />
        ))}
      </nav>
      <div className="side-foot">
        <p>{aiLabel}</p>
        <p>进度仅保存在本机浏览器</p>
      </div>
    </aside>
  );
}

function SideLink({ tab, active, onSelect, badge }: { tab: (typeof TABS)[number]; active: boolean; onSelect: (tab: TabId) => void; badge?: number }) {
  const Icon = tab.icon;
  return (
    <a href={`#${tab.id}`} className={cx("side-link", active && "is-active")} aria-current={active ? "page" : undefined} onClick={(event) => { event.preventDefault(); onSelect(tab.id); }}>
      <Icon aria-hidden className="size-[18px]" />
      <span className="min-w-0 flex-1">{tab.label}</span>
      {badge ? <span className="nav-badge" aria-label={`${badge} 项待处理`}>{badge > 99 ? "99+" : badge}</span> : null}
    </a>
  );
}

export function MobileNav({ active, onSelect, badges }: { active: TabId; onSelect: (tab: TabId) => void; badges?: Partial<Record<TabId, number>> }) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreActive = !MOBILE_MAIN.includes(active);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    sheetRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function choose(tab: TabId) {
    setOpen(false);
    onSelect(tab);
  }

  return (
    <>
      {open ? (
        <div className="more-backdrop" onClick={() => setOpen(false)}>
          <div ref={sheetRef} className="more-sheet" role="dialog" aria-modal="true" aria-label="更多功能" onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="sub-title m-0">更多</p>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="关闭">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            {TABS.filter((tab) => !MOBILE_MAIN.includes(tab.id)).map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} type="button" className={cx("more-item", active === tab.id && "is-active")} onClick={() => choose(tab.id)}>
                  <Icon aria-hidden className="size-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <nav className="mobile-nav" aria-label="主导航">
        {TABS.filter((tab) => MOBILE_MAIN.includes(tab.id)).map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" className={cx("mobile-link", active === tab.id && "is-active")} aria-current={active === tab.id ? "page" : undefined} onClick={() => choose(tab.id)}>
              <span className="relative inline-flex">
                <Icon aria-hidden className="size-5" />
                {badges?.[tab.id] ? <span className="nav-dot" aria-hidden /> : null}
              </span>
              <span>{tab.short}</span>
              {badges?.[tab.id] ? <span className="sr-only">（{badges[tab.id]} 项待处理）</span> : null}
            </button>
          );
        })}
        <button type="button" className={cx("mobile-link", (moreActive || open) && "is-active")} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
          <MoreHorizontal aria-hidden className="size-5" />
          <span>{moreActive ? TABS.find((tab) => tab.id === active)?.short : "更多"}</span>
        </button>
      </nav>
    </>
  );
}
