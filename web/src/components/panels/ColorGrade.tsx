import { useRef } from 'react';
import { useState } from 'react';
import type { VideoFilters } from '@/types';
import { HSL_BANDS, NEUTRAL_FILTERS } from '@/lib/videoFx';
import { Button } from '@/components/ui/button';
import { Row, Section, Slider } from '../controls';
import { PreviewTile } from './EffectsPanel';

type Patch = (p: Partial<VideoFilters>, key: string) => void;
type Num = Exclude<keyof VideoFilters, never>;

/** Presets shown as live thumbnails of the current frame; click one to apply it. */
function PresetTiles({ items, base, onPick }: { items: { label: string; v: Partial<VideoFilters> }[]; base: Num[]; onPick: (v: Partial<VideoFilters>, label: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {items.map((p) => (
        <button key={p.label} type="button" onClick={() => onPick({ ...reset(base), ...p.v }, p.label)} className="min-w-0 text-left">
          <PreviewTile spec={{ filters: { ...NEUTRAL_FILTERS, ...p.v } }} label={p.label} />
        </button>
      ))}
    </div>
  );
}

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

function Field({ f, k, label, patch, min = -100, max = 100, format = signed }: { f: VideoFilters; k: Num; label: string; patch: Patch; min?: number; max?: number; format?: (v: number) => string }) {
  return (
    <Row label={label}>
      <Slider value={f[k]} min={min} max={max} format={format} onChange={(v) => patch({ [k]: v }, `flt-${k}`)} />
    </Row>
  );
}

const reset = (keys: Num[]): Partial<VideoFilters> => Object.fromEntries(keys.map((k) => [k, NEUTRAL_FILTERS[k]]));
const ResetBtn = ({ keys, patch }: { keys: Num[]; patch: Patch }) => (
  <Button variant="ghost" size="xs" onClick={() => patch(reset(keys), `rst-${keys[0]}`)}>Reset</Button>
);

// ---- Levels ----
const LEVEL_KEYS: Num[] = ['lvInBlack', 'lvInWhite', 'lvGamma', 'lvOutBlack', 'lvOutWhite'];
const LEVEL_PRESETS: { label: string; v: Partial<VideoFilters> }[] = [
  { label: 'Default', v: {} },
  { label: 'Contrast 1', v: { lvInBlack: 12, lvInWhite: 243 } },
  { label: 'Contrast 2', v: { lvInBlack: 25, lvInWhite: 230 } },
  { label: 'Contrast 3', v: { lvInBlack: 40, lvInWhite: 215 } },
  { label: 'Lighten shadows', v: { lvGamma: 130 } },
  { label: 'Darken highlights', v: { lvGamma: 80 } },
  { label: 'Brighter mids', v: { lvGamma: 150 } },
  { label: 'Darker mids', v: { lvGamma: 70 } },
  { label: 'Matte', v: { lvOutBlack: 28, lvOutWhite: 238 } },
  { label: 'Faded film', v: { lvOutBlack: 40, lvOutWhite: 230, lvGamma: 110 } },
  { label: 'Punchy', v: { lvInBlack: 18, lvInWhite: 238, lvGamma: 92 } },
  { label: 'Broadcast safe', v: { lvOutBlack: 16, lvOutWhite: 235 } },
];

// ---- Curves: four draggable zones, same maths as the shader ----
const CURVE_KEYS: Num[] = ['curveShadows', 'curveDarks', 'curveLights', 'curveHighlights'];
const CURVE_X = [0.12, 0.38, 0.64, 0.9];
const CURVE_PRESETS: { label: string; v: Partial<VideoFilters> }[] = [
  { label: 'Linear', v: {} },
  { label: 'Soft contrast', v: { curveShadows: -20, curveDarks: -12, curveLights: 12, curveHighlights: 20 } },
  { label: 'Strong contrast', v: { curveShadows: -45, curveDarks: -30, curveLights: 30, curveHighlights: 45 } },
  { label: 'Lighten', v: { curveShadows: 20, curveDarks: 28, curveLights: 22, curveHighlights: 8 } },
  { label: 'Darken', v: { curveShadows: -8, curveDarks: -25, curveLights: -28, curveHighlights: -18 } },
  { label: 'Lift blacks', v: { curveShadows: 40, curveDarks: 14 } },
  { label: 'Fade highlights', v: { curveHighlights: -35, curveLights: -12 } },
  { label: 'Cross curve', v: { curveShadows: 30, curveDarks: -14, curveLights: 14, curveHighlights: -30 } },
];

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function curveAt(f: VideoFilters, x: number) {
  const zs = 1 - smooth(0, 0.3, x), zd = smooth(0, 0.3, x) * (1 - smooth(0.3, 0.6, x));
  const zl = smooth(0.3, 0.6, x) * (1 - smooth(0.6, 0.9, x)), zh = smooth(0.6, 0.9, x);
  return Math.max(0, Math.min(1, x + (f.curveShadows * zs + f.curveDarks * zd + f.curveLights * zl + f.curveHighlights * zh) * 0.002));
}

function CurveEditor({ f, patch }: { f: VideoFilters; patch: Patch }) {
  const S = 168;
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    if (drag.current === null || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const y = 1 - (e.clientY - r.top) / r.height;
    const i = drag.current, x = CURVE_X[i];
    patch({ [CURVE_KEYS[i]]: Math.round(Math.max(-100, Math.min(100, ((y - x) / 0.2) * 100))) }, `flt-${CURVE_KEYS[i]}`);
  };
  const pts = Array.from({ length: 41 }, (_, i) => { const x = i / 40; return `${(x * S).toFixed(1)},${((1 - curveAt(f, x)) * S).toFixed(1)}`; });
  return (
    <svg ref={ref} viewBox={`0 0 ${S} ${S}`} className="mx-auto aspect-square w-full max-w-44 touch-none rounded-lg border bg-muted/40"
      onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
      {[1, 2, 3].map((i) => <g key={i} className="stroke-border"><line x1={(S / 4) * i} y1={0} x2={(S / 4) * i} y2={S} /><line x1={0} y1={(S / 4) * i} x2={S} y2={(S / 4) * i} /></g>)}
      <line x1={0} y1={S} x2={S} y2={0} className="stroke-muted-foreground/40" strokeDasharray="3 3" />
      <polyline points={pts.join(' ')} fill="none" className="stroke-primary" strokeWidth={2} />
      {CURVE_X.map((x, i) => (
        <circle key={i} cx={x * S} cy={(1 - curveAt(f, x)) * S} r={6} className="cursor-grab fill-background stroke-primary active:cursor-grabbing" strokeWidth={2}
          onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); drag.current = i; }}
          onDoubleClick={() => patch({ [CURVE_KEYS[i]]: 0 }, `flt-${CURVE_KEYS[i]}`)} />
      ))}
    </svg>
  );
}

