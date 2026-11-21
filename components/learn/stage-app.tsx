'use client';
import { Component, lazy, Suspense, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { GraduationCap, Sprout } from 'lucide-react';
import { LearnApp } from './learn-app';
import { ProgressProvider } from './progress';
import { getLearningStage, getPrimaryGrade } from '@/lib/learning-stage';
import './stage.css';

const PrimaryApp = lazy(() => import('../primary/primary-app').then(module => ({ default: module.PrimaryApp })));

class LearningBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role='alert' className='primary-stage-loading stage-error'>
        <h2>这一页暂时没有加载成功</h2>
        <p>请检查网络后重新载入，已保存的学习记录会保留。</p>
        <button type='button' className='btn btn-primary' onClick={() => window.location.reload()}>重新加载</button>
      </div>
    ) : this.props.children;
  }
}

export function StageApp() {
  const stage = getLearningStage(), grade = getPrimaryGrade();
  useLayoutEffect(() => {
    const panel = document.getElementById('startup');
    if (panel) panel.hidden = true;
    window.dispatchEvent(new Event('lexigo-ready'));
  }, []);
  useEffect(() => { document.title = stage === 'primary' ? `拾词 LexiGo · 小学${grade}年级英语` : '拾词 LexiGo · 高考英语学习室'; }, [stage, grade]);
  let rememberedGrade = 3; try { const n = Number(localStorage.getItem('lexigo.primary.grade.v1')); if ([3, 4, 5, 6].includes(n)) rememberedGrade = n; } catch {}
  const isPrimary = stage === 'primary';
  const isHigh = stage === 'high';
  return (
    <div className={`stage-shell stage-${stage}`}>
      <header className='learning-stage-bar stage-bar'>
        <p className='stage-bar-label'>
          <GraduationCap size={18} aria-hidden />
          <span>选择学习阶段</span>
        </p>
        <nav className='stage-switch' aria-label='学习阶段'>
          <a className={isPrimary ? 'stage-tab selected' : 'stage-tab'} href={`?stage=primary&grade=${isPrimary ? grade : rememberedGrade}#today`} aria-current={isPrimary ? 'page' : undefined}>
            <span className='stage-tab-icon' aria-hidden><Sprout size={18} /></span>
            <span className='stage-tab-text'>
              <span className='stage-tab-name'>小学版</span>
              <small className='stage-tab-meta'>{isPrimary ? `当前 ${grade} 年级` : '3—6年级'}</small>
            </span>
            {isPrimary ? <span className='stage-tab-current' aria-hidden>当前</span> : null}
          </a>
          <a className={isHigh ? 'stage-tab selected' : 'stage-tab'} href='?stage=high#today' aria-current={isHigh ? 'page' : undefined}>
            <span className='stage-tab-icon' aria-hidden><GraduationCap size={18} /></span>
            <span className='stage-tab-text'>
              <span className='stage-tab-name'>高中版</span>
              <small className='stage-tab-meta'>高考英语</small>
            </span>
            {isHigh ? <span className='stage-tab-current' aria-hidden>当前</span> : null}
          </a>
        </nav>
        <small className='stage-bar-note'>各学段、年级的记录独立保存</small>
      </header>
      <LearningBoundary>
        {isPrimary ? (
          <ProgressProvider>
            <Suspense fallback={<p role='status' className='primary-stage-loading'>正在准备小学英语学习室…</p>}>
              <PrimaryApp />
            </Suspense>
          </ProgressProvider>
        ) : (
          <LearnApp />
        )}
      </LearningBoundary>
    </div>
  );
}
