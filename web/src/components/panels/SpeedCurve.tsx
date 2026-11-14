import { useRef, useState } from 'react';
import { useEditor } from '@/store';
import { sourceTimeAt } from '@/lib/clips';
import type { Clip, SpeedPt } from '@/types';
import { clipOps } from '../ClipLane';
import { Button } from '@/components/ui/button';
import { CURVE_MAX, CURVE_MIN, CURVE_PRESETS, placeShape, speedAtSrc } from '@/lib/speedCurve';

const W = 264, H = 120, PAD = 8;
const LOG_MIN = Math.log10(CURVE_MIN), LOG_MAX = Math.log10(CURVE_MAX);
const yOf = (s: number) => PAD + (H - 2 * PAD) * (1 - (Math.log10(s) - LOG_MIN) / (LOG_MAX - LOG_MIN));
const sOf = (y: number) => Math.min(CURVE_MAX, Math.max(CURVE_MIN, Math.pow(10, LOG_MIN + (1 - (y - PAD) / (H - 2 * PAD)) * (LOG_MAX - LOG_MIN))));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** CapCut-style speed curve: presets plus a graph of speed along the clip. Drag a point, click to add one, double-click to remove. */
export function SpeedCurve({ clip }: { clip: Clip }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const span = clip.duration * clip.speed; // source seconds this clip plays
  const from = clip.in, to = clip.in + span;
  const pts = clip.curve;
  const [sel, setSel] = useState<string>(pts ? 'custom' : 'none');
  const time = useEditor((st) => st.time);
  const base = span; // length at 1×
  const head = time >= clip.start && time < clip.start + clip.duration ? sourceTimeAt(clip, time) : null;
  const xOf = (x: number) => ((x - from) / span) * W;
  const srcOfX = (px: number) => from + (px / W) * span;

  const write = (next: SpeedPt[], key = `curve-${clip.id}`) => clipOps.curve(clip.id, next.sort((a, b) => a.x - b.x), key);
  const local = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { px: ((e.clientX - r.left) / r.width) * W, py: ((e.clientY - r.top) / r.height) * H };
  };

  const path = [];
  for (let i = 0; i <= 80; i++) {
    const x = from + (span * i) / 80;
    path.push(`${i ? 'L' : 'M'}${xOf(x).toFixed(1)},${yOf(speedAtSrc(pts ?? [{ x: 0, s: clip.speed }], x)).toFixed(1)}`);
  }
  const inside = (pts ?? []).map((p, i) => ({ p, i })).filter(({ p }) => p.x >= from - 1e-6 && p.x <= to + 1e-6);

  const move = (e: React.PointerEvent) => {
    if (drag.current === null || !pts) return;
    const { px, py } = local(e);
    const i = drag.current, lo = pts[i - 1]?.x ?? 0, hi = pts[i + 1]?.x ?? clip.sourceDuration;
    const x = Math.min(hi - 0.02, Math.max(lo + 0.02, srcOfX(Math.min(W, Math.max(0, px)))));
    write(pts.map((p, k) => (k === i ? { x: r2(x), s: r2(sOf(py)) } : p)));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1.5">
        <Tile name="None" on={sel === 'none'} onClick={() => { setSel('none'); clipOps.curve(clip.id, undefined); }}><NoneIcon /></Tile>
        <Tile name="Custom" on={sel === 'custom'} onClick={() => { setSel('custom'); clipOps.curve(clip.id, placeShape([[0, 1], [0.25, 1], [0.5, 1], [0.75, 1], [1, 1]], from, span)); }}><SlidersIcon /></Tile>
        {CURVE_PRESETS.map((pr) => {
          const shape = placeShape(pr.shape, 0, 1);
          const d = Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${(2 + (i / 40) * 52).toFixed(1)},${(2 + 24 * (1 - (Math.log10(speedAtSrc(shape, i / 40)) - LOG_MIN) / (LOG_MAX - LOG_MIN))).toFixed(1)}`).join('');
          return (
            <Tile key={pr.id} name={pr.name} on={sel === pr.id} onClick={() => { setSel(pr.id); clipOps.curve(clip.id, placeShape(pr.shape, from, span)); }}>
              <svg viewBox="0 0 56 28" className="h-7 w-full text-primary"><line x1="0" x2="56" y1="14" y2="14" stroke="currentColor" strokeOpacity="0.25" /><path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </Tile>
          );
        })}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
        <span>Duration</span>
        <span className="tabular-nums text-muted-foreground">{base.toFixed(1)}s → <span className="text-foreground">{clip.duration.toFixed(1)}s</span></span>
      </div>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none rounded-lg border bg-card"
        onPointerMove={move} onPointerUp={() => { drag.current = null; }}
        onPointerDown={(e) => {
          if (e.target !== svg.current && (e.target as Element).tagName !== 'rect') return;
          const { px, py } = local(e);
          const x = r2(srcOfX(px));
          write([...(pts ?? [{ x: from, s: clip.speed }, { x: to, s: clip.speed }]), { x, s: r2(sOf(py)) }], `curve-add-${clip.id}`);
        }}>
        <rect width={W} height={H} fill="transparent" />
        {[0.5, 1, 2, 4].map((s) => (
          <g key={s}>
            <line x1={0} x2={W} y1={yOf(s)} y2={yOf(s)} stroke="currentColor" strokeOpacity={s === 1 ? 0.35 : 0.12} strokeDasharray={s === 1 ? undefined : '3 3'} />
            <text x={3} y={yOf(s) - 2} fontSize="8" fill="currentColor" fillOpacity={0.5}>{s}×</text>
          </g>
        ))}
        {head !== null && <line x1={xOf(head)} x2={xOf(head)} y1={0} y2={H} stroke="currentColor" strokeOpacity={0.7} pointerEvents="none" />}
        <path d={path.join('')} fill="none" stroke="var(--primary)" strokeWidth="2" pointerEvents="none" />
        {inside.map(({ p, i }) => (
          <circle key={i} cx={xOf(p.x)} cy={yOf(p.s)} r={5} fill="var(--background)" stroke="var(--primary)" strokeWidth="2" className="cursor-grab"
            onPointerDown={(e) => { e.stopPropagation(); drag.current = i; svg.current?.setPointerCapture(e.pointerId); }}
            onDoubleClick={(e) => { e.stopPropagation(); if (pts && pts.length > 2) write(pts.filter((_, k) => k !== i), `curve-del-${clip.id}`); }} />
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{pts ? 'Drag points. Click to add, double-click to remove.' : 'Pick a preset, or click the graph to start.'}</span>
        {pts && <Button size="xs" variant="ghost" onClick={() => clipOps.curve(clip.id, undefined)}>Reset</Button>}
      </div>
    </div>
  );
}

function Tile({ name, on, onClick, children }: { name: string; on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 rounded-lg border bg-card p-1.5 text-[11px] hover:border-primary ${on ? 'border-primary' : ''}`}>
      <span className="flex h-7 w-full items-center justify-center">{children}</span>
      {name}
    </button>
  );
}

const NoneIcon = () => <svg viewBox="0 0 24 24" className="size-6 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="8" /><path d="M6.5 17.5l11-11" /></svg>;
const SlidersIcon = () => (
  <svg viewBox="0 0 24 24" className="size-6 text-primary" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="1.8" fill="var(--card)" /><circle cx="15" cy="12" r="1.8" fill="var(--card)" /><circle cx="10" cy="17" r="1.8" fill="var(--card)" />
  </svg>
);