// ---- Colour wheels ----
function Wheel({ label, hue, amt, onChange }: { label: string; hue: number; amt: number; onChange: (hue: number, amt: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const down = useRef(false);
  const set = (e: React.PointerEvent) => {
    if (!down.current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const rad = r.width / 2;
    onChange(Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360), Math.round(Math.min(1, Math.hypot(dx, dy) / rad) * 100));
  };
  const a = ((hue - 90) * Math.PI) / 180, rr = (amt / 100) * 50;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <div ref={ref} className="relative aspect-square w-full max-w-24 cursor-crosshair touch-none rounded-full border"
        style={{ background: 'radial-gradient(circle, rgba(128,128,128,1) 0%, rgba(128,128,128,0) 72%), conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); down.current = true; set(e); }}
        onPointerMove={set} onPointerUp={() => { down.current = false; }}
        onDoubleClick={() => onChange(hue, 0)}>
        <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/40"
          style={{ left: `${50 + Math.cos(a) * rr}%`, top: `${50 + Math.sin(a) * rr}%`, background: amt ? `hsl(${hue} 90% 55%)` : 'transparent' }} />
      </div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

const BAND_COLOR: Record<string, string> = { Red: '#ef4444', Orange: '#f97316', Yellow: '#eab308', Green: '#22c55e', Aqua: '#06b6d4', Blue: '#3b82f6', Purple: '#8b5cf6', Magenta: '#ec4899' };

/** Pro colour tools: light, colour, levels, curves, HSL, colour wheels and finishing. Every change goes through `patch`. */
export type GradePart = 'basic' | 'hsl' | 'curves' | 'wheels';
export function ColorGrade({ filters: f, patch, part }: { filters: VideoFilters; patch: Patch; part?: GradePart }) {
  const show = (p: GradePart) => !part || part === p;
  const [band, setBand] = useState<(typeof HSL_BANDS)[number]>('Red');
  const bandKeys = [`hue${band}`, `sat${band}`, `lum${band}`] as Num[];
  const hslKeys = HSL_BANDS.flatMap((b) => [`hue${b}`, `sat${b}`, `lum${b}`]) as Num[];
  return (
    <>
      {show('basic') && (<Section title="Light" collapsible right={<ResetBtn patch={patch} keys={['exposure', 'highlights', 'shadows', 'whites', 'blacks']} />}>
        <Field f={f} k="exposure" label="Exposure" patch={patch} />
        <Field f={f} k="highlights" label="Highlights" patch={patch} />
        <Field f={f} k="shadows" label="Shadows" patch={patch} />
        <Field f={f} k="whites" label="Whites" patch={patch} />
        <Field f={f} k="blacks" label="Blacks" patch={patch} />
      </Section>)}

      {show('basic') && (<Section title="Colour" collapsible right={<ResetBtn patch={patch} keys={['temperature', 'tint', 'vibrance']} />}>
        <Row label="Temperature">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg,#3b82f6,#e5e7eb,#f59e0b)' }} />
            <Slider value={f.temperature} min={-100} max={100} format={signed} onChange={(v) => patch({ temperature: v }, 'flt-temperature')} />
          </div>
        </Row>
        <Row label="Tint">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg,#22c55e,#e5e7eb,#d946ef)' }} />
            <Slider value={f.tint} min={-100} max={100} format={signed} onChange={(v) => patch({ tint: v }, 'flt-tint')} />
          </div>
        </Row>
        <Field f={f} k="vibrance" label="Vibrance" patch={patch} />
        <Field f={f} k="gainR" label="Red balance" patch={patch} />
        <Field f={f} k="gainG" label="Green balance" patch={patch} />
        <Field f={f} k="gainB" label="Blue balance" patch={patch} />
      </Section>)}

      {show('basic') && (<Section title="Levels" collapsible defaultOpen={false} right={<ResetBtn patch={patch} keys={LEVEL_KEYS} />}>
        <PresetTiles items={LEVEL_PRESETS} base={LEVEL_KEYS} onPick={(v) => patch(v, 'lv-preset')} />
        <Field f={f} k="lvInBlack" label="Input black" patch={patch} min={0} max={254} format={String} />
        <Field f={f} k="lvGamma" label="Midtones" patch={patch} min={20} max={300} format={(v) => (v / 100).toFixed(2)} />
        <Field f={f} k="lvInWhite" label="Input white" patch={patch} min={1} max={255} format={String} />
        <Field f={f} k="lvOutBlack" label="Output black" patch={patch} min={0} max={254} format={String} />
        <Field f={f} k="lvOutWhite" label="Output white" patch={patch} min={1} max={255} format={String} />
      </Section>)}

      {show('curves') && (<Section title="Curves" collapsible defaultOpen={false} right={<ResetBtn patch={patch} keys={CURVE_KEYS} />}>
        <CurveEditor f={f} patch={patch} />
        <p className="text-center text-[11px] text-muted-foreground">Drag a point up or down. Double-click a point to reset it.</p>
        <PresetTiles items={CURVE_PRESETS} base={CURVE_KEYS} onPick={(v) => patch(v, 'cv-preset')} />
      </Section>)}

      {show('hsl') && (<Section title="HSL" collapsible defaultOpen={false} right={<ResetBtn patch={patch} keys={hslKeys} />}>
        <div className="flex justify-between gap-1">
          {HSL_BANDS.map((b) => {
            const touched = f[`hue${b}` as Num] || f[`sat${b}` as Num] || f[`lum${b}` as Num];
            return (
              <button key={b} type="button" title={b} aria-label={b} onClick={() => setBand(b)}
                className={`relative size-6 rounded-full border-2 transition-transform ${band === b ? 'scale-110 border-foreground' : 'border-transparent'}`} style={{ background: BAND_COLOR[b] }}>
                {touched ? <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-foreground ring-1 ring-background" /> : null}
              </button>
            );
          })}
        </div>
        <Field f={f} k={bandKeys[0]} label="Hue" patch={patch} />
        <Field f={f} k={bandKeys[1]} label="Saturation" patch={patch} />
        <Field f={f} k={bandKeys[2]} label="Luminance" patch={patch} />
      </Section>)}

      {show('wheels') && (<Section title="Colour wheels" collapsible defaultOpen={false} right={<ResetBtn patch={patch} keys={['shadowAmt', 'midAmt', 'highAmt']} />}>
        <div className="flex gap-2">
          <Wheel label="Shadows" hue={f.shadowHue} amt={f.shadowAmt} onChange={(h, a) => patch({ shadowHue: h, shadowAmt: a }, 'wh-s')} />
          <Wheel label="Midtones" hue={f.midHue} amt={f.midAmt} onChange={(h, a) => patch({ midHue: h, midAmt: a }, 'wh-m')} />
          <Wheel label="Highlights" hue={f.highHue} amt={f.highAmt} onChange={(h, a) => patch({ highHue: h, highAmt: a }, 'wh-h')} />
        </div>
        <p className="text-center text-[11px] text-muted-foreground">Drag inside a wheel to tint that tone. Double-click to clear.</p>
      </Section>)}

      {show('basic') && (<Section title="Finish" collapsible right={<ResetBtn patch={patch} keys={['fade', 'grain', 'sharpen', 'clarity']} />}>
        <Field f={f} k="clarity" label="Clarity" patch={patch} />
        <Field f={f} k="sharpen" label="Sharpen" patch={patch} min={0} max={100} format={String} />
        <Field f={f} k="fade" label="Fade" patch={patch} min={0} max={100} format={String} />
        <Field f={f} k="grain" label="Grain" patch={patch} min={0} max={100} format={String} />
      </Section>)}
    </>
  );
}
