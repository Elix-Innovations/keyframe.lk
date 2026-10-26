import { useEffect, useState } from 'react';
import type { MatteSettings, RegionBlur } from '@/types';
import { DEFAULT_MATTE, newRegionBlur } from '@/lib/videoFx';
import { analysisStatus, cancelCutout, loadPrecise, loadSegmenter, onSegmenterChange, preciseStatus, prepareCutout, segmenterState } from '@/render/matte';
import { getBlob } from '@/lib/db';
import { Plus, Trash2 } from '@/components/icons';
import { useEditor } from '@/store';
import { Button } from '@/components/ui/button';
import { ColorInput, Row, Section, Segmented, Slider, Toggle } from '../controls';
import { TargetBar, useLayer } from './EffectsPanel';
import { clipOps } from '../ClipLane';

/** Background removal for the selected video clip: AI person cut-out or a colour key, and what replaces the background. */
export function BackgroundSection() {
  const { layer, set, clip } = useLayer();
  const m: MatteSettings = layer.matte ?? DEFAULT_MATTE;
  const setM = (p: Partial<MatteSettings>, key?: string) => set((l) => ({ ...l, matte: { ...(l.matte ?? DEFAULT_MATTE), ...p } }), key && `matte-${key}`);
  const engine = m.engine ?? 'precise';
  const [seg, setSeg] = useState(segmenterState());
  const [pre, setPre] = useState(preciseStatus());
  const [, bump] = useState(0);
  useEffect(() => onSegmenterChange(() => { setSeg(segmenterState()); setPre(preciseStatus()); bump((n) => n + 1); }), []);
  const an = clip ? analysisStatus(clip.assetId) : null;
  const prepare = async () => {
    if (!clip) return;
    const blob = await getBlob(clip.assetId);
    if (!blob) { useEditor.getState().notify('The video file is missing from local storage.', 'error'); return; }
    void prepareCutout(clip.assetId, blob, clip.in, clip.in + clip.duration * clip.speed);
  };
  useEffect(() => {
    if (m.mode !== 'ai') return;
    if (engine === 'precise' && pre.state === 'idle') void loadPrecise();
    if (engine === 'fast' && seg.state === 'idle') void loadSegmenter();
  }, [m.mode, engine, seg.state, pre.state]);

  // An AI cut-out always lives on its own layer above the clip (clips cut out before this existed are split now).
  useEffect(() => {
    if (clip && clip.kind === 'video' && !clip.cutout && m.mode === 'ai') clipOps.createCutout(clip.id);
  }, [clip?.id, clip?.cutout, m.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickColour = async () => {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!ED) return;
    try { setM({ keyColor: (await new ED().open()).sRGBHex.toUpperCase() }); } catch { /* cancelled */ }
  };
  if (!clip) return null;
  const on = m.mode !== 'none';
  return (
    <>
      <Section title="Cut-out layer">
        <p className="text-[11px] text-muted-foreground">{clip.cutout ? 'This is a cut-out layer. Move, scale and rotate it in the preview, and set other layers\' Depth to “Behind cut-out” to put them between it and the video.' : 'Make the subject its own layer above the video. Then place text, stickers or images behind it or in front of it, and move or resize the subject like any overlay.'}</p>
        {!clip.cutout && <Button size="sm" onClick={() => clipOps.createCutout(clip.id)}><Plus />Create cut-out layer</Button>}
      </Section>
      <TargetBar pick={(l) => ({ matte: l.matte, regionBlurs: l.regionBlurs })} label="background and blur" />
      <Section title="Remove background" right={on ? <Button size="xs" variant="ghost" onClick={() => set((l) => ({ ...l, matte: undefined }))}>Reset</Button> : null}>
        <Segmented fill size="sm" value={m.mode} onChange={(mode) => (mode === 'ai' && !clip.cutout && clip.kind === 'video' ? clipOps.createCutout(clip.id) : setM({ mode }))} // AI cut-out splits into its own layer above the clip, like CapCut
          
          options={[{ value: 'none', label: 'Off' }, { value: 'ai', label: 'AI person' }, { value: 'chroma', label: 'Colour key' }]} />
        {m.mode === 'ai' && (
          <>
            <Row label="Quality" hint="Precise uses a matting model: fine hair and clean edges, but it is slower. Fast runs in real time with softer edges.">
              <Segmented size="sm" value={engine} onChange={(e) => setM(e === 'precise' ? { engine: e, threshold: 50, shift: -2, edge: 1 } : { engine: e, threshold: 50, shift: 0, edge: 2 })} options={[{ value: 'precise', label: 'Precise' }, { value: 'fast', label: 'Fast' }]} />
            </Row>
            {engine === 'precise' && pre.state === 'loading' && <p className="text-[11px] text-muted-foreground">Downloading the matting model, {Math.round(pre.progress * 100)}% (about 26 MB plus 22 MB of runtime, only the first time)…</p>}
            {engine === 'precise' && pre.state === 'error' && <p className="text-[11px] text-destructive">{pre.error} <button className="underline" onClick={() => void loadPrecise()}>Try again</button></p>}
            {engine === 'precise' && pre.state === 'ready' && <p className="text-[11px] text-muted-foreground">Matting on your {pre.backend === 'GPU' ? 'graphics card' : 'processor (slower: a few frames per second)'}. Pause to see the exact frame; exports compute every frame.</p>}
            {engine === 'precise' && pre.state === 'ready' && an && (
              <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2">
                {an.state === 'running' && <>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(an.progress * 100)}%` }} /></div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>Preparing the cut-out for smooth playback… {Math.round(an.progress * 100)}%</span><Button size="xs" variant="ghost" onClick={() => cancelCutout(clip!.assetId)}>Cancel</Button></div>
                </>}
                {an.state === 'done' && <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>Cut-out prepared ({an.frames} frames). Playback and export use it.</span><Button size="xs" variant="ghost" onClick={() => void prepare()}>Redo</Button></div>}
                {(an.state === 'idle' || an.state === 'error') && <>
                  <p className="text-[11px] text-muted-foreground">{an.state === 'error' ? `${an.error} ` : ''}Prepare this clip once so the cut-out plays smoothly. Until then playback uses the fast engine and a paused frame is matted exactly.</p>
                  <Button size="xs" onClick={() => void prepare()}>Prepare cut-out</Button>
                </>}
              </div>
            )}
            {engine === 'fast' && seg.state === 'loading' && <p className="text-[11px] text-muted-foreground">Loading the AI model (about 6 MB, only the first time)…</p>}
            {engine === 'fast' && seg.state === 'error' && <p className="text-[11px] text-destructive">{seg.error} <button className="underline" onClick={() => void loadSegmenter()}>Try again</button></p>}
            {engine === 'precise' && <Row label="Remove stray blobs" hint="Drops small objects the model half-mistook for a person (a poster, a lamp). Turn off if a hand or prop disappears."><Toggle checked={m.cleanup !== false} onChange={(cleanup) => setM({ cleanup })} label="Remove stray blobs" /></Row>}
            <Row label="Cut harder" hint="Higher keeps only pixels the model is sure are the person."><Slider value={m.threshold} min={10} max={90} format={(v) => `${v}`} onChange={(threshold) => setM({ threshold }, 'thr')} /></Row>
            <Row label="Grow / shrink" hint="Expand (+) or tighten (−) the outline."><Slider value={m.shift} min={-12} max={12} format={(v) => `${v > 0 ? '+' : ''}${v}px`} onChange={(shift) => setM({ shift }, 'shift')} /></Row>
            <Row label="Soft edge"><Slider value={m.edge} min={0} max={20} format={(v) => `${v}px`} onChange={(edge) => setM({ edge }, 'edge')} /></Row>
          </>
        )}
        {m.mode === 'chroma' && (
          <>
            <Row label="Key colour">
              <ColorInput value={m.keyColor} onChange={(keyColor) => setM({ keyColor })} />
              <Button size="xs" variant="secondary" onClick={() => setM({ keyColor: '#00FF00' })}>Green</Button>
              <Button size="xs" variant="secondary" onClick={() => setM({ keyColor: '#0047FF' })}>Blue</Button>
              {typeof window !== 'undefined' && 'EyeDropper' in window && <Button size="xs" variant="secondary" onClick={pickColour}>Pick</Button>}
            </Row>
            <Row label="Similarity" hint="How far from the key colour still counts as background."><Slider value={m.similarity} min={0} max={100} onChange={(similarity) => setM({ similarity }, 'sim')} /></Row>
            <Row label="Smoothness" hint="Width of the soft edge between kept and removed."><Slider value={m.smoothness} min={0} max={100} onChange={(smoothness) => setM({ smoothness }, 'smooth')} /></Row>
            <Row label="Spill removal" hint="Takes the key colour's tint out of hair and edges."><Slider value={m.spill} min={0} max={100} onChange={(spill) => setM({ spill }, 'spill')} /></Row>
          </>
        )}
        {on && (
          <>
            <Row label="Keep background" hint="Remove the subject instead and keep what is behind it."><Toggle checked={m.invert} onChange={(invert) => setM({ invert })} label="Invert" /></Row>
            <Row label="Behind it">
              <Segmented size="sm" value={m.background} onChange={(background) => setM({ background })}
                options={[{ value: 'transparent', label: 'Clear' }, { value: 'color', label: 'Colour' }, { value: 'blur', label: 'Blur' }]} />
            </Row>
            {m.background === 'color' && <Row label="Colour"><ColorInput value={m.bgColor} onChange={(bgColor) => setM({ bgColor })} /></Row>}
            {m.background === 'blur' && <Row label="Blur"><Slider value={m.bgBlur} min={2} max={80} format={(v) => `${v}px`} onChange={(bgBlur) => setM({ bgBlur }, 'bgb')} /></Row>}
            {m.background === 'transparent' && <p className="text-[11px] text-muted-foreground">Clear shows the clips and background colour underneath. Put this clip on an overlay track over another video or image to replace the background.</p>}
          </>
        )}
      </Section>
    </>
  );
}

const SHAPES = [{ value: 'rect', label: 'Box' }, { value: 'ellipse', label: 'Oval' }] as const;
const LOOKS = [{ value: 'blur', label: 'Blur' }, { value: 'pixelate', label: 'Mosaic' }] as const;

/** Blur the whole clip, or blur / pixelate chosen areas (faces, plates, text). */
export function BlurSection() {
  const { layer, set, clip } = useLayer();
  const areas = layer.regionBlurs ?? [];
  const setAreas = (fn: (a: RegionBlur[]) => RegionBlur[], key?: string) => set((l) => ({ ...l, regionBlurs: fn(l.regionBlurs ?? []) }), key);
  const patch = (id: string, p: Partial<RegionBlur>, key?: string) => setAreas((a) => a.map((r) => (r.id === id ? { ...r, ...p } : r)), key && `rb-${key}-${id}`);
  if (!clip) return null;
  return (
    <>
      <TargetBar pick={(l) => ({ matte: l.matte, regionBlurs: l.regionBlurs, filters: l.filters })} label="background and blur" />
      <Section title="Blur whole clip">
        <Row label="Amount"><Slider value={layer.filters.blur} min={0} max={30} step={0.5} format={(v) => (v ? `${v}px` : 'Off')} onChange={(blur) => set((l) => ({ ...l, filters: { ...l.filters, blur } }), 'blur')} /></Row>
      </Section>
      <Section title="Blur or hide areas" right={<Button size="xs" variant="secondary" onClick={() => setAreas((a) => [...a, newRegionBlur()])}><Plus />Add area</Button>}>
        {areas.length === 0 && <p className="text-xs text-muted-foreground">Add an area to blur or pixelate part of the picture, such as a face, a number plate or a name. It is cut from the original frame, so it covers the same spot whatever the clip's crop or zoom.</p>}
        {areas.map((r, i) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-xl border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">Area {i + 1}</span>
              <Segmented size="sm" value={r.shape} onChange={(shape) => patch(r.id, { shape })} options={[...SHAPES]} />
              <Segmented size="sm" value={r.look} onChange={(look) => patch(r.id, { look })} options={[...LOOKS]} />
              <Button variant="ghost" size="icon-xs" className="ml-auto hover:text-destructive" aria-label="Delete area" onClick={() => setAreas((a) => a.filter((x) => x.id !== r.id))}><Trash2 /></Button>
            </div>
            <Row label="Centre X"><Slider value={r.x} min={0} max={100} format={(v) => `${v}%`} onChange={(x) => patch(r.id, { x }, 'x')} /></Row>
            <Row label="Centre Y"><Slider value={r.y} min={0} max={100} format={(v) => `${v}%`} onChange={(y) => patch(r.id, { y }, 'y')} /></Row>
            <Row label="Width"><Slider value={r.w} min={2} max={100} format={(v) => `${v}%`} onChange={(w) => patch(r.id, { w }, 'w')} /></Row>
            <Row label="Height"><Slider value={r.h} min={2} max={100} format={(v) => `${v}%`} onChange={(h) => patch(r.id, { h }, 'h')} /></Row>
            <Row label={r.look === 'blur' ? 'Blur' : 'Block size'}><Slider value={r.amount} min={2} max={80} format={(v) => `${v}px`} onChange={(amount) => patch(r.id, { amount }, 'a')} /></Row>
            <Row label="Soft edge"><Slider value={r.feather} min={0} max={100} format={(v) => `${v}%`} onChange={(feather) => patch(r.id, { feather }, 'f')} /></Row>
            <Row label="Blur outside" hint="Blur everything except this area."><Toggle checked={r.invert} onChange={(invert) => patch(r.id, { invert })} label="Blur outside" /></Row>
          </div>
        ))}
      </Section>
    </>
  );
}
