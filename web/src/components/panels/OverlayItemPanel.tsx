import { useState } from 'react';
import { Copy, Scissors, Trash2 } from '@/components/icons';
import { useEditor } from '@/store';
import type { MotionScene, OverlayItem } from '@/types';
import { adjEnd } from '@/lib/adj';
import { ai } from '@/lib/api';
import { outputSize } from '@/render/compose';
import { BLENDS, TEXT_PRESETS } from '@/lib/overlays';
import { EASES, IDENTITY, newKeyframe, transformAt } from '@/lib/videoFx';
import { currentTime, seek } from '@/lib/player';
import { AnimGrid } from './AnimGrid';
import { PreviewPicker } from '../OverlayPicker';
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
import { DisplayControls } from './DisplayPanel';
import { nanoid } from 'nanoid';
import * as db from '@/lib/db';

const num = (v: string, fallback: number) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };

/** The overlay's own text and colours, so previews show what you will get. */
const sampleBase = (o: OverlayItem): Partial<OverlayItem> => ({
  kind: o.kind === 'motion' ? 'sticker' : o.kind, ...(o.kind === 'image' ? { assetId: o.assetId, corner: o.corner, flipH: o.flipH } : {}), text: o.kind === 'motion' ? '✨' : o.text.split('\n')[0].slice(0, 12) || 'Aa', fontId: o.fontId, color: o.color, bold: o.bold, italic: o.italic,
  strokeWidth: o.strokeWidth, strokeColor: o.strokeColor, shadow: o.shadow, glow: o.glow, bg: o.bg,
});

