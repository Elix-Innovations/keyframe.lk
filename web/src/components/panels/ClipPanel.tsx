import { Copy, Plus, Scissors, Trash2 } from '@/components/icons';
import { Volume, VolumeOff } from '@/components/icons-audio';
import type { Ease, VideoKeyframe } from '@/types';
import { useEditor } from '@/store';
import { clipOps, SPEEDS } from '../ClipLane';
import { partnerOf } from '@/lib/clips';
import { Empty } from '../controls';
import { NoiseRemoval } from './NoiseRemoval';
import { seek } from '@/lib/player';
import { formatClock } from '@/lib/srt';
import { EASES, newKeyframe, transformAt } from '@/lib/videoFx';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Row, Section, Segmented, Slider } from '../controls';
import { useState } from 'react';
import { TargetBar, useLayer } from './EffectsPanel';
import { BackgroundSection, BlurSection } from './MattePanel';
import { cropForAspect, hasCrop } from '@/lib/videoFx';
import { FlipHorizontalIcon, RotateLeft01Icon, RotateRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

function KeyframeCard({ k }: { k: VideoKeyframe }) {
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

/** The selected clip: link state, speed, volume and fades. */
function SelectedClip() {
  const clip = useEditor((s) => s.project!.clips?.find((c) => c.id === s.selectedClipId) ?? null);
  const partner = useEditor((s) => { const c = s.project!.clips?.find((x) => x.id === s.selectedClipId); return c ? partnerOf(s.project!.clips ?? [], c) : null; });
  const setClips = useEditor((s) => s.setClips);
  if (!clip) return <Section title="Clip"><Empty icon={<Scissors />} title="No clip selected">Click a clip on the timeline to change its speed, volume, or to unlink its video and audio.</Empty></Section>;
  const patch = (p: Partial<typeof clip>, key?: string) => setClips((cs) => cs.map((c) => (c.id === clip.id || (c.id === partner?.id && ('speed' in p)) ? { ...c, ...p } : c)), key && `clipinsp-${key}-${clip.id}`);
  const audio = clip.kind === 'audio';
  return (
    <Section title={audio ? 'Audio clip' : 'Video clip'} right={<span className="max-w-32 truncate text-[11px] text-muted-foreground">{clip.name}</span>}>
      <Row label="Link" hint="A linked video and audio clip move, trim, split and change speed together.">
        {clip.linkId
          ? <Button size="xs" variant="secondary" onClick={() => clipOps.unlink(clip.id)}>Unlink {partner ? (audio ? 'from video' : 'from audio') : ''}</Button>
          : <Button size="xs" variant="secondary" onClick={() => clipOps.link(clip.id)}>Link with {audio ? 'video' : 'audio'}</Button>}
      </Row>
      {!clip.freeze && (
        <>
          <Row label="Speed"><Slider value={clip.speed} min={0.1} max={8} step={0.05} onChange={(s) => clipOps.speed(clip.id, s)} format={(v) => `${v.toFixed(2)}×`} /></Row>
          <div className="flex flex-wrap justify-end gap-1">
            {SPEEDS.map((s) => <Button key={s} size="xs" variant={clip.speed === s ? 'default' : 'secondary'} onClick={() => clipOps.speed(clip.id, s)}>{s}×</Button>)}
          </div>
        </>
      )}
      {audio && (
        <>
          <Row label="Volume"><Slider value={clip.volume} min={-30} max={12} step={0.5} onChange={(volume) => patch({ volume }, 'vol')} format={(v) => `${v > 0 ? '+' : ''}${v} dB`} /></Row>
          <Row label="Fade in"><Slider value={clip.fadeIn} min={0} max={Math.min(5, clip.duration / 2)} step={0.05} onChange={(fadeIn) => patch({ fadeIn }, 'fi')} format={(v) => `${v.toFixed(2)}s`} /></Row>
          <Row label="Fade out"><Slider value={clip.fadeOut} min={0} max={Math.min(5, clip.duration / 2)} step={0.05} onChange={(fadeOut) => patch({ fadeOut }, 'fo')} format={(v) => `${v.toFixed(2)}s`} /></Row>
          <Row label="Mute"><Button size="xs" variant={clip.muted ? 'default' : 'secondary'} onClick={() => clipOps.mute(clip.id)}>{clip.muted ? <VolumeOff /> : <Volume />}{clip.muted ? 'Muted' : 'Mute'}</Button></Row>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-1.5 pt-1">
        <Button size="xs" variant="secondary" onClick={() => clipOps.splitAtPlayhead([clip.id])}><Scissors />Split</Button>
        <Button size="xs" variant="secondary" onClick={() => clipOps.duplicate(clip.id)}><Copy />Duplicate</Button>
        {!audio && !clip.freeze && <Button size="xs" variant="secondary" onClick={() => clipOps.freeze(clip.id)}>Freeze frame</Button>}
        <Button size="xs" variant="ghost" className="hover:text-destructive" onClick={() => clipOps.remove(clip.id)}><Trash2 />Delete</Button>
      </div>
    </Section>
  );
}

const ASPECTS: [string, number, number][] = [['1:1', 1, 1], ['9:16', 9, 16], ['16:9', 16, 9], ['4:5', 4, 5], ['3:4', 3, 4], ['4:3', 4, 3]];

/** Crop, flip, rotate and the static position/scale of the video clip. */
function CropAndTransform({ part }: { part: 'crop' | 'transform' }) {
  const { layer, set, clip } = useLayer();
  const crop = layer.crop!;
  const base = layer.base!;
  const setCrop = (p: Partial<typeof crop>, key: string) => set((l) => ({ ...l, crop: { ...l.crop!, ...p } }), `crop-${key}`);
  const setBase = (p: Partial<typeof base>, key: string) => set((l) => ({ ...l, base: { ...l.base!, ...p } }), `base-${key}`);
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
        <Row label="Scale"><Slider value={base.scale} min={0.2} max={4} step={0.01} onChange={(scale) => setBase({ scale }, 'scale')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
        <Row label="Position X"><Slider value={base.x} min={-100} max={100} step={0.5} onChange={(x) => setBase({ x }, 'x')} format={(v) => `${v}%`} /></Row>
        <Row label="Position Y"><Slider value={base.y} min={-100} max={100} step={0.5} onChange={(y) => setBase({ y }, 'y')} format={(v) => `${v}%`} /></Row>
        <Row label="Rotation"><Slider value={base.rotation} min={-180} max={180} step={1} onChange={(rotation) => setBase({ rotation }, 'rot')} format={(v) => `${v}°`} /></Row>
        <Row label="Opacity"><Slider value={base.opacity} min={0} max={1} step={0.01} onChange={(opacity) => setBase({ opacity }, 'op')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
        {layer.keyframes.length > 0 && <p className="text-xs text-muted-foreground">This clip has keyframes, which take over position, scale, rotation and opacity while they animate.</p>}
      </Section>}
    </>
  );
}

/** Inspector for the selected clip, then crop and transform, then transform keyframes (times are relative to the clip start). */
export function ClipPanel() {
  const { layer, set, clip } = useLayer();
  const selected = useEditor((s) => s.project!.clips?.find((c) => c.id === s.selectedClipId) ?? null);
  const time = useEditor((s) => s.time);
  const [tab, setTab] = useState<'clip' | 'bg' | 'blur' | 'crop' | 'transform' | 'keys'>('clip');
  if (selected?.kind === 'audio') return <div><SelectedClip />{selected.fromVideo && <NoiseRemoval />}</div>;
  const sorted = [...layer.keyframes].sort((a, b) => a.t - b.t);
  const local = Math.max(0, Math.min(time - (clip?.start ?? 0), clip?.duration ?? 0));
  const nearby = sorted.find((k) => Math.abs(k.t - local) < 0.05);
  return (
    <div>
      <div className="sticky top-0 z-10 border-b bg-sidebar px-3 py-2">
        <Segmented fill size="sm" value={tab} onChange={setTab} options={[{ value: 'clip', label: 'Clip' }, { value: 'bg', label: 'Cut-out' }, { value: 'blur', label: 'Blur' }, { value: 'crop', label: 'Crop' }, { value: 'transform', label: 'Transform' }, { value: 'keys', label: `Keyframes${sorted.length ? ` ${sorted.length}` : ''}` }]} />
      </div>
      {tab === 'clip' && <SelectedClip />}
      {tab === 'bg' && <BackgroundSection />}
      {tab === 'blur' && <BlurSection />}
      {(tab === 'crop' || tab === 'transform' || tab === 'keys') && <TargetBar pick={(l) => ({ crop: l.crop, flipH: l.flipH, flipV: l.flipV, rot90: l.rot90, base: l.base, keyframes: l.keyframes })} label="crop, transform and keyframes" />}
      {(tab === 'crop' || tab === 'transform') && <CropAndTransform part={tab} />}
      {tab === 'keys' && (
        <Section title="Keyframes" right={
          <Button size="xs" variant="secondary" disabled={!!nearby || !clip}
            onClick={() => set((l) => ({ ...l, keyframes: [...l.keyframes, newKeyframe(local, transformAt(l.keyframes, local, l.base))] }))}>
            <Plus />{nearby ? 'Keyframe here' : 'Add at playhead'}
          </Button>}>
          {sorted.length === 0 && <p className="text-xs text-muted-foreground">Move the playhead inside the clip, add a keyframe, then add another later and change a value. The video animates between them: zoom, pan, spin, fade.</p>}
          {sorted.map((k) => <KeyframeCard key={k.id} k={k} />)}
        </Section>
      )}
    </div>
  );
}
