import { useState } from 'react';
import { Copy, Scissors, Trash2 } from '@/components/icons';
import { useEditor } from '@/store';
import type { OverlayItem } from '@/types';
import { adjEnd } from '@/lib/adj';
import { ANIM_IN, BLENDS, LOOPS, TEXT_PRESETS } from '@/lib/overlays';
import { EASES, IDENTITY, newKeyframe, transformAt } from '@/lib/videoFx';
import { currentTime, seek } from '@/lib/player';
import { PreviewPicker, type PickerOption } from '../OverlayPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColorInput, Empty, Row, Section, Segmented, Slider, Toggle } from '../controls';
import { FontPicker } from '../FontPicker';
import { FontImport } from '../FontImport';
import { findTemplate } from '@/lib/templateApply';
import { overlayOps } from '../OverlayLane';
import { TemplateEditor } from './TemplateEditor';
import { nanoid } from 'nanoid';
import * as db from '@/lib/db';

const num = (v: string, fallback: number) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };

/** The overlay's own text and colours, so previews show what you will get. */
const sampleBase = (o: OverlayItem): Partial<OverlayItem> => ({
  kind: o.kind, text: o.kind === 'image' ? '▣' : o.text.split('\n')[0].slice(0, 12) || 'Aa', fontId: o.fontId, color: o.color, bold: o.bold, italic: o.italic,
  strokeWidth: o.strokeWidth, strokeColor: o.strokeColor, shadow: o.shadow, glow: o.glow, bg: o.bg,
});
const animOptions = (o: OverlayItem, which: 'in' | 'out'): PickerOption[] => ANIM_IN.map((a) => ({
  id: a.id, label: a.label,
  spec: { ...sampleBase(o), loop: 'none', ...(which === 'in' ? { animIn: { id: a.id, duration: 0.8 } } : { animOut: { id: a.id, duration: 0.8 } }) },
}));
const loopOptions = (o: OverlayItem): PickerOption[] => LOOPS.map((l) => ({ id: l.id, label: l.label, spec: { ...sampleBase(o), loop: l.id } }));