/** A motion graphic / transition layer: its name and length, and asking Claude to change it. */
function MotionEdit({ o, patch }: { o: OverlayItem; patch: (p: Partial<OverlayItem>, key?: string) => void }) {
  const project = useEditor((s) => s.project)!;
  const notify = useEditor((s) => s.notify);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const scene = o.scene;
  if (!scene) return null;
  const setAdj = (a: Partial<NonNullable<MotionScene['adjust']>>) => patch({ scene: { ...scene, adjust: { ...scene.adjust, ...a } } }, 'sadj');
  const change = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const out = outputSize(project);
      const r = await ai.motion({ prompt: prompt.trim(), role: scene.role, frame: { w: 1080, h: Math.round((1080 * out.height) / out.width) }, base: scene, fonts: { english: project.style.text.englishFont, sinhala: project.style.text.sinhalaFont } });
      patch({ scene: r.scene, duration: r.scene.duration });
      setPrompt('');
      notify('Updated the scene.', 'success');
    } catch (e) { notify((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Section title={scene.role === 'transition' ? 'Transition' : scene.role === 'background' ? 'Background' : 'Motion graphic'}>
      <Row label="Name"><Input className="h-7 text-xs" value={scene.name} onChange={(e) => patch({ scene: { ...scene, name: e.target.value } }, 'sname')} /></Row>
      <Row label="Length"><span className="font-mono text-xs">{scene.duration.toFixed(2)}s</span></Row>
      <Row label="Hue"><Slider value={scene.adjust?.hue ?? 0} min={-180} max={180} format={(v) => `${v}°`} onChange={(hue) => setAdj({ hue })} /></Row>
      <Row label="Saturation"><Slider value={Math.round((scene.adjust?.sat ?? 1) * 100)} min={0} max={200} format={(v) => `${v}%`} onChange={(v) => setAdj({ sat: v / 100 })} /></Row>
      <Row label="Brightness"><Slider value={Math.round((scene.adjust?.bri ?? 1) * 100)} min={40} max={180} format={(v) => `${v}%`} onChange={(v) => setAdj({ bri: v / 100 })} /></Row>
      <Row label="Contrast"><Slider value={Math.round((scene.adjust?.con ?? 1) * 100)} min={50} max={180} format={(v) => `${v}%`} onChange={(v) => setAdj({ con: v / 100 })} /></Row>
      <Row label="Speed"><Slider value={Math.round((scene.adjust?.speed ?? 1) * 100)} min={25} max={300} format={(v) => `${(v / 100).toFixed(2)}×`} onChange={(v) => setAdj({ speed: v / 100 })} /></Row>
      <Button size="xs" variant="secondary" disabled={!scene.adjust} onClick={() => patch({ scene: { ...scene, adjust: undefined } })}>Reset look</Button>
      <Textarea className="min-h-16 text-sm" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask Claude to change it: make it faster, use pink, add a line under the name…" />
      <Button size="sm" disabled={busy || !prompt.trim()} onClick={() => void change()}>{busy ? 'Claude is working…' : 'Change with Claude'}</Button>
      <p className="text-[11px] text-muted-foreground">Move, resize and trim it with the Layout and Timing tabs. Drag it up or down the Layers rows on the timeline to put it in front of or behind other layers.</p>
    </Section>
  );
}

/** The selected text, sticker or image overlay: content, look, position, animation and timing. */
export function OverlayItemPanel() {
  const o = useEditor((s) => s.project!.overlays?.find((x) => x.id === s.selectedOverlayId) ?? null);
  const setOverlays = useEditor((s) => s.setOverlays);
  const custom = useEditor((s) => s.customTemplates);
  const setCustom = useEditor((s) => s.setCustomTemplates);
  const notify = useEditor((s) => s.notify);
  const total = useEditor((s) => s.project!.duration);
  const [script, setScript] = useState<'sinhala' | 'english'>('sinhala');
  const [tab0, setTab] = useState<'edit' | 'style' | 'display' | 'layout' | 'motion' | 'timing'>('edit');
  // A tab the selected layer does not have (Style / Display are template-only) falls back to Edit.
  const tab = (tab0 === 'style' || tab0 === 'display') && !o?.tpl ? 'edit' : tab0;
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
          options={[{ value: 'edit', label: text ? 'Text' : 'Edit' }, ...(o.tpl ? [{ value: 'style' as const, label: 'Style' }, ...(o.tpl.style.creative ? [] : [{ value: 'display' as const, label: 'Display' }])] : []), { value: 'layout', label: 'Layout' }, { value: 'motion', label: 'Motion' }, { value: 'timing', label: 'Timing' }]} />
      </div>
      {tab === 'edit' && o.kind === 'motion' && <MotionEdit o={o} patch={patch} />}
      {tab === 'edit' && o.kind !== 'motion' && <>
      <Section title={text ? 'Text' : o.tpl ? 'Template text' : o.kind === 'sticker' ? 'Sticker' : 'Image'}>
        {o.tpl && <p className="text-[11px] text-muted-foreground">Text template layer. Edit the words below (put *stars* around a word to emphasise it); size, position, rotation and timing work like any text. Use Timing → “Whole video” to cover the entire video.</p>}
        {o.kind !== 'image' && (
          <Textarea className="sinhala min-h-16 text-sm" value={o.text} placeholder={text ? 'Type your text' : 'Emoji or symbol'} onChange={(e) => patch({ text: e.target.value }, 'text')} />
        )}
        {o.kind === 'image' && <>
          <Row label="Size"><Slider value={Math.round(o.scale * 100)} min={10} max={400} format={(v) => `${v}%`} onChange={(v) => patch({ scale: v / 100 }, 'scale')} /></Row>
          <Row label="Opacity"><Slider value={Math.round(o.opacity * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => patch({ opacity: v / 100 }, 'op')} /></Row>
          <Row label="Corners"><Slider value={o.corner ?? 0} min={0} max={50} onChange={(corner) => patch({ corner }, 'corner')} /></Row>
          <Row label="Flip"><Toggle checked={!!o.flipH} onChange={(flipH) => patch({ flipH })} label="Flip horizontally" /></Row>
        </>}
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
      {tab === 'display' && o.tpl && <>
      <DisplayControls style={o.tpl.style} preview
        setStyle={(fn, key) => patch({ tpl: { ...o.tpl!, style: fn(o.tpl!.style) } }, key && `tpl-${key}`)} />
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
      <AnimGrid value={o} maxLen={o.duration} sample={sampleBase(o)} onChange={(p, key) => patch(p, key)} />
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
