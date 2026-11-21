"use client";

import {roundedRect} from './canvas-path';
import {useEffect, useRef} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import type {FishPoint, FishRun} from '@/lib/fish-types';
import './fish-scene.css';

export interface FishSceneProps {
  state: FishRun;
  onPointerTarget: (point: FishPoint | null) => void;
  paused?: boolean;
  className?: string;
}

const WORLD_W = 1000, WORLD_H = 600;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const PALETTES = [
  ['#91e6ed', '#328fbe', '#b6faff'], ['#ffcca9', '#d27480', '#ffe9cc'],
  ['#d0b5ff', '#756dc3', '#ede5ff'], ['#addfbf', '#489c9c', '#ddffe8'],
  ['#f3d68b', '#be9870', '#fff1c6'], ['#a8c4ff', '#668dc9', '#e0eaff'],
];
type Viewport = {width: number; height: number; scale: number; x: number; y: number};
type LabelRect = {x: number; y: number; width: number; height: number};

function body(ctx: CanvasRenderingContext2D, point: FishPoint, radius: number, facing: number, id: number, time: number, player = false) {
  const palette = player ? ['#e1fff0', '#28bea7', '#baffd9'] : PALETTES[Math.abs(Math.imul(id + 7, 2654435761)) % PALETTES.length];
  const silhouette = player ? 0 : Math.abs(id * 13) % 3;
  const wag = Math.sin(time * (player ? 8 : 5) + id * 1.6);
  const long = silhouette === 1 ? 1.35 : silhouette === 2 ? 1.04 : 1.2;
  ctx.save(); ctx.translate(point.x, point.y); ctx.scale(facing, 1);
  if (player) {
    const halo = ctx.createRadialGradient(0, 0, radius * .2, 0, 0, radius * 2.3);
    halo.addColorStop(0, '#95ffd342'); halo.addColorStop(.5, '#4ff0c925'); halo.addColorStop(1, '#56ffc000');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, radius * 2.3, 0, Math.PI * 2); ctx.fill();
  }
  // Tails and fins use only an ID-based palette; they never reveal the current target's part of speech.
  ctx.fillStyle = palette[1]; ctx.beginPath(); ctx.moveTo(-radius * .65, 0);
  ctx.quadraticCurveTo(-radius * 1.35, -radius * .2, -radius * (1.65 + wag * .08), -radius * .75);
  ctx.quadraticCurveTo(-radius * 1.5 + wag * 3, 0, -radius * 1.65, radius * .75);
  ctx.quadraticCurveTo(-radius * 1.3, radius * .2, -radius * .65, 0); ctx.fill();
  ctx.globalAlpha = .62; ctx.beginPath(); ctx.moveTo(-radius * .45, -radius * .5); ctx.quadraticCurveTo(-radius * .3, -radius * 1.35, radius * .35, -radius * .52); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-radius * .1, radius * .45); ctx.quadraticCurveTo(-radius * .35, radius * 1.2, radius * .45, radius * .5); ctx.fill(); ctx.globalAlpha = 1;
  const fill = ctx.createLinearGradient(0, -radius, 0, radius); fill.addColorStop(0, palette[2]); fill.addColorStop(.35, palette[0]); fill.addColorStop(1, palette[1]);
  ctx.fillStyle = fill; ctx.beginPath();
  if (silhouette === 2) {ctx.moveTo(radius * 1.05, 0); ctx.bezierCurveTo(radius * .4, -radius * 1.2, -radius * .7, -radius * .8, -radius, 0); ctx.bezierCurveTo(-radius * .7, radius * .8, radius * .4, radius * 1.2, radius * 1.05, 0);}
  else ctx.ellipse(0, 0, radius * long, radius * (silhouette === 1 ? .55 : .73), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f1ffff4d'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = '#ffffff32'; ctx.beginPath(); ctx.ellipse(-radius * .1, -radius * .22, radius * .7, radius * .15, -.1, 0, Math.PI * 2); ctx.fill();
  if (silhouette === 2) {ctx.strokeStyle = '#20436a30'; ctx.lineWidth = radius * .12; for (const x of [-.4, -.1]) {ctx.beginPath(); ctx.moveTo(radius * x, -radius * .56); ctx.lineTo(radius * (x - .12), radius * .56); ctx.stroke();}}
  ctx.fillStyle = palette[1]; ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(-radius * .05, -radius * .05); ctx.quadraticCurveTo(-radius * .5, radius * (.65 + wag * .12), radius * .3, radius * .38); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#f5ffff'; ctx.beginPath(); ctx.arc(radius * .62, -radius * .17, radius * .16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#12364f'; ctx.beginPath(); ctx.arc(radius * .68, -radius * .15, radius * .085, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(radius * .7, -radius * .2, radius * .028, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#174e6859'; ctx.lineWidth = Math.max(1, radius * .035); ctx.beginPath(); ctx.arc(radius * .94, radius * .09, radius * .12, .5, 1.8); ctx.stroke();
  ctx.restore();
}

