import type { TransitionId } from '@/types';
import { TRANSITIONS, TRENDING_TRANSITIONS } from '@/lib/videoFx';
import { Row, Section, Slider } from '../controls';
import { usePreviewSourceSync } from '../FxPreview';
import { Button } from '@/components/ui/button';
import { PreviewTile, TargetBar, useLayer } from './EffectsPanel';

/**
 * Transitions, previewed on your footage (hover a tile to play it). They are only added by dragging a tile onto a clip
 * on the timeline: the left half sets that clip's start, the right half its end.
 */
export function TransitionsPanel() {
  usePreviewSourceSync();
  const { layer, set, clip } = useLayer();
  const maxD = Math.max(0.2, Math.min(3, (clip?.duration ?? 6) / 2));
  const label = (id: TransitionId) => TRANSITIONS.find((t) => t.id === id)?.label;
  return (
    <div>
      <TargetBar pick={(l) => ({ transitionIn: l.transitionIn, transitionOut: l.transitionOut })} label="transitions" />
      <div className="border-b px-3 py-2.5 text-xs text-muted-foreground">Drag a transition onto a video clip on the timeline: the left half sets its start, the right half its end.</div>
      <Section title="This clip">
        <Row label="Start">
          <span className="text-xs">{label(layer.transitionIn.id)}</span>
          {layer.transitionIn.id !== 'none' && <Button size="xs" variant="ghost" onClick={() => set((l) => ({ ...l, transitionIn: { ...l.transitionIn, id: 'none' } }))}>Remove</Button>}
        </Row>
        {layer.transitionIn.id !== 'none' && <Row label="Start length"><Slider value={layer.transitionIn.duration} min={0.1} max={maxD} step={0.05} format={(v) => `${v.toFixed(2)}s`} onChange={(d) => set((l) => ({ ...l, transitionIn: { ...l.transitionIn, duration: d } }), 'tr-in')} /></Row>}
        <Row label="End">
          <span className="text-xs">{label(layer.transitionOut.id)}</span>
          {layer.transitionOut.id !== 'none' && <Button size="xs" variant="ghost" onClick={() => set((l) => ({ ...l, transitionOut: { ...l.transitionOut, id: 'none' } }))}>Remove</Button>}
        </Row>
        {layer.transitionOut.id !== 'none' && <Row label="End length"><Slider value={layer.transitionOut.duration} min={0.1} max={maxD} step={0.05} format={(v) => `${v.toFixed(2)}s`} onChange={(d) => set((l) => ({ ...l, transitionOut: { ...l.transitionOut, duration: d } }), 'tr-out')} /></Row>}
      </Section>
      <Section title="Trending" right={<span className="text-[11px] text-muted-foreground">{TRENDING_TRANSITIONS.length}</span>}>
        <div className="grid grid-cols-3 gap-2">
          {TRANSITIONS.filter((t) => TRENDING_TRANSITIONS.includes(t.id)).map((t) => (
            <PreviewTile key={t.id} spec={{ transition: t.id }} label={t.label}
              on={layer.transitionIn.id === t.id || layer.transitionOut.id === t.id} drag={{ type: 'transition', id: t.id }} />
          ))}
        </div>
      </Section>
      <Section title="All transitions" right={<span className="text-[11px] text-muted-foreground">{TRANSITIONS.length - 1} styles</span>}>
        <div className="grid grid-cols-3 gap-2">
          {TRANSITIONS.filter((t) => t.id !== 'none').map((t) => (
            <PreviewTile key={t.id} spec={{ transition: t.id }} label={t.label}
              on={layer.transitionIn.id === t.id || layer.transitionOut.id === t.id} drag={{ type: 'transition', id: t.id }} />
          ))}
        </div>
      </Section>
    </div>
  );
}
