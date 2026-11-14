import { nanoid } from 'nanoid';
import { AudioLines, Copy, ImagePlus, Plus, Scissors, Trash2 } from '@/components/icons';
import { extractFrame } from '@/lib/extractFrame';
import { generateCaptionsFromAudio } from '@/lib/captionsFromAudio';
import { Volume, VolumeOff } from '@/components/icons-audio';
import type { Ease, OverlayBlend, VideoKeyframe } from '@/types';
import { BLENDS } from '@/lib/overlays';
import { useEditor } from '@/store';
import { clipOps, SPEEDS } from '../ClipLane';
import { partnerOf } from '@/lib/clips';
import { Empty } from '../controls';
import { NoiseRemoval } from './NoiseRemoval';
import { seek } from '@/lib/player';
import { formatClock } from '@/lib/srt';
import { EASES, newKeyframe, propAt, transformAt } from '@/lib/videoFx';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Row, Section, Segmented, Slider } from '../controls';
import { useState, useSyncExternalStore } from 'react';
import { copyEdits, hasEdits, onClipboardChange, pasteEdits } from '@/lib/clipboard';
import { SpeedCurve } from './SpeedCurve';
import { TargetBar, useLayer } from './EffectsPanel';
import { BackgroundSection, BlurSection } from './MattePanel';
import { cropForAspect, hasCrop } from '@/lib/videoFx';
import { FlipHorizontalIcon, RotateLeft01Icon, RotateRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

export function KeyframeCard({ k }: { k: VideoKeyframe }) {
  const { set, clip } = useLayer();
  const patch = (p: Partial<VideoKeyframe>, key?: string) => set((v) => ({ ...v, keyframes: v.keyframes.map((x) => (x.id === k.id ? { ...x, ...p } : x)) }), key && `kf-${key}-${k.id}`);
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-2.5">
      <div className="flex items-center gap-2">
        <button className="font-mono text-xs text-primary hover:underline" onClick={() => seek((clip?.start ?? 0) + k.t)}>◆ {formatClock(k.t, true)}</button>
        <Select value={k.ease} onValueChange={(v) => patch({ ease: v as Ease })}>
          <SelectTrigger size="sm" className="ml-auto w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{EASES.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="ghost" size="icon-xs" aria-label="Delete keyframe" className="hover:text-destructive" onClick={() => set((v) => ({ ...v, keyframes: v.keyframes.filter((x) => x.id !== k.id) }))}><Trash2 /></Button>
      </div>
      <Row label="Scale"><Slider value={k.scale} min={0.2} max={3} step={0.01} onChange={(scale) => patch({ scale }, 'scale')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
      <Row label="Position X"><Slider value={k.x} min={-100} max={100} step={0.5} onChange={(x) => patch({ x }, 'x')} format={(v) => `${v}%`} /></Row>
      <Row label="Position Y"><Slider value={k.y} min={-100} max={100} step={0.5} onChange={(y) => patch({ y }, 'y')} format={(v) => `${v}%`} /></Row>
      <Row label="Rotation"><Slider value={k.rotation} min={-180} max={180} step={1} onChange={(rotation) => patch({ rotation }, 'rot')} format={(v) => `${v}°`} /></Row>
      <Row label="Opacity"><Slider value={k.opacity} min={0} max={1} step={0.01} onChange={(opacity) => patch({ opacity }, 'op')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
    </div>
  );
}

/** Link state and quick actions for the selected clip. */
export function ClipActions() {
  const clip = useEditor((s) => s.project!.clips?.find((c) => c.id === s.selectedClipId) ?? null);
  const partner = useEditor((s) => { const c = s.project!.clips?.find((x) => x.id === s.selectedClipId); return c ? partnerOf(s.project!.clips ?? [], c) : null; });
  const edits = useSyncExternalStore(onClipboardChange, hasEdits, () => false);
  if (!clip) return <Section title="Clip"><Empty icon={<Scissors />} title="No clip selected">Click a clip on the timeline to edit it.</Empty></Section>;
  const audio = clip.kind === 'audio';
  return (
    <Section title={audio ? 'Audio clip' : 'Video clip'} right={<span className="max-w-32 truncate text-[11px] text-muted-foreground">{clip.name}</span>}>
      <Row label="Link" hint="A linked video and audio clip move, trim, split and change speed together.">
        {clip.linkId
          ? <Button size="xs" variant="secondary" onClick={() => clipOps.unlink(clip.id)}>Unlink {partner ? (audio ? 'from video' : 'from audio') : ''}</Button>
          : <Button size="xs" variant="secondary" onClick={() => clipOps.link(clip.id)}>Link with {audio ? 'video' : 'audio'}</Button>}
      </Row>
      <Row label="Edits" hint="Copy everything edited on this clip (filters, grade, effects, crop, transform, keyframes, transitions, animation, cut-out, blur, speed, audio and the filter / effect blocks over it), then paste it onto another clip.">
        <div className="flex gap-1.5">
          <Button size="xs" variant="secondary" onClick={() => copyEdits()}><Copy />Copy edits</Button>
          <Button size="xs" variant="secondary" disabled={!edits} onClick={() => pasteEdits()}>Paste edits</Button>
        </div>
      </Row>
      {!audio && (
        <Row label="Extract frame" hint="Pause on a frame, then pick where it goes: a held still right after this clip on the same layer, an image overlay at the playhead, or a PNG saved to Media and downloaded.">
          <div className="flex flex-wrap gap-1.5">
            <Button size="xs" variant="secondary" onClick={() => void extractFrame(clip.id, 'layer')}><ImagePlus />Next to clip</Button>
            <Button size="xs" variant="secondary" onClick={() => void extractFrame(clip.id, 'overlay')}>Overlay</Button>
            <Button size="xs" variant="secondary" onClick={() => void extractFrame(clip.id, 'save')}>Save PNG</Button>
          </div>
        </Row>
      )}
      <div className="flex flex-wrap justify-end gap-1.5 pt-1">
        <Button size="xs" variant="secondary" onClick={() => clipOps.splitAtPlayhead([clip.id])}><Scissors />Split</Button>
        <Button size="xs" variant="secondary" onClick={() => clipOps.duplicate(clip.id)}><Copy />Duplicate</Button>
        {!audio && !clip.freeze && <Button size="xs" variant="secondary" onClick={() => clipOps.freeze(clip.id)}>Freeze frame</Button>}
        {!clip.freeze && <Button size="xs" variant={clip.reverse ? 'default' : 'secondary'} onClick={() => clipOps.reverse(clip.id)}>Reverse</Button>}
        <Button size="xs" variant="ghost" className="hover:text-destructive" onClick={() => clipOps.remove(clip.id)}><Trash2 />Delete</Button>
      </div>
    </Section>
  );
}

/** Speed: slider, presets and an exact duration. Linked audio follows. */
export function SpeedPanel() {
  const clip = useEditor((s) => s.project!.clips?.find((c) => c.id === s.selectedClipId) ?? null);
  if (!clip) return <Section title="Speed"><Empty icon={<Scissors />} title="No clip selected">Click a clip on the timeline to change its speed.</Empty></Section>;
  if (clip.freeze) return <Section title="Speed"><p className="text-xs text-muted-foreground">A freeze frame has no speed.</p></Section>;
  const source = clip.duration * clip.speed; // length of the source span this clip plays
  const [tab, setTab] = useState<'normal' | 'curve'>(clip.curve ? 'curve' : 'normal');
  const mode = clip.curve ? 'curve' : tab;
  return (
    <Section title="Speed" right={!clip.curve && clip.speed !== 1 ? <Button size="xs" variant="ghost" onClick={() => clipOps.speed(clip.id, 1)}>Reset</Button> : null}>
      <Segmented value={mode} fill onChange={(v) => { setTab(v as 'normal' | 'curve'); if (v === 'normal' && clip.curve) clipOps.curve(clip.id, undefined); }} options={[{ value: 'normal', label: 'Standard' }, { value: 'curve', label: 'Curve' }]} />
      {mode === 'curve' ? (
        <>
          <SpeedCurve clip={clip} />
          <p className="text-[11px] text-muted-foreground">{source.toFixed(2)}s of footage plays in {clip.duration.toFixed(2)}s. Pitch follows speed.</p>
        </>
      ) : (
        <>
          <Row label="Speed"><Slider value={clip.speed} min={0.1} max={8} step={0.05} onChange={(s) => clipOps.speed(clip.id, s)} format={(v) => `${v.toFixed(2)}×`} /></Row>
          <div className="flex flex-wrap justify-end gap-1">
            {SPEEDS.map((s) => <Button key={s} size="xs" variant={clip.speed === s ? 'default' : 'secondary'} onClick={() => clipOps.speed(clip.id, s)}>{s}×</Button>)}
          </div>
          <Row label="Duration" hint="Changing the duration changes the speed so the same footage fits."><Slider value={clip.duration} min={Math.max(0.2, source / 8)} max={source / 0.1} step={0.05} onChange={(d) => clipOps.speed(clip.id, source / d)} format={(v) => `${v.toFixed(2)}s`} /></Row>
        </>
      )}
    </Section>
  );
}

/** Volume, fades and noise removal. For a video clip this edits its linked audio clip. */
export function ClipAudioPanel() {
  const clip = useEditor((s) => {
    const c = s.project!.clips?.find((x) => x.id === s.selectedClipId) ?? null;
    return c && c.kind !== 'audio' ? partnerOf(s.project!.clips ?? [], c) : c;
  });
  const setClips = useEditor((s) => s.setClips);
  const time = useEditor((s) => s.time);
  if (!clip) return <Section title="Audio"><Empty icon={<Volume />} title="No audio">This clip has no linked audio clip. Link one from the Video tab, or select an audio clip on the timeline.</Empty></Section>;
  const patch = (p: Partial<typeof clip>, key?: string) => setClips((cs) => cs.map((c) => (c.id === clip.id ? { ...c, ...p } : c)), key && `clipinsp-${key}-${clip.id}`);
  // Keyframed volume: the slider shows the value at the playhead and writes a keyframe there.
  const local = Math.max(0, Math.min(time - clip.start, clip.duration));
  const nearVol = clip.volKf?.find((k) => Math.abs(k.t - local) < 0.05);
  const volShown = propAt(clip.volKf, local, clip.volume);
  const setVol = (v: number) => setClips((cs) => cs.map((c) => {
    if (c.id !== clip.id) return c;
    if (!c.volKf?.length) return { ...c, volume: v };
    const h = c.volKf.find((k) => Math.abs(k.t - local) < 0.05);
    return { ...c, volKf: h ? c.volKf.map((k) => (k === h ? { ...k, v } : k)) : [...c.volKf, { id: nanoid(8), t: local, v, ease: 'easeInOut' as const }] };
  }), `clipinsp-vol-${clip.id}`);
  const volKf = { on: !!nearVol, toggle: () => setClips((cs) => cs.map((c) => {
    if (c.id !== clip.id) return c;
    const h = c.volKf?.find((k) => Math.abs(k.t - local) < 0.05);
    if (h) {
      const rest = (c.volKf ?? []).filter((k) => k !== h);
      return rest.length ? { ...c, volKf: rest } : { ...c, volKf: undefined, volume: h.v };
    }
    return { ...c, volKf: [...(c.volKf ?? []), { id: nanoid(8), t: local, v: propAt(c.volKf, local, c.volume), ease: 'easeInOut' as const }] };
  })) };
  return (
    <div>
      <Section title="Basic" right={<span className="max-w-32 truncate text-[11px] text-muted-foreground">{clip.name}</span>}>
        <Row label="Volume" kf={volKf}><Slider value={volShown} min={-30} max={12} step={0.5} onChange={setVol} format={(v) => `${v > 0 ? '+' : ''}${v} dB`} /></Row>
        <Row label="Fade in"><Slider value={clip.fadeIn} min={0} max={Math.min(5, clip.duration / 2)} step={0.05} onChange={(fadeIn) => patch({ fadeIn }, 'fi')} format={(v) => `${v.toFixed(2)}s`} /></Row>
        <Row label="Fade out"><Slider value={clip.fadeOut} min={0} max={Math.min(5, clip.duration / 2)} step={0.05} onChange={(fadeOut) => patch({ fadeOut }, 'fo')} format={(v) => `${v.toFixed(2)}s`} /></Row>
        <Row label="Mute"><Button size="xs" variant={clip.muted ? 'default' : 'secondary'} onClick={() => clipOps.mute(clip.id)}>{clip.muted ? <VolumeOff /> : <Volume />}{clip.muted ? 'Muted' : 'Mute'}</Button></Row>
      </Section>
      <Section title="Captions">
        <Button size="sm" variant="secondary" onClick={() => void generateCaptionsFromAudio(clip.id)}><AudioLines />Generate captions from this audio</Button>
        <p className="text-xs text-muted-foreground">Transcribes this clip and places the captions where it sits on the timeline, replacing captions already there.</p>
      </Section>
      {clip.fromVideo && <NoiseRemoval assetId={clip.assetId} />}
    </div>
  );
}

const ASPECTS: [string, number, number][] = [['1:1', 1, 1], ['9:16', 9, 16], ['16:9', 16, 9], ['4:5', 4, 5], ['3:4', 3, 4], ['4:3', 4, 3]];

/** Crop, flip, rotate and the static position/scale of the video clip. */
export function CropAndTransform({ part }: { part: 'crop' | 'transform' }) {
  const { layer, set, clip } = useLayer();
  const crop = layer.crop!;
  const base = layer.base!;
  const setCrop = (p: Partial<typeof crop>, key: string) => set((l) => ({ ...l, crop: { ...l.crop!, ...p } }), `crop-${key}`);
  const time = useEditor((s) => s.time);
  const local = Math.max(0, Math.min(time - (clip?.start ?? 0), clip?.duration ?? 0));
  const animated = layer.keyframes.length > 0;
  // With keyframes the sliders show the animated value at the playhead; changing one writes a keyframe here (like CapCut).
  const shown = animated ? transformAt(layer.keyframes, local, base) : base;
  const here = layer.keyframes.find((k) => Math.abs(k.t - local) < 0.05);
  const setBase = (p: Partial<typeof base>, key: string) => set((l) => {
    if (!l.keyframes.length) return { ...l, base: { ...l.base!, ...p } };
    const at = transformAt(l.keyframes, local, l.base!);
    const h = l.keyframes.find((k) => Math.abs(k.t - local) < 0.05);
    return { ...l, keyframes: h ? l.keyframes.map((k) => (k === h ? { ...k, ...p } : k)) : [...l.keyframes, newKeyframe(local, { ...at, ...p })] };
  }, `base-${key}`);
  const kf = { on: !!here, toggle: () => set((l) => {
    const h = l.keyframes.find((k) => Math.abs(k.t - local) < 0.05);
    return { ...l, keyframes: h ? l.keyframes.filter((k) => k !== h) : [...l.keyframes, newKeyframe(local, transformAt(l.keyframes, local, l.base!))] };
  }) };
  const turn = (d: 90 | -90) => set((l) => ({ ...l, rot90: ((((l.rot90 ?? 0) + d) % 360 + 360) % 360) as 0 | 90 | 180 | 270 }));
  if (!clip) return null;
  return (
    <>
      {part === 'crop' && <Section title="Crop" right={hasCrop(crop) ? <Button size="xs" variant="ghost" onClick={() => set((l) => ({ ...l, crop: { l: 0, t: 0, r: 0, b: 0 } }))}>Reset</Button> : null}>
        <div className="flex flex-wrap gap-1">
          {ASPECTS.map(([label, w, h]) => (
            <Button key={label} size="xs" variant="secondary" onClick={() => set((l) => ({ ...l, crop: cropForAspect(clip.width || 1080, clip.height || 1920, w, h) }))}>{label}</Button>
          ))}
        </div>
        <Row label="Left"><Slider value={crop.l} min={0} max={90} step={0.5} onChange={(l) => setCrop({ l: Math.min(l, 95 - crop.r) }, 'l')} format={(v) => `${v}%`} /></Row>
        <Row label="Right"><Slider value={crop.r} min={0} max={90} step={0.5} onChange={(r) => setCrop({ r: Math.min(r, 95 - crop.l) }, 'r')} format={(v) => `${v}%`} /></Row>
        <Row label="Top"><Slider value={crop.t} min={0} max={90} step={0.5} onChange={(t) => setCrop({ t: Math.min(t, 95 - crop.b) }, 't')} format={(v) => `${v}%`} /></Row>
        <Row label="Bottom"><Slider value={crop.b} min={0} max={90} step={0.5} onChange={(b) => setCrop({ b: Math.min(b, 95 - crop.t) }, 'b')} format={(v) => `${v}%`} /></Row>
      </Section>}
      {part === 'transform' && <Section title="Transform" right={<Button size="xs" variant="ghost" onClick={() => set((l) => ({ ...l, base: { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 }, rot90: 0, flipH: false, flipV: false }))}>Reset</Button>}>
        <div className="flex flex-wrap gap-1">
          <Button size="xs" variant="secondary" onClick={() => turn(-90)}><HugeiconsIcon icon={RotateLeft01Icon} className="size-3.5" />Rotate left</Button>
          <Button size="xs" variant="secondary" onClick={() => turn(90)}><HugeiconsIcon icon={RotateRight01Icon} className="size-3.5" />Rotate right</Button>
          <Button size="xs" variant={layer.flipH ? 'default' : 'secondary'} onClick={() => set((l) => ({ ...l, flipH: !l.flipH }))}><HugeiconsIcon icon={FlipHorizontalIcon} className="size-3.5" />Flip horizontal</Button>
          <Button size="xs" variant={layer.flipV ? 'default' : 'secondary'} onClick={() => set((l) => ({ ...l, flipV: !l.flipV }))}><HugeiconsIcon icon={FlipHorizontalIcon} className="size-3.5 rotate-90" />Flip vertical</Button>
        </div>
        <Row label="Scale" kf={kf}><Slider value={shown.scale} min={0.2} max={4} step={0.01} onChange={(scale) => setBase({ scale }, 'scale')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
        <Row label="Position X" kf={kf}><Slider value={shown.x} min={-100} max={100} step={0.5} onChange={(x) => setBase({ x }, 'x')} format={(v) => `${v}%`} /></Row>
        <Row label="Position Y" kf={kf}><Slider value={shown.y} min={-100} max={100} step={0.5} onChange={(y) => setBase({ y }, 'y')} format={(v) => `${v}%`} /></Row>
        <Row label="Rotation" kf={kf}><Slider value={shown.rotation} min={-180} max={180} step={1} onChange={(rotation) => setBase({ rotation }, 'rot')} format={(v) => `${v}°`} /></Row>
        <Row label="Blend"><Select value={layer.blend ?? 'normal'} onValueChange={(blend) => set((l) => ({ ...l, blend: blend as OverlayBlend }))}>
          <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{BLENDS.map((b) => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}</SelectContent>
        </Select></Row>
        <Row label="Opacity" kf={kf}><Slider value={shown.opacity} min={0} max={1} step={0.01} onChange={(opacity) => setBase({ opacity }, 'op')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
        {layer.keyframes.length > 0 && <p className="text-xs text-muted-foreground">This clip has keyframes. Change a value at a new playhead position to add one, or click the diamond.</p>}
      </Section>}
    </>
  );
}

/** Video tab: Basic (actions, transform, crop, keyframes) / Remove BG / Blur. */
export function ClipPanel() {
  const { layer, set, clip } = useLayer();
  const time = useEditor((s) => s.time);
  const [tab, setTab] = useState<'basic' | 'bg' | 'blur'>('basic');
  const sorted = [...layer.keyframes].sort((a, b) => a.t - b.t);
  const local = Math.max(0, Math.min(time - (clip?.start ?? 0), clip?.duration ?? 0));
  const nearby = sorted.find((k) => Math.abs(k.t - local) < 0.05);
  return (
    <div>
      <div className="sticky top-0 z-10 border-b bg-sidebar px-3 py-2">
        <Segmented fill size="sm" value={tab} onChange={setTab} options={[{ value: 'basic', label: 'Basic' }, { value: 'bg', label: 'Remove BG' }, { value: 'blur', label: 'Blur' }]} />
      </div>
      {tab === 'bg' && <BackgroundSection />}
      {tab === 'blur' && <BlurSection />}
      {tab === 'basic' && (
        <>
          <ClipActions />
          <TargetBar pick={(l) => ({ crop: l.crop, flipH: l.flipH, flipV: l.flipV, rot90: l.rot90, base: l.base, keyframes: l.keyframes })} label="crop, transform and keyframes" />
          <CropAndTransform part="transform" />
          <CropAndTransform part="crop" />
          <Section title="Keyframes" right={
            <Button size="xs" variant="secondary" disabled={!!nearby || !clip}
              onClick={() => set((l) => ({ ...l, keyframes: [...l.keyframes, newKeyframe(local, transformAt(l.keyframes, local, l.base))] }))}>
              <Plus />{nearby ? 'Keyframe here' : 'Add at playhead'}
            </Button>}>
            {sorted.length === 0 && <p className="text-xs text-muted-foreground">Move the playhead inside the clip, add a keyframe, then add another later and change a value. The video animates between them: zoom, pan, spin, fade.</p>}
            {sorted.map((k) => <KeyframeCard key={k.id} k={k} />)}
          </Section>
        </>
      )}
    </div>
  );
}