function environment(ctx: CanvasRenderingContext2D, view: Viewport, time: number) {
  const {width, height} = view;
  const sea = ctx.createLinearGradient(0, 0, 0, height); sea.addColorStop(0, '#167f9f'); sea.addColorStop(.35, '#096283'); sea.addColorStop(.75, '#093c60'); sea.addColorStop(1, '#082c49');
  ctx.fillStyle = sea; ctx.fillRect(0, 0, width, height);
  // Soft sunlight and broad parallax ripples establish depth without competing with word labels.
  for (let ray = 0; ray < 5; ray++) {
    const x = width * (ray * .28 - .2) + Math.sin(time * .13 + ray) * 12;
    const light = ctx.createLinearGradient(x, 0, x + width * .22, height); light.addColorStop(0, '#cefff222'); light.addColorStop(1, '#a0fff000');
    ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + width * .1, 0); ctx.lineTo(x + width * .42, height); ctx.lineTo(x + width * .15, height); ctx.fill();
  }
  for (let layer = 0; layer < 3; layer++) {
    ctx.beginPath(); ctx.moveTo(0, 0); for (let x = 0; x <= width + 20; x += 20) ctx.lineTo(x, 12 + layer * 11 + Math.sin(x / (75 + layer * 17) + time * (.6 - layer * .13)) * (4 + layer));
    ctx.lineTo(width, 0); ctx.closePath(); ctx.fillStyle = ['#b7fbec14', '#8ce3e31c', '#c8ffff13'][layer]; ctx.fill();
  }
  for (let n = 0; n < 22; n++) {
    const x = ((n * 137.13) % width) + Math.sin(time * .4 + n) * 9;
    const y = height - ((n * 73.71 + time * (6 + n % 4 * 3)) % (height + 30));
    const radius = 1.2 + n % 4 * .75; ctx.strokeStyle = '#bceff22d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e4ffff45'; ctx.beginPath(); ctx.arc(x - radius * .25, y - radius * .35, .7, 0, Math.PI * 2); ctx.fill();
  }
}

function seabed(ctx: CanvasRenderingContext2D, time: number) {
  ctx.fillStyle = '#184755'; ctx.beginPath(); ctx.moveTo(0, 573); ctx.bezierCurveTo(190, 543, 300, 603, 540, 570); ctx.bezierCurveTo(740, 542, 890, 578, 1000, 552); ctx.lineTo(1000, 600); ctx.lineTo(0, 600); ctx.fill();
  ctx.fillStyle = '#6b8e7e22'; ctx.beginPath(); ctx.moveTo(0, 592); ctx.bezierCurveTo(330, 560, 540, 607, 1000, 579); ctx.lineTo(1000, 600); ctx.lineTo(0, 600); ctx.fill();
  for (let bed = 0; bed < 10; bed++) {
    const x = bed * 113 + 19, sway = Math.sin(time * .85 + bed) * 8;
    for (let leaf = 0; leaf < 4; leaf++) {
      const length = 31 + (bed * 17 + leaf * 13) % 61;
      ctx.strokeStyle = ['#378c8266', '#40a59b66', '#5fb2a559'][leaf % 3]; ctx.lineWidth = 3 + leaf;
      ctx.beginPath(); ctx.moveTo(x + leaf * 8, 596); ctx.bezierCurveTo(x - 14 + leaf * 8, 578, x + 17 + sway, 580 - length * .55, x + leaf * 3 + sway, 596 - length); ctx.stroke();
    }
  }
  for (const [base, color] of [[73, '#c382a152'], [870, '#7296c35e']] as const) {
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 6;
    for (let branch = 0; branch < 5; branch++) {ctx.beginPath(); ctx.moveTo(base, 595); ctx.quadraticCurveTo(base + (branch - 2) * 12, 570, base + (branch - 2) * 22, 542 + Math.abs(branch - 2) * 9); ctx.stroke();}
  }
  for (let n = 0; n < 35; n++) {ctx.fillStyle = n % 2 ? '#b6c5a52b' : '#032c3a42'; ctx.beginPath(); ctx.ellipse((n * 127.5) % 1000, 581 + n % 4 * 5, 2 + n % 3, 1.4, .3, 0, Math.PI * 2); ctx.fill();}
}

