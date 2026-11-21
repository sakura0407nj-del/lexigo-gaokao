'use client';

import { BookMarked, BookX, CalendarCheck, ClipboardCheck, FileCheck2, Gamepad2, Headphones, History, Lightbulb, MoreHorizontal, PenLine, Sparkles, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from './ui';

export type TabId = 'today' | 'vocab' | 'dictation' | 'practice' | 'exam' | 'game' | 'mistakes' | 'knowledge' | 'essay' | 'questions' | 'records';

export const TABS: { id: TabId; label: string; short: string; icon: LucideIcon; group: 'learn' | 'tools' }[] = [
  { id: 'today', label: '今日学习', short: '今日', icon: CalendarCheck, group: 'learn' },
  { id: 'vocab', label: '分类词库', short: '词库', icon: BookMarked, group: 'learn' },
  { id: 'dictation', label: '听写练习', short: '听写', icon: Headphones, group: 'learn' },
  { id: 'practice', label: '练习与命题', short: '练习', icon: Sparkles, group: 'learn' },
  { id: 'exam', label: '定制模拟卷', short: '试卷', icon: FileCheck2, group: 'learn' },
  { id: 'game', label: '英语游乐场', short: '游戏', icon: Gamepad2, group: 'learn' },
  { id: 'mistakes', label: '错题集', short: '错题', icon: BookX, group: 'learn' },
  { id: 'knowledge', label: '知识卡', short: '知识', icon: Lightbulb, group: 'learn' },
  { id: 'essay', label: '作文批改', short: '作文', icon: PenLine, group: 'tools' },
  { id: 'questions', label: '题目批改', short: '批改', icon: ClipboardCheck, group: 'tools' },
  { id: 'records', label: '学习记录 / 来源', short: '记录', icon: History, group: 'tools' },
];

// Visual grouping for the sidebar and the mobile sheet. Every TabId appears exactly once.
export const NAV_GROUPS: { id: string; label: string; tabs: TabId[] }[] = [
  { id: 'daily', label: '每日学习', tabs: ['today', 'vocab', 'dictation', 'practice', 'mistakes'] },
  { id: 'extend', label: '测评与拓展', tabs: ['exam', 'game', 'knowledge'] },
  { id: 'tools', label: '批改与记录', tabs: ['essay', 'questions', 'records'] },
];

const MOBILE_MAIN: TabId[] = ['today', 'vocab', 'dictation', 'practice'];

type TabInfo = (typeof TABS)[number];

function tabById(id: TabId): TabInfo {
  return TABS.find((tab) => tab.id === id) || TABS[0];
}

export function tabGroupLabel(id: TabId): string {
  const group = NAV_GROUPS.find((item) => item.tabs.indexOf(id) >= 0);
  return group ? group.label : '';
}

function formatBadge(value: number): string {
  return value > 99 ? '99+' : String(value);
}

export function Monogram({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox='0 0 64 64' aria-hidden>
      <rect width='64' height='64' rx='16' fill='#1f4d3a' />
      <path d='M14 46h36' stroke='#c9e86a' strokeWidth='3' strokeLinecap='round' />
      <text x='32' y='40' textAnchor='middle' fontSize='30' fontFamily='Songti SC, STSong, Noto Serif SC, SimSun, serif' fontWeight='700' fill='#fbf7ee'>
        拾
      </text>
    </svg>
  );
}

export function Sidebar({ active, onSelect, aiLabel, badges, aiTone }: { active: TabId; onSelect: (tab: TabId) => void; aiLabel: string; badges?: Partial<Record<TabId, number>>; aiTone?: string }) {
  return (
    <aside className='sidebar nav-rail' aria-label='主导航'>
      <div className='brand nav-brand'>
        <Monogram size={44} />
        <div className='nav-brand-text'>
          <p className='brand-name'>拾词</p>
          <p className='brand-sub'>
            LexiGo · 高考英语<span className='nav-stage-tag'>高中版</span>
          </p>
        </div>
      </div>
      <nav className='side-nav nav-groups' aria-label='学习功能'>
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className='nav-group' role='group' aria-labelledby={`nav-group-${group.id}`}>
            <p id={`nav-group-${group.id}`} className='side-group nav-group-title'>
              {group.label}
            </p>
            <ul className='nav-list'>
              {group.tabs.map((id) => (
                <li key={id}>
                  <SideLink tab={tabById(id)} active={active === id} onSelect={onSelect} badge={badges?.[id]} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className='side-foot nav-foot'>
        <p className='nav-foot-ai'>
          <span className={cx('nav-ai-dot', aiTone === 'ok' && 'is-ok')} aria-hidden />
          {aiLabel}
        </p>
        <p>进度仅保存在本机浏览器</p>
      </div>
    </aside>
  );
}

function SideLink({ tab, active, onSelect, badge }: { tab: TabInfo; active: boolean; onSelect: (tab: TabId) => void; badge?: number }) {
  const Icon = tab.icon;
  return (
    <a
      href={`#${tab.id}`}
      className={cx('side-link nav-link', active && 'is-active')}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => {
        event.preventDefault();
        onSelect(tab.id);
      }}
    >
      <span className='nav-icon' aria-hidden>
        <Icon size={18} />
      </span>
      <span className='nav-link-label'>{tab.label}</span>
      {badge ? <span className='nav-badge' aria-hidden>{formatBadge(badge)}</span> : null}
      {badge ? <span className='sr-only'>（{badge} 项待处理）</span> : null}
    </a>
  );
}

export function MobileNav({ active, onSelect, badges }: { active: TabId; onSelect: (tab: TabId) => void; badges?: Partial<Record<TabId, number>> }) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(true);
  const moreActive = !MOBILE_MAIN.includes(active);
  const activeTab = TABS.find((tab) => tab.id === active);
  const moreBadge = TABS.filter((tab) => !MOBILE_MAIN.includes(tab.id)).reduce((sum, tab) => sum + (badges?.[tab.id] || 0), 0);

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const trigger = triggerRef.current;
    restoreFocus.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = (): HTMLElement[] => (sheet ? Array.prototype.slice.call(sheet.querySelectorAll('button:not([disabled]), a[href]')) : []);
    const initial = (sheet ? sheet.querySelector<HTMLElement>('[aria-current=page]') : null) || focusables()[0];
    if (initial) initial.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const inside = sheet ? sheet.contains(current) : false;
      if (event.shiftKey && (current === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (restoreFocus.current && trigger) trigger.focus();
    };
  }, [open]);

  function choose(tab: TabId) {
    // Navigation moves focus to the main region, so the sheet must not pull it back.
    restoreFocus.current = false;
    setOpen(false);
    onSelect(tab);
  }

  return (
    <>
      {open ? (
        <div className='more-backdrop nav-sheet-backdrop' onClick={() => setOpen(false)}>
          <div ref={sheetRef} className='more-sheet nav-sheet' role='dialog' aria-modal='true' aria-labelledby='nav-sheet-title' onClick={(event) => event.stopPropagation()}>
            <div className='nav-sheet-handle' aria-hidden />
            <div className='nav-sheet-head'>
              <p id='nav-sheet-title' className='nav-sheet-title'>
                更多功能
              </p>
              <button type='button' className='icon-btn nav-sheet-close' onClick={() => setOpen(false)} aria-label='关闭更多功能'>
                <X aria-hidden size={20} />
              </button>
            </div>
            {NAV_GROUPS.map((group) => {
              const items = group.tabs.filter((id) => !MOBILE_MAIN.includes(id));
              if (!items.length) return null;
              return (
                <div key={group.id} className='nav-sheet-group' role='group' aria-labelledby={`nav-sheet-group-${group.id}`}>
                  <p id={`nav-sheet-group-${group.id}`} className='nav-sheet-group-title'>
                    {group.label}
                  </p>
                  <div className='nav-sheet-grid'>
                    {items.map((id) => {
                      const tab = tabById(id);
                      const Icon = tab.icon;
                      const badge = badges?.[id];
                      const current = active === id;
                      return (
                        <button key={id} type='button' className={cx('more-item nav-sheet-item', current && 'is-active')} aria-current={current ? 'page' : undefined} onClick={() => choose(id)}>
                          <span className='nav-sheet-item-layout'>
                          <span className='nav-icon' aria-hidden>
                            <Icon size={20} />
                          </span>
                          <span className='nav-sheet-label'>{tab.label}</span>
                          {badge || current ? (
                            <span className='nav-sheet-trail' aria-hidden>
                              {badge ? <span className='nav-badge'>{formatBadge(badge)}</span> : null}
                              {current ? <span className='nav-sheet-current'>当前</span> : null}
                            </span>
                          ) : null}
                          </span>
                          {badge ? <span className='sr-only'>（{badge} 项待处理）</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <nav className='mobile-nav nav-dock' aria-label='主导航'>
        {MOBILE_MAIN.map((id) => {
          const tab = tabById(id);
          const Icon = tab.icon;
          const badge = badges?.[id];
          const current = active === id;
          return (
            <button key={id} type='button' className={cx('mobile-link nav-dock-link', current && 'is-active')} aria-current={current ? 'page' : undefined} onClick={() => choose(id)}>
              <span className='nav-dock-icon' aria-hidden>
                <Icon size={20} />
                {badge ? <span className='nav-dock-badge'>{formatBadge(badge)}</span> : null}
              </span>
              <span className='nav-dock-label'>{tab.short}</span>
              {badge ? <span className='sr-only'>（{badge} 项待处理）</span> : null}
            </button>
          );
        })}
        <button ref={triggerRef} type='button' className={cx('mobile-link nav-dock-link nav-dock-more', (moreActive || open) && 'is-active')} aria-expanded={open} aria-haspopup='dialog' onClick={() => setOpen((value) => !value)}>
          <span className='nav-dock-icon' aria-hidden>
            <MoreHorizontal size={20} />
            {moreBadge ? <span className='nav-dock-dot' /> : null}
          </span>
          <span className='nav-dock-label'>{moreActive && activeTab ? activeTab.short : '更多'}</span>
          {moreActive ? <span className='sr-only'>（当前页面，打开更多功能）</span> : null}
          {moreBadge ? <span className='sr-only'>（{moreBadge} 项待处理）</span> : null}
        </button>
      </nav>
    </>
  );
}
