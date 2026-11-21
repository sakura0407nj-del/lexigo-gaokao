"use client";
import {roundedRect} from './canvas-path';
import {useEffect, useRef} from 'react';

export interface GameSceneProps {crowd: number; lane: 0 | 1 | null; feedback: 'good' | 'bad' | null; paused?: boolean; finished?: boolean; progress?: number}
export function GameScene(props: GameSceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null), latest = useRef(props), redraw = useRef<() => void>(() => {});
  latest.current = props;
  useEffect(() => {redraw.current();}, [props.crowd, props.lane, props.feedback, props.paused, props.finished]);
  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, width = 800, height = 350, lane = 0, time = 0, previous = performance.now();
    const project = (x: number, z: number) => ({x: width / 2 + x * width * (.06 + .46 * z), y: height * (.17 + .91 * Math.pow(z, 1.35)), size: .18 + z});
    function draw(now = performance.now()) {
      if (!ctx) return;
      const p = latest.current, moving = !motion.matches && !p.paused && !document.hidden;
      if (moving) time += Math.min(40, now - previous) / 1000;
      previous = now;
      const targetLane = p.lane === null ? 0 : p.lane === 0 ? -.42 : .42;
      lane = moving ? lane + (targetLane - lane) * .12 : targetLane;
      const sky = ctx.createLinearGradient(0, 0, 0, height); sky.addColorStop(0, '#172e65'); sky.addColorStop(.54, '#74cde3'); sky.addColorStop(1, '#d5f3ee');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff40';
      for (let n = 0; n < 7; n++) {const x = ((n * 157 + time * (n % 2 ? 7 : -5)) % (width + 150) + width + 150) % (width + 150) - 75; ctx.beginPath(); ctx.ellipse(x, 40 + n % 3 * 34, 48, 11, 0, 0, Math.PI * 2); ctx.fill();}
      const a = project(-1, 0), b = project(1, 0), c = project(1, 1), d = project(-1, 1);
      ctx.fillStyle = '#203d6e'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y + 20); ctx.lineTo(d.x, d.y + 20); ctx.fill();
      const road = ctx.createLinearGradient(0, a.y, 0, height); road.addColorStop(0, '#6892ba'); road.addColorStop(1, '#adc7d7'); ctx.fillStyle = road; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.fill();
      for (let n = 0; n < 17; n++) {const z = ((n / 17 + time * .18) % 1); const l = project(-1, z), r = project(1, z); ctx.strokeStyle = '#eafaff45'; ctx.lineWidth = 1 + z; ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();}
      for (const side of [-1, 1]) {ctx.strokeStyle = '#c4fff1'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(project(side, 0).x, a.y - 5); ctx.lineTo(project(side, 1).x, c.y - 5); ctx.stroke();}
      ctx.setLineDash([9, 11]); ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(width / 2, a.y); ctx.lineTo(width / 2, height); ctx.stroke(); ctx.setLineDash([]);
      const gateDepth = .36 + Math.sin(time * 1.3) * .025;
      for (const side of [0, 1]) {
        const center = project(side === 0 ? -.5 : .5, gateDepth), gateWidth = width * .23, gateHeight = height * .22;
        const color = p.feedback && side === p.lane ? p.feedback === 'good' ? '#4bf4bc' : '#ffab86' : '#b2f4ff';
        ctx.fillStyle = color + '44'; ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath(); roundedRect(ctx, center.x - gateWidth / 2, center.y - gateHeight, gateWidth, gateHeight, 9); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = '800 21px system-ui'; ctx.textAlign = 'center'; ctx.fillText(side === 0 ? 'A' : 'B', center.x, center.y - gateHeight * .44);
      }
      const people = Math.min(70, Math.max(0, p.crowd));
      for (let n = 0; n < people; n++) {
        const row = Math.floor(n / 7), col = n % 7, point = project(lane + (col - 3) * .083, .62 + row * .032);
        const size = Math.min(width / 42, 15) * point.size, bob = moving ? Math.sin(time * 13 + n * 1.7) * size * .16 : 0;
        ctx.fillStyle = '#173c6250'; ctx.beginPath(); ctx.ellipse(point.x, point.y + size * .3, size * .7, size * .24, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#008fba'; ctx.lineWidth = size * .29; ctx.lineCap = 'round';
        const stride = moving ? Math.sin(time * 13 + n) * size * .25 : 0;
        ctx.beginPath(); ctx.moveTo(point.x - size * .2, point.y - size * .35 + bob); ctx.lineTo(point.x - size * .24 - stride, point.y + size * .15); ctx.moveTo(point.x + size * .2, point.y - size * .35 + bob); ctx.lineTo(point.x + size * .24 + stride, point.y + size * .15); ctx.stroke();
        ctx.fillStyle = n % 4 === 0 ? '#95f6ff' : '#30dcf3'; ctx.beginPath(); roundedRect(ctx, point.x - size * .43, point.y - size * 1.6 + bob, size * .86, size * 1.3, size * .36); ctx.fill();
        ctx.beginPath(); ctx.arc(point.x, point.y - size * 1.97 + bob, size * .44, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#31c5e9'; ctx.lineWidth = size * .2; ctx.beginPath(); ctx.moveTo(point.x - size * .4, point.y - size * 1.3 + bob); ctx.lineTo(point.x - size * .66, point.y - size * .65 + stride); ctx.moveTo(point.x + size * .4, point.y - size * 1.3 + bob); ctx.lineTo(point.x + size * .66, point.y - size * .65 - stride); ctx.stroke();
      }
      if (p.feedback || p.finished) for (let n = 0; n < 25; n++) {const phase = (time * .6 + n / 25) % 1; const x = width * .5 + Math.sin(n * 2.4) * width * .36 * phase; const y = height * .36 - Math.cos(n * 2.4) * height * .4 * phase; ctx.fillStyle = ['#fff4a5', '#6ef6cf', '#bfb4ff'][n % 3]; ctx.globalAlpha = 1 - phase; ctx.fillRect(x, y, 5, 7);}
      ctx.globalAlpha = 1;
      if (p.finished) {for (let level = 0; level < 4; level++) {const towerWidth = 72 - level * 12; ctx.fillStyle = level % 2 ? '#ffed9b' : '#f5d26e'; ctx.fillRect(width / 2 - towerWidth / 2, height * .35 - level * 15, towerWidth, 12);} ctx.fillStyle = '#fff5c3'; ctx.font = `800 ${Math.min(24, width / 19)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('KNOWLEDGE UNLOCKED', width / 2, 36);}
      if (!document.hidden && !motion.matches && !p.paused) frame = requestAnimationFrame(draw);
    }
    const refresh = () => {cancelAnimationFrame(frame); previous = performance.now(); draw();};
    const resize = () => {const rect = surface.getBoundingClientRect(); width = rect.width || 800; height = rect.height || 350; const dpr = Math.min(2, devicePixelRatio || 1); surface.width = Math.round(width * dpr); surface.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); refresh();};
    const observer = new ResizeObserver(resize); observer.observe(surface); redraw.current = refresh;
    document.addEventListener('visibilitychange', refresh); motion.addEventListener('change', refresh); resize();
    return () => {cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', refresh); motion.removeEventListener('change', refresh); redraw.current = () => {};};
  }, []);
  return <canvas ref={canvas} className="game-canvas" aria-hidden="true" />;
}