function label(ctx: CanvasRenderingContext2D, word: string, point: FishPoint, radius: number, scale: number, used: LabelRect[], player = false) {
  const font = Math.max(player ? 26 : 22, (player ? 14 : 13) / scale), padding = 7 / scale;
  ctx.font = `${player ? 800 : 650} ${font}px system-ui, sans-serif`;
  const width = Math.min(WORLD_W - 18, ctx.measureText(word).width + padding * 2), height = font * 1.5;
  let x = clamp(point.x - width / 2, 8, WORLD_W - width - 8), y = clamp(point.y - radius * .95 - height - 6 / scale, 5, WORLD_H - height - 5);
  const overlaps = (test: LabelRect) => used.some(other => test.x < other.x + other.width + 5 && test.x + test.width + 5 > other.x && test.y < other.y + other.height + 3 && test.y + test.height + 3 > other.y);
  const initial = y;
  for (let attempt = 0; attempt < 5 && overlaps({x, y, width, height}); attempt++) y = clamp(attempt % 2 ? initial - height * Math.ceil((attempt + 1) / 2) : point.y + radius + 4 / scale + height * Math.floor(attempt / 2), 5, WORLD_H - height - 5);
  used.push({x, y, width, height});
  ctx.strokeStyle = player ? '#c5ffe862' : '#d9f9ff36'; ctx.lineWidth = .7 / scale; ctx.beginPath(); ctx.moveTo(point.x, point.y - radius * .6); ctx.lineTo(clamp(point.x, x + 7, x + width - 7), y > point.y ? y : y + height); ctx.stroke();
  ctx.fillStyle = player ? '#d7ffed' : '#062b46dc'; ctx.strokeStyle = player ? '#caffde' : '#b9e5f05c'; ctx.lineWidth = 1 / scale;
  ctx.beginPath(); roundedRect(ctx, x, y, width, height, 6 / scale); ctx.fill(); ctx.stroke();
  ctx.fillStyle = player ? '#145547' : '#f1fcff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(word, x + width / 2, y + height / 2 + .5 / scale, width - padding); ctx.textBaseline = 'alphabetic';
}

