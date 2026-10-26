import { useEditor } from '@/store';
import { FILTER_PRESETS, GRADE_GROUPS, GRADE_LOOKS, NEUTRAL_FILTERS, TRENDING_FILTERS } from '@/lib/videoFx';
import { usePreviewSourceSync } from '../FxPreview';
import { Section } from '../controls';
import { PreviewTile } from './EffectsPanel';

/**
 * Colour filters previewed on your own frame.
 * Drag a tile onto a track on the timeline; nothing is added by clicking.
 */
export function FiltersPanel() {
  usePreviewSourceSync();
  const adj = useEditor((s) => s.project!.adj);
  const used = new Set((adj ?? []).filter((a) => a.kind === 'filter').map((a) => a.refId));
  return (
    <div>
      <div className="border-b px-3 py-2.5 text-xs text-muted-foreground">Drag a filter onto a track on the timeline (or onto a clip to cover it). Select it there to change intensity, move, trim or split. A clip's own sliders are in its Adjust tab.</div>
      <Section title="Trending" right={<span className="text-[11px] text-muted-foreground">{TRENDING_FILTERS.length}</span>}>
        <div className="grid grid-cols-3 gap-2">
          {FILTER_PRESETS.filter((p) => TRENDING_FILTERS.includes(p.id)).map((p) => (
            <PreviewTile key={p.id} spec={{ filters: { ...NEUTRAL_FILTERS, ...p.filters } }} label={p.label} on={used.has(p.id)}
              drag={{ type: 'fx', kind: 'filter', refId: p.id }} />
          ))}
        </div>
      </Section>
      {GRADE_GROUPS.map((g) => (
        <Section key={g} title={g} collapsible defaultOpen={false} right={<span className="text-[11px] text-muted-foreground">{GRADE_LOOKS.filter((l) => l.group === g).length}</span>}>
          <div className="grid grid-cols-3 gap-2">
            {GRADE_LOOKS.filter((l) => l.group === g).map((p) => (
              <PreviewTile key={p.id} spec={{ filters: { ...NEUTRAL_FILTERS, ...p.filters } }} label={p.label} on={used.has(p.id)}
                drag={{ type: 'fx', kind: 'filter', refId: p.id }} />
            ))}
          </div>
        </Section>
      ))}
      <Section title="Classic" collapsible right={<span className="text-[11px] text-muted-foreground">{FILTER_PRESETS.length - 1 - GRADE_LOOKS.length} looks</span>}>
        <div className="grid grid-cols-3 gap-2">
          {FILTER_PRESETS.filter((p) => p.id !== 'none' && !p.id.startsWith('hp')).map((p) => (
            <PreviewTile key={p.id} spec={{ filters: { ...NEUTRAL_FILTERS, ...p.filters } }} label={p.label} on={used.has(p.id)}
              drag={{ type: 'fx', kind: 'filter', refId: p.id }} />
          ))}
        </div>
      </Section>
    </div>
  );
}
