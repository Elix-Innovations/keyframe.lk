import { Trash2 } from '@/components/icons';
import type { VideoFilters } from '@/types';
import { EFFECTS } from '@/render/effects';
import { NEUTRAL_FILTERS } from '@/lib/videoFx';
import { Button } from '@/components/ui/button';
import { Row, Section, Slider } from '../controls';
import { ColorGrade } from './ColorGrade';
import { TargetBar, useLayer } from './EffectsPanel';

const FIELDS: { k: keyof VideoFilters; label: string; min: number; max: number; unit: string }[] = [
  { k: 'brightness', label: 'Brightness', min: 0, max: 200, unit: '%' },
  { k: 'contrast', label: 'Contrast', min: 0, max: 200, unit: '%' },
  { k: 'saturate', label: 'Saturation', min: 0, max: 300, unit: '%' },
  { k: 'hue', label: 'Hue', min: 0, max: 360, unit: '°' },
  { k: 'blur', label: 'Blur', min: 0, max: 30, unit: 'px' },
  { k: 'grayscale', label: 'Grayscale', min: 0, max: 100, unit: '%' },
  { k: 'sepia', label: 'Sepia', min: 0, max: 100, unit: '%' },
  { k: 'vignette', label: 'Vignette', min: 0, max: 100, unit: '%' },
];

/** The selected video clip's own colour adjustments and effects (the timeline's Filters and Effects tracks apply across clips). */
export function AdjustPanel() {
  const { layer, set } = useLayer();
  const label = (id: string) => EFFECTS.find((e) => e.id === id)?.label ?? id;
  return (
    <div>
      <TargetBar pick={(l) => ({ filters: l.filters, presetId: l.presetId, effects: l.effects })} label="adjustments" />
      <Section title="Adjust" right={<Button variant="ghost" size="xs" onClick={() => set((l) => ({ ...l, presetId: 'none', presetStrength: 100, filters: NEUTRAL_FILTERS }))}>Reset</Button>}>
        {FIELDS.map((f) => (
          <Row key={f.k} label={f.label}>
            <Slider value={layer.filters[f.k]} min={f.min} max={f.max} format={(v) => `${v}${f.unit}`}
              onChange={(v) => set((l) => ({ ...l, presetId: null, filters: { ...l.filters, [f.k]: v } }), `flt-${f.k}`)} />
          </Row>
        ))}
      </Section>
      <ColorGrade filters={layer.filters} patch={(p, key) => set((l) => ({ ...l, presetId: null, filters: { ...l.filters, ...p } }), key)} />
      <Section title="Clip effects">
        {layer.effects.length === 0 && <p className="text-xs text-muted-foreground">Drag an effect from the Effects tab onto a track on the timeline.</p>}
        {layer.effects.map((e) => (
          <Row key={e.id} label={label(e.effectId)}>
            <Slider value={e.intensity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`}
              onChange={(intensity) => set((l) => ({ ...l, effects: l.effects.map((x) => (x.id === e.id ? { ...x, intensity } : x)) }), `fx-${e.id}`)} />
            <Button variant="ghost" size="icon-xs" aria-label="Remove effect" className="hover:text-destructive" onClick={() => set((l) => ({ ...l, effects: l.effects.filter((x) => x.id !== e.id) }))}><Trash2 /></Button>
          </Row>
        ))}
      </Section>
    </div>
  );
}