export function FishScene({state, onPointerTarget, paused = false, className = ''}: FishSceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null), latest = useRef({state, paused, onPointerTarget});
  const view = useRef<Viewport>({width: 1000, height: 600, scale: 1, x: 0, y: 0});
  const pointer = useRef<{id: number; point: FishPoint} | null>(null), draw = useRef<() => void>(() => {});
  latest.current = {state, paused, onPointerTarget};
  useEffect(() => {draw.current();}, [state, paused]);
  useEffect(() => {
    const surface = canvas.current, ctx = surface?.getContext('2d');
    if (!surface || !ctx) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const render = () => {
      if (document.hidden) return;
      const r = latest.current.state, v = view.current, time = motion.matches ? 0 : r.elapsed;
      ctx.save(); ctx.setTransform(Math.min(2, devicePixelRatio || 1), 0, 0, Math.min(2, devicePixelRatio || 1), 0, 0);
      environment(ctx, v, time);
      ctx.translate(v.x, v.y); ctx.scale(v.scale, v.scale);
      ctx.beginPath(); ctx.rect(0, 0, WORLD_W, WORLD_H); ctx.clip();
      seabed(ctx, time);
      // A faint world frame makes the letterboxed play area legible on portrait phones.
      ctx.strokeStyle = '#b7ffff0f'; ctx.lineWidth = 1 / v.scale; ctx.strokeRect(2, 2, WORLD_W - 4, WORLD_H - 4);
      const prey = [...r.fish].sort((a, b) => a.y - b.y);
      for (const fish of prey) body(ctx, fish, fish.radius, fish.facing, fish.id, time);
      if (r.player.invulnerableUntil > r.elapsed) {ctx.save(); ctx.strokeStyle = '#effff578'; ctx.lineWidth = 1.5 / v.scale; ctx.setLineDash([5 / v.scale, 6 / v.scale]); ctx.beginPath(); ctx.arc(r.player.x, r.player.y, r.player.radius * 1.65, 0, Math.PI * 2); ctx.stroke(); ctx.restore();}
      body(ctx, r.player, r.player.radius, r.player.facing, 0, time, true);
      const labels: LabelRect[] = [];
      label(ctx, r.target.word, r.player, r.player.radius, v.scale, labels, true);
      for (const fish of prey) label(ctx, fish.word.word, fish, fish.radius, v.scale, labels);
      if (pointer.current && !latest.current.paused) {const point = pointer.current.point; ctx.strokeStyle = '#dbfff69c'; ctx.lineWidth = 1 / v.scale; ctx.beginPath(); ctx.arc(point.x, point.y, 8 / v.scale, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(point.x - 12 / v.scale, point.y); ctx.lineTo(point.x - 4 / v.scale, point.y); ctx.moveTo(point.x + 4 / v.scale, point.y); ctx.lineTo(point.x + 12 / v.scale, point.y); ctx.stroke();}
      for (const event of r.events.slice(-8)) {
        const age = r.elapsed - event.elapsed;
        if (age < 0 || age > 1.1 || event.type === 'change') continue;
        ctx.save(); ctx.globalAlpha = 1 - age / 1.1; const x = event.x, y = event.y - (motion.matches ? 0 : age * 60);
        ctx.font = `800 ${Math.max(28, 17 / v.scale)}px system-ui`; ctx.textAlign = 'center'; ctx.lineWidth = 4 / v.scale; ctx.strokeStyle = '#06354d';
        const text = event.scoreDelta > 0 ? `+${event.scoreDelta}` : String(event.scoreDelta); ctx.strokeText(text, x, y); ctx.fillStyle = event.type === 'correct' ? '#d5ffad' : '#ffd3bb'; ctx.fillText(text, x, y);
        if (!motion.matches && event.type === 'correct') for (let i = 0; i < 7; i++) {const angle = i * Math.PI * 2 / 7; ctx.fillStyle = i % 2 ? '#f8efb2' : '#b3f7dc'; ctx.beginPath(); ctx.arc(x + Math.cos(angle) * age * 65, event.y + Math.sin(angle) * age * 45, 2.2 / v.scale, 0, Math.PI * 2); ctx.fill();}
        ctx.restore();
      }
      ctx.restore();
    };
    const resize = () => {const rect = surface.getBoundingClientRect(); const width = Math.max(1, rect.width), height = Math.max(1, rect.height), dpr = Math.min(2, devicePixelRatio || 1), scale = Math.min(width / WORLD_W, height / WORLD_H); surface.width = Math.round(width * dpr); surface.height = Math.round(height * dpr); view.current = {width, height, scale, x: (width - WORLD_W * scale) / 2, y: (height - WORLD_H * scale) / 2}; render();};
    draw.current = render; const observer = new ResizeObserver(resize); observer.observe(surface); motion.addEventListener('change', render); document.addEventListener('visibilitychange', render); resize();
    return () => {observer.disconnect(); motion.removeEventListener('change', render); document.removeEventListener('visibilitychange', render); draw.current = () => {}; if (pointer.current) {pointer.current = null; latest.current.onPointerTarget(null);}};
  }, []);
  useEffect(() => {if ((paused || state.finished) && pointer.current) {const id = pointer.current.id; pointer.current = null; if (canvas.current?.hasPointerCapture(id)) canvas.current.releasePointerCapture(id); onPointerTarget(null);}}, [paused, state.finished, onPointerTarget]);

  const target = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(), v = view.current;
    return {x: clamp((event.clientX - rect.left - v.x) / v.scale, 0, WORLD_W), y: clamp((event.clientY - rect.top - v.y) / v.scale, 0, WORLD_H)};
  };
  const release = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    latest.current.onPointerTarget(null); draw.current();
  };
  return <div className={`fish-scene${paused ? ' is-paused' : ''}${className ? ` ${className}` : ''}`}>
    <canvas ref={canvas} tabIndex={0} aria-label="大鱼吃小鱼操作区域" onPointerDown={event => {if (paused || state.finished || pointer.current || event.button !== 0) return; event.preventDefault(); event.currentTarget.focus({preventScroll: true}); const point = target(event); pointer.current = {id: event.pointerId, point}; event.currentTarget.setPointerCapture(event.pointerId); onPointerTarget(point); draw.current();}} onPointerMove={event => {if (pointer.current?.id !== event.pointerId || paused) return; event.preventDefault(); const point = target(event); pointer.current.point = point; onPointerTarget(point); draw.current();}} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onPointerLeave={event => {if (event.pointerType === 'mouse') release(event);}} />
    <div className="fish-scene-hint" aria-hidden="true"><span />{state.finished ? '本轮探索完成' : paused ? '海洋已暂停' : '按住拖动航行 · 松手停下 · 也可用方向键'}</div>
  </div>;
}
