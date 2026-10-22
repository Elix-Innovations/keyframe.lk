import { Copy, Scissors, Trash2 } from '@/components/icons';
import { useEditor } from '@/store';
import { EFFECTS } from '@/render/effects';
import { FILTER_PRESETS } from '@/lib/videoFx';
import { adjEnd } from '@/lib/adj';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Row, Section, Slider } from '../controls';
import { adjLabel, adjOps } from '../AdjLane';
import { PreviewTile } from './EffectsPanel';
import { usePreviewSourceSync } from '../FxPreview';
import { NEUTRAL_FILTERS } from '@/lib/videoFx';
import { Empty } from '../controls';

/** The selected filter or effect clip on the timeline: what it is, when it plays, how strong it is. */
export function AdjItemPanel() {
  usePreviewSourceSync();
  const a = useEditor((s) => s.project!.adj?.find((x) => x.id === s.selectedAdjId) ?? null);
  const setAdj = useEditor((s) => s.setAdj);
  const total = useEditor((s) => s.project!.duration);
  if (!a) return <Section title="Filter or effect"><Empty icon={<Scissors />} title="Nothing selected">Select a filter or effect clip on the timeline to change it.</Empty></Section>;
  const patch = (p: Partial<typeof a>, key?: string) => setAdj((l) => l.map((x) => (x.id === a.id ? { ...x, ...p } : x)), key && `adjinsp-${key}-${a.id}`);
  const num = (v: string, fallback: number) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };
  const preset = a.kind === 'filter' ? FILTER_PRESETS.find((p) => p.id === a.refId) : null;
  return (
    <div>
      <Section title={a.kind === 'filter' ? 'Filter' : 'Effect'} right={<span className="max-w-32 truncate text-[11px] text-muted-foreground">{adjLabel(a)}</span>}>
        <div className="w-1/2">
          <PreviewTile label={adjLabel(a)} on spec={a.kind === 'filter' ? { filters: { ...NEUTRAL_FILTERS, ...(preset?.filters ?? {}) } } : { effects: [{ id: 'p', effectId: a.refId, intensity: a.intensity / 100 }] }} />
        </div>
        <Row label="Change to">
          <Select value={a.refId} onValueChange={(refId) => patch({ refId })}>
            <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {a.kind === 'filter'
                ? FILTER_PRESETS.filter((p) => p.id !== 'none').map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)
                : EFFECTS.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <Row label={a.kind === 'filter' ? 'Intensity' : 'Strength'}>
          <Slider value={a.intensity} min={0} max={100} format={(v) => `${v}%`} onChange={(intensity) => patch({ intensity }, 'int')} />
        </Row>
      </Section>
      <Section title="Timing">
        <Row label="Start (s)"><Input type="number" step={0.1} min={0} className="h-7 w-24 text-xs" value={Number(a.start.toFixed(2))} onChange={(e) => patch({ start: Math.max(0, num(e.target.value, a.start)) }, 'start')} /></Row>
        <Row label="Length (s)"><Input type="number" step={0.1} min={0.2} className="h-7 w-24 text-xs" value={Number(a.duration.toFixed(2))} onChange={(e) => patch({ duration: Math.max(0.2, num(e.target.value, a.duration)) }, 'dur')} /></Row>
        <Row label="Ends"><span className="font-mono text-xs">{adjEnd(a).toFixed(2)}s{total ? ` of ${total.toFixed(1)}s` : ''}</span></Row>
        <div className="flex flex-wrap justify-end gap-1.5 pt-1">
          <Button size="xs" variant="secondary" onClick={() => adjOps.splitAtPlayhead(a.id)}><Scissors />Split at playhead</Button>
          <Button size="xs" variant="secondary" onClick={() => adjOps.duplicate(a.id)}><Copy />Duplicate</Button>
          <Button size="xs" variant="ghost" className="hover:text-destructive" onClick={() => adjOps.remove(a.id)}><Trash2 />Delete</Button>
        </div>
      </Section>
    </div>
  );
}