/** The selected text, sticker or image overlay: content, look, position, animation and timing. */
export function OverlayItemPanel() {
  const o = useEditor((s) => s.project!.overlays?.find((x) => x.id === s.selectedOverlayId) ?? null);
  const setOverlays = useEditor((s) => s.setOverlays);
  const custom = useEditor((s) => s.customTemplates);
  const setCustom = useEditor((s) => s.setCustomTemplates);
  const notify = useEditor((s) => s.notify);
  const total = useEditor((s) => s.project!.duration);
  const [script, setScript] = useState<'sinhala' | 'english'>('sinhala');
  const [tab, setTab] = useState<'edit' | 'style' | 'layout' | 'motion' | 'timing'>('edit');
  if (!o) return <Section title="Overlay"><Empty icon={<Scissors />} title="Nothing selected">Select a text, sticker or image on the timeline or in the preview to change it.</Empty></Section>;
  const patch = (p: Partial<OverlayItem>, key?: string) => setOverlays((l) => l.map((x) => (x.id === o.id ? { ...x, ...p } : x)), key && `ovl-${key}-${o.id}`);
  const alignPicked = (pos: { x?: number; y?: number }) => {
    const ids = new Set([o.id, ...useEditor.getState().extraOverlayIds]);
    setOverlays((l) => l.map((x) => (ids.has(x.id) ? { ...x, ...pos } : x)));
  };
  const text = o.kind === 'text' && !o.tpl; // template layers take their look from the template
  return (
    <div>
      <div className="sticky top-0 z-10 border-b bg-sidebar px-3 py-2">
        <Segmented fill size="sm" value={tab} onChange={setTab}
          options={[{ value: 'edit', label: text ? 'Text' : 'Edit' }, ...(o.tpl ? [{ value: 'style' as const, label: 'Style' }] : []), { value: 'layout', label: 'Layout' }, { value: 'motion', label: 'Motion' }, { value: 'timing', label: 'Timing' }]} />
      </div>
      {tab === 'edit' && <>
      <Section title={text ? 'Text' : o.kind === 'sticker' ? 'Sticker' : 'Image'}>
        {o.tpl && <p className="text-[11px] text-muted-foreground">Text template layer. Edit the words below; size, position, rotation and timing work like any text. Use Timing → “Whole video” to cover the entire video.</p>}
        {o.kind !== 'image' && (
          <Textarea className="sinhala min-h-16 text-sm" value={o.text} placeholder={text ? 'Type your text' : 'Emoji or symbol'} onChange={(e) => patch({ text: e.target.value }, 'text')} />
        )}
        {text && (
          <Row label="Style">
            <PreviewPicker placeholder="Apply a style" className="w-40"
              options={TEXT_PRESETS.map((p) => ({ id: p.id, label: p.label, spec: { ...p.apply, fontId: o.fontId, text: o.text.split('\n')[0].slice(0, 12) || 'Aa' } }))}
              onChange={(id) => { const p = TEXT_PRESETS.find((x) => x.id === id); if (p) patch({ ...p.apply, bg: p.apply.bg ?? null, glow: p.apply.glow ?? null, strokeWidth: p.apply.strokeWidth ?? 0, shadow: p.apply.shadow ?? false, loop: p.apply.loop ?? 'none' }); }} />
          </Row>
        )}
      </Section>
      {text && (
        <Section title="Look">
          <Row label="Font">
            <div className="flex w-full items-center gap-1.5">
              <Segmented size="sm" value={script} onChange={setScript} options={[{ value: 'sinhala', label: 'සිං' }, { value: 'english', label: 'En' }]} />
              <div className="min-w-0 flex-1"><FontPicker value={o.fontId ?? null} script={script} allowInherit="Caption font" onChange={(fontId) => patch({ fontId: fontId ?? undefined })} /></div>
            </div>
          </Row>
          <FontImport />
          <Row label="Weight / italic">
            <Segmented size="sm" value={o.bold ? 'b' : 'n'} onChange={(v) => patch({ bold: v === 'b' })} options={[{ value: 'n', label: 'Regular' }, { value: 'b', label: 'Bold' }]} />
            <Toggle checked={!!o.italic} onChange={(italic) => patch({ italic })} label="Italic" />
          </Row>
          <Row label="Align"><Segmented size="sm" value={o.align ?? 'center'} onChange={(align) => patch({ align })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} /></Row>
          <Row label="Colour"><ColorInput value={o.color.slice(0, 7)} onChange={(color) => patch({ color })} /></Row>
          <Row label="Outline"><Slider value={o.strokeWidth} min={0} max={24} onChange={(strokeWidth) => patch({ strokeWidth }, 'sw')} /><ColorInput value={o.strokeColor} onChange={(strokeColor) => patch({ strokeColor })} /></Row>
          <Row label="Shadow"><Toggle checked={o.shadow} onChange={(shadow) => patch({ shadow })} label="Shadow" /></Row>
          <Row label="Glow">
            <Toggle checked={!!o.glow} onChange={(on) => patch({ glow: on ? { color: '#18D2FF', radius: 1 } : null })} label="Glow" />
            {o.glow && <ColorInput value={o.glow.color} onChange={(color) => patch({ glow: { ...o.glow!, color } })} />}
          </Row>
          {o.glow && <Row label="Glow size"><Slider value={o.glow.radius} min={0.2} max={2} step={0.1} format={(v) => v.toFixed(1)} onChange={(radius) => patch({ glow: { ...o.glow!, radius } }, 'gl')} /></Row>}
          <Row label="Background">
            <Toggle checked={!!o.bg} onChange={(on) => patch({ bg: on ? { color: '#000000', opacity: 0.7, radius: 0.3 } : null })} label="Background" />
            {o.bg && <ColorInput value={o.bg.color.slice(0, 7)} onChange={(color) => patch({ bg: { ...o.bg!, color } })} />}
          </Row>
          {o.bg && <Row label="Plate opacity"><Slider value={Math.round(o.bg.opacity * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => patch({ bg: { ...o.bg!, opacity: v / 100 } }, 'bgo')} /></Row>}
          {o.bg && <Row label="Plate corners"><Slider value={Math.round(o.bg.radius * 100)} min={0} max={50} onChange={(v) => patch({ bg: { ...o.bg!, radius: v / 100 } }, 'bgr')} /></Row>}
          <Row label="Letter spacing"><Slider value={o.letterSpacing ?? 0} min={-5} max={30} onChange={(letterSpacing) => patch({ letterSpacing }, 'ls')} /></Row>
        </Section>
      )}
      </>}
      {tab === 'style' && o.tpl && <>
      <Section title="Template" right={<Button size="xs" variant="secondary" onClick={async () => {
        const t = { id: nanoid(10), name: `${findTemplate(o.tpl!.id)?.name ?? 'My style'} copy`, builtIn: false, style: o.tpl!.style, createdAt: Date.now(), sfx: findTemplate(o.tpl!.id)?.sfx ?? null };
        await db.putTemplate(t); setCustom([t, ...custom]); notify(`Saved “${t.name}” to My templates.`, 'success');
      }}>Save as template</Button>}>
        <p className="text-[11px] text-muted-foreground">Everything about this layer's look is editable here. Changes only affect this layer.</p>
      </Section>
      <TemplateEditor style={o.tpl.style} onStyle={(style, key) => patch({ tpl: { ...o.tpl!, style }, y: style.layout.y }, key)} />
      </>}
      {tab === 'layout' && <>
      <Section title="Position">
        <Row label="Align to frame" hint="Centres this item, and every other item picked in the preview, on the frame.">
          <Button size="xs" variant="secondary" onClick={() => alignPicked({ x: 50 })}>Centre ↔</Button>
          <Button size="xs" variant="secondary" onClick={() => alignPicked({ y: 50 })}>Centre ↕</Button>
          <Button size="xs" variant="secondary" onClick={() => alignPicked({ x: 50, y: 50 })}>Both</Button>
        </Row>
        <Row label="Size"><Slider value={Math.round(o.scale * 100)} min={10} max={400} format={(v) => `${v}%`} onChange={(v) => patch({ scale: v / 100 }, 'scale')} /></Row>
        <Row label="X"><Slider value={Math.round(o.x)} min={0} max={100} format={(v) => `${v}%`} onChange={(x) => patch({ x }, 'x')} /></Row>
        <Row label="Y"><Slider value={Math.round(o.y)} min={0} max={100} format={(v) => `${v}%`} onChange={(y) => patch({ y }, 'y')} /></Row>
        <Row label="Rotation"><Slider value={Math.round(o.rotation)} min={-180} max={180} format={(v) => `${v}°`} onChange={(rotation) => patch({ rotation }, 'rot')} /></Row>
        <Row label="Opacity"><Slider value={Math.round(o.opacity * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => patch({ opacity: v / 100 }, 'op')} /></Row>
        {!text && <Row label="Flip"><Toggle checked={!!o.flipH} onChange={(flipH) => patch({ flipH })} label="Flip horizontally" /></Row>}
        {o.kind === 'image' && <Row label="Corners"><Slider value={o.corner ?? 0} min={0} max={50} onChange={(corner) => patch({ corner }, 'corner')} /></Row>}
        <Row label="Blend">
          <Select value={o.blend ?? 'normal'} onValueChange={(blend) => patch({ blend: blend as OverlayItem['blend'] })}>
            <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{BLENDS.map((b) => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
      </Section>
      </>}
      {tab === 'motion' && <>
      <Section title="Animation">
        <Row label="In"><PreviewPicker value={o.animIn.id} options={animOptions(o, 'in')} onChange={(id) => patch({ animIn: { ...o.animIn, id: id as never } })} /></Row>
        {o.animIn.id !== 'none' && <Row label="In length"><Slider value={o.animIn.duration} min={0.1} max={Math.max(0.2, Math.min(2, o.duration))} step={0.05} format={(v) => `${v.toFixed(2)}s`} onChange={(duration) => patch({ animIn: { ...o.animIn, duration } }, 'ain')} /></Row>}
        <Row label="Out"><PreviewPicker value={o.animOut.id} options={animOptions(o, 'out')} onChange={(id) => patch({ animOut: { ...o.animOut, id: id as never } })} /></Row>
        {o.animOut.id !== 'none' && <Row label="Out length"><Slider value={o.animOut.duration} min={0.1} max={Math.max(0.2, Math.min(2, o.duration))} step={0.05} format={(v) => `${v.toFixed(2)}s`} onChange={(duration) => patch({ animOut: { ...o.animOut, duration } }, 'aout')} /></Row>}
        <Row label="Loop"><PreviewPicker value={o.loop} options={loopOptions(o)} onChange={(loop) => patch({ loop: loop as OverlayItem['loop'] })} /></Row>
        {o.animIn.id !== 'none' && <Row label="In speed"><Slider value={o.animIn.speed ?? 1} min={0.25} max={4} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(speed) => patch({ animIn: { ...o.animIn, speed } }, 'ains')} /></Row>}
        {o.animOut.id !== 'none' && <Row label="Out speed"><Slider value={o.animOut.speed ?? 1} min={0.25} max={4} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(speed) => patch({ animOut: { ...o.animOut, speed } }, 'aouts')} /></Row>}
      </Section>
      <Section title="Playback speed">
        <Row label="Speed" hint="How fast the loop animation and keyframes play."><Slider value={o.speed ?? 1} min={0.25} max={4} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(speed) => patch({ speed }, 'spd')} /></Row>
        <div className="flex flex-wrap justify-end gap-1">
          {[0.5, 1, 1.5, 2, 3].map((s) => <Button key={s} size="xs" variant={(o.speed ?? 1) === s ? 'default' : 'secondary'} onClick={() => patch({ speed: s })}>{s}×</Button>)}
        </div>
      </Section>
      <Keyframes o={o} patch={patch} />
      </>}
      {tab === 'timing' && <>
      <Section title="Timing">
        <Row label="Start (s)"><Input type="number" step={0.1} min={0} className="h-7 w-24 text-xs" value={Number(o.start.toFixed(2))} onChange={(e) => patch({ start: Math.max(0, num(e.target.value, o.start)) }, 'start')} /></Row>
        <Row label="Length (s)"><Input type="number" step={0.1} min={0.2} className="h-7 w-24 text-xs" value={Number(o.duration.toFixed(2))} onChange={(e) => patch({ duration: Math.max(0.2, num(e.target.value, o.duration)) }, 'dur')} /></Row>
        <Row label="Ends"><span className="font-mono text-xs">{adjEnd(o).toFixed(2)}s{total ? ` of ${total.toFixed(1)}s` : ''}</span></Row>
        {o.tpl && <div className="flex justify-end"><Button size="xs" variant="secondary" onClick={() => patch({ start: 0, duration: Math.max(0.2, total || o.duration) })}>Whole video</Button></div>}
        <div className="flex flex-wrap justify-end gap-1.5 pt-1">
          <Button size="xs" variant="secondary" onClick={() => overlayOps.splitAtPlayhead(o.id)}><Scissors />Split at playhead</Button>
          <Button size="xs" variant="secondary" onClick={() => overlayOps.duplicate(o.id)}><Copy />Duplicate</Button>
          <Button size="xs" variant="ghost" className="hover:text-destructive" onClick={() => overlayOps.remove(o.id)}><Trash2 />Delete</Button>
        </div>
      </Section>
      </>}
    </div>
  );
}

/** Keyframes: position, size, rotation and opacity over the overlay's time. Values are offsets from the overlay's own settings. */
function Keyframes({ o, patch }: { o: OverlayItem; patch: (p: Partial<OverlayItem>, key?: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const kfs = [...(o.keyframes ?? [])].sort((a, b) => a.t - b.t);
  const k = kfs.find((x) => x.id === sel) ?? null;
  const set = (list: typeof kfs) => patch({ keyframes: list });
  const edit = (p: Partial<NonNullable<typeof k>>, key: string) => k && patch({ keyframes: kfs.map((x) => (x.id === k.id ? { ...x, ...p } : x)) }, `kf-${key}`);
  const add = () => {
    const t = Math.min(o.duration, Math.max(0, currentTime() - o.start));
    const near = kfs.find((x) => Math.abs(x.t - t) < 0.05);
    if (near) { setSel(near.id); return; }
    const kf = newKeyframe(Number(t.toFixed(2)), transformAt(kfs, t, IDENTITY));
    set([...kfs, kf]);
    setSel(kf.id);
  };
  return (
    <Section title="Keyframes" right={<Button size="xs" variant="secondary" onClick={add}>◆ Add at playhead</Button>}>
      {kfs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Move the playhead over this overlay, add a keyframe, move the playhead again and add another, then change the values. The overlay moves between them.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {kfs.map((x) => (
            <button key={x.id} type="button" onClick={() => { setSel(x.id); seek(o.start + x.t); }}
              className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${x.id === sel ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>◆ {x.t.toFixed(2)}s</button>
          ))}
        </div>
      )}
      {k && (
        <>
          <Row label="Time (s)"><Input type="number" step={0.05} min={0} max={o.duration} className="h-7 w-24 text-xs" value={k.t} onChange={(e) => edit({ t: Math.min(o.duration, Math.max(0, num(e.target.value, k.t))) }, 't')} /></Row>
          <Row label="Size ×"><Slider value={Math.round(k.scale * 100)} min={0} max={400} format={(v) => `${v}%`} onChange={(v) => edit({ scale: v / 100 }, 'scale')} /></Row>
          <Row label="Move X"><Slider value={Math.round(k.x)} min={-100} max={100} format={(v) => `${v}%`} onChange={(x) => edit({ x }, 'x')} /></Row>
          <Row label="Move Y"><Slider value={Math.round(k.y)} min={-100} max={100} format={(v) => `${v}%`} onChange={(y) => edit({ y }, 'y')} /></Row>
          <Row label="Rotate"><Slider value={Math.round(k.rotation)} min={-360} max={360} format={(v) => `${v}°`} onChange={(rotation) => edit({ rotation }, 'rot')} /></Row>
          <Row label="Opacity ×"><Slider value={Math.round(k.opacity * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => edit({ opacity: v / 100 }, 'op')} /></Row>
          <Row label="Easing">
            <Select value={k.ease} onValueChange={(ease) => edit({ ease: ease as typeof k.ease }, 'ease')}>
              <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{EASES.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}</SelectContent>
            </Select>
          </Row>
          <div className="flex justify-end"><Button size="xs" variant="ghost" className="hover:text-destructive" onClick={() => { set(kfs.filter((x) => x.id !== k.id)); setSel(null); }}><Trash2 />Delete keyframe</Button></div>
        </>
      )}
      {kfs.length > 0 && <div className="flex justify-end"><Button size="xs" variant="ghost" onClick={() => { set([]); setSel(null); }}>Clear all</Button></div>}
    </Section>
  );
}
