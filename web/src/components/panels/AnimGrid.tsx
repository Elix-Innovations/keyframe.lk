import { useState } from 'react';
import { Search } from '@/components/icons';
import type { OverlayAnimId, OverlayLoopId } from '@/types';
import { ANIM_IN, LOOPS } from '@/lib/overlays';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { OverlaySample } from '../OverlayPicker';
import { Row, Section, Slider } from '../controls';

export interface AnimValue {
  animIn?: { id: OverlayAnimId; duration: number; speed?: number };
  animOut?: { id: OverlayAnimId; duration: number; speed?: number };
  loop?: OverlayLoopId;
}

/** CapCut-style animation picker: In / Out / Combo tabs, a search box and a grid of live sample tiles. */
export function AnimGrid({ value, onChange, maxLen, sample, still }: {
  value: AnimValue; onChange: (p: AnimValue, key?: string) => void; maxLen: number; sample: Record<string, unknown>; still?: string | null;
}) {
  const [tab, setTab] = useState<'in' | 'out' | 'loop'>('in');
  const [q, setQ] = useState('');
  const [hot, setHot] = useState<string | null>(null);
  const inA = value.animIn ?? { id: 'none' as const, duration: 0.5 }, outA = value.animOut ?? { id: 'none' as const, duration: 0.5 };
  const loop = value.loop ?? 'none';
  const list: { id: string; label: string }[] = tab === 'loop' ? LOOPS : ANIM_IN;
  const cur = tab === 'in' ? inA.id : tab === 'out' ? outA.id : loop;
  const items = list.filter((a) => a.label.toLowerCase().includes(q.trim().toLowerCase()));
  const spec = (id: string): Record<string, unknown> => ({
    ...sample, loop: 'none',
    ...(tab === 'in' ? { animIn: { id, duration: 0.8 } } : tab === 'out' ? { animOut: { id, duration: 0.8 } } : { loop: id }),
  });
  const pick = (id: string) => {
    if (tab === 'in') onChange({ animIn: { ...inA, id: id as OverlayAnimId, duration: inA.id === 'none' ? Math.min(0.5, maxLen) : inA.duration } });
    else if (tab === 'out') onChange({ animOut: { ...outA, id: id as OverlayAnimId, duration: outA.id === 'none' ? Math.min(0.5, maxLen) : outA.duration } });
    else onChange({ loop: id as OverlayLoopId });
  };
  const active = tab === 'in' ? inA : tab === 'out' ? outA : null;
  return (
    <>
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-sidebar px-3 py-2">
        <div role="tablist" className="flex gap-4 text-sm">
          {([['in', 'In'], ['out', 'Out'], ['loop', 'Combo']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('border-b-2 pb-1 transition-colors', tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{label}</button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search animations" className="h-8 pl-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {[{ id: 'none', label: 'None' }, ...items.filter((a) => a.id !== 'none')].map((a) => (
          <button key={a.id} type="button" onMouseEnter={() => setHot(a.id)} onMouseLeave={() => setHot(null)} onClick={() => pick(a.id)}
            className={cn('overflow-hidden rounded-lg border text-left transition-colors', a.id === cur ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50')}>
            {a.id === 'none'
              ? <div className="flex aspect-[5/3] items-center justify-center bg-muted text-xs text-muted-foreground">None</div>
              : <OverlaySample spec={spec(a.id)} still={still} hover={hot === a.id} className="rounded-none" />}
            <div className="truncate px-1.5 py-1 text-[11px]">{a.label}</div>
          </button>
        ))}
        {items.length === 0 && <p className="col-span-3 py-6 text-center text-xs text-muted-foreground">No animation matches “{q}”.</p>}
      </div>
      {active && active.id !== 'none' && (
        <Section title="Duration">
          <Row label="Length"><Slider value={active.duration} min={0.1} max={Math.max(0.2, Math.min(2, maxLen))} step={0.05} format={(v) => `${v.toFixed(2)}s`}
            onChange={(duration) => onChange(tab === 'in' ? { animIn: { ...inA, duration } } : { animOut: { ...outA, duration } }, `anim-${tab}-len`)} /></Row>
          <Row label="Speed"><Slider value={active.speed ?? 1} min={0.25} max={4} step={0.05} format={(v) => `${v.toFixed(2)}×`}
            onChange={(speed) => onChange(tab === 'in' ? { animIn: { ...inA, speed } } : { animOut: { ...outA, speed } }, `anim-${tab}-spd`)} /></Row>
        </Section>
      )}
    </>
  );
}
