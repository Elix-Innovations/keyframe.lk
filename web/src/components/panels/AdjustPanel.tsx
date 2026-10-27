import { Trash2 } from '@/components/icons';
import type { VideoFilters, VideoLayer } from '@/types';
import { nanoid } from 'nanoid';
import { useEditor } from '@/store';
import { FilterKfContext, type SliderKf } from './filterKf';
import { EFFECTS } from '@/render/effects';
import { liveFilters, NEUTRAL_FILTERS } from '@/lib/videoFx';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Row, Section, Segmented, Slider } from '../controls';
import { ColorGrade } from './ColorGrade';
import { usePreviewSourceSync } from '../FxPreview';
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
  usePreviewSourceSync();
  const { layer, set, clip } = useLayer();
  const time = useEditor((s) => s.time);
  const local = Math.max(0, Math.min(time - (clip?.start ?? 0), clip?.duration ?? 0));
  const live = liveFilters(layer, local);
  const nearKf = (l: VideoLayer, k: string) => l.fkf?.[k]?.find((x) => Math.abs(x.t - local) < 0.05);
  // A slider with keyframes writes a keyframe at the playhead; others change the static value.
  const write = (p: Partial<VideoFilters>, key: string) => set((l) => {
    const fkf = { ...(l.fkf ?? {}) };
    let filters = l.filters;
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'number' && fkf[k]?.length) {
        const h = nearKf(l, k);
        fkf[k] = h ? fkf[k].map((x) => (x === h ? { ...x, v } : x)) : [...fkf[k], { id: nanoid(8), t: local, v, ease: 'easeInOut' as const }];
      } else filters = { ...filters, [k]: v };
    }
    return { ...l, presetId: null, filters, fkf };
  }, key);
  const kfOf = (k: string): SliderKf => ({
    on: !!nearKf(layer, k),
    toggle: () => set((l) => {
      const fkf = { ...(l.fkf ?? {}) };
      const h = nearKf(l, k);
      if (h) {
        const rest = fkf[k].filter((x) => x !== h);
        if (rest.length) fkf[k] = rest;
        else { delete fkf[k]; return { ...l, filters: { ...l.filters, [k]: h.v }, fkf }; }
      } else {
        fkf[k] = [...(fkf[k] ?? []), { id: nanoid(8), t: local, v: liveFilters(l, local)[k as keyof VideoFilters] as number, ease: 'easeInOut' as const }];
      }
      return { ...l, fkf };
    }),
  });
  const [tab, setTab] = useState<'basic' | 'hsl' | 'curves' | 'wheels'>('basic');
  const label = (id: string) => EFFECTS.find((e) => e.id === id)?.label ?? id;
  return (
    <FilterKfContext.Provider value={kfOf}>
    <div>
      <div className="sticky top-0 z-10 border-b bg-sidebar px-3 py-2">
        <Segmented fill size="sm" value={tab} onChange={setTab} options={[{ value: 'basic', label: 'Basic' }, { value: 'hsl', label: 'HSL' }, { value: 'curves', label: 'Curves' }, { value: 'wheels', label: 'Colour wheel' }]} />
      </div>
      <TargetBar pick={(l) => ({ filters: l.filters, fkf: l.fkf, presetId: l.presetId, effects: l.effects })} label="adjustments" />
      {tab === 'basic' && <Section title="Adjust" right={<Button variant="ghost" size="xs" onClick={() => set((l) => ({ ...l, presetId: 'none', presetStrength: 100, filters: NEUTRAL_FILTERS }))}>Reset</Button>}>
        {FIELDS.map((f) => (
          <Row key={f.k} label={f.label} kf={kfOf(f.k)}>
            <Slider value={live[f.k]} min={f.min} max={f.max} format={(v) => `${v}${f.unit}`}
              onChange={(v) => write({ [f.k]: v }, `flt-${f.k}`)} />
          </Row>
        ))}
      </Section>}
      <ColorGrade part={tab} filters={live} patch={write} />
      {tab === 'basic' && <Section title="Clip effects">
        {layer.effects.length === 0 && <p className="text-xs text-muted-foreground">Drag an effect from the Effects tab onto a track on the timeline.</p>}
        {layer.effects.map((e) => (
          <Row key={e.id} label={label(e.effectId)}>
            <Slider value={e.intensity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`}
              onChange={(intensity) => set((l) => ({ ...l, effects: l.effects.map((x) => (x.id === e.id ? { ...x, intensity } : x)) }), `fx-${e.id}`)} />
            <Button variant="ghost" size="icon-xs" aria-label="Remove effect" className="hover:text-destructive" onClick={() => set((l) => ({ ...l, effects: l.effects.filter((x) => x.id !== e.id) }))}><Trash2 /></Button>
          </Row>
        ))}
      </Section>}
    </div>
    </FilterKfContext.Provider>
  );
}
