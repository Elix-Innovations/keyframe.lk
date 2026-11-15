import { useLibQuery, matches } from '@/lib/libQuery';
import { useMemo, useState, type ReactNode } from 'react';
import type { Clip, VideoLayer } from '@/types';
import { useEditor } from '@/store';
import { EFFECT_GROUPS, EFFECTS, TRENDING_EFFECTS } from '@/render/effects';
import { migrateVideo } from '@/lib/videoFx';
import { videoClipAt, videoClips, partnerOf } from '@/lib/clips';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FxPreview, usePreviewSourceSync } from '../FxPreview';
import { DRAG_MIME, type DragPayload } from '@/lib/timelineGeo';
import { Section } from '../controls';

/**
 * The video clip the Filters, Effects, Transitions and Clip panels edit: the selected clip (or its linked video),
 * otherwise the clip under the playhead, otherwise the first. Edits go to that clip only.
 */
export function useLayer() {
  const clips = useEditor((s) => s.project!.clips);
  const selId = useEditor((s) => s.selectedClipId);
  const time = useEditor((s) => s.time);
  const fallback = useEditor((s) => s.project!.video);
  const setClips = useEditor((s) => s.setClips);
  const clip = useMemo<Clip | null>(() => {
    const cs = clips ?? [];
    const sel = cs.find((c) => c.id === selId);
    if (sel) { const v = sel.kind === 'video' ? sel : partnerOf(cs, sel); if (v?.kind === 'video') return v; }
    return videoClipAt(cs, time) ?? videoClips(cs)[0] ?? null;
  }, [clips, selId, time]);
  const layer = useMemo(() => migrateVideo(clip?.fx ?? fallback), [clip?.fx, fallback]);
  const id = clip?.id;
  const set = (fn: (v: VideoLayer) => VideoLayer, key?: string) => {
    if (!id) return;
    setClips((cs) => cs.map((c) => (c.id === id ? { ...c, fx: fn(migrateVideo(c.fx)) } : c)), key);
  };
  /** Copy part of this clip's look to every video clip. */
  const applyToAll = (pick: (l: VideoLayer) => Partial<VideoLayer>) => {
    if (!clip) return;
    const part = pick(layer);
    setClips((cs) => cs.map((c) => (c.kind === 'video' ? { ...c, fx: { ...migrateVideo(c.fx), ...structuredClone(part) } } : c)));
  };
  return { layer, set, clip, applyToAll, clipCount: videoClips(clips ?? []).length };
}

/** Says which clip the panel edits and offers to copy the look to all clips. */
export function TargetBar({ pick, label }: { pick: (l: VideoLayer) => Partial<VideoLayer>; label: string }) {
  const { clip, applyToAll, clipCount } = useLayer();
  const notify = useEditor((s) => s.notify);
  if (!clip) return <div className="border-b px-3 py-2.5 text-xs text-muted-foreground">Add a video to use {label}.</div>;
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Editing <b className="font-medium text-foreground">{clip.name}</b></span>
      {clipCount > 1 && <Button size="xs" variant="secondary" onClick={() => { applyToAll(pick); notify(`Applied ${label} to all ${clipCount} clips.`, 'success'); }}>Apply to all</Button>}
    </div>
  );
}

/** Tile with a live preview; the preview animates while hovered. */
export function PreviewTile({ spec, label, on, drag, onClick, children }: { spec: Parameters<typeof FxPreview>[0]['spec']; label: string; on?: boolean; drag?: DragPayload; onClick?: () => void; children?: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <div draggable={!!drag} onClick={onClick}
      onDragStart={(e) => { if (!drag) return; e.dataTransfer.setData(DRAG_MIME, JSON.stringify(drag)); e.dataTransfer.effectAllowed = 'copy'; }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className={cn('group select-none overflow-hidden rounded-xl border text-left transition-colors', onClick ? 'cursor-pointer' : drag && 'cursor-grab active:cursor-grabbing', on ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50')}>
      <div className="relative">
        <FxPreview spec={spec} hover={hover} />
        {children}
      </div>
      <div className="truncate px-1.5 py-1 text-[11px]">{label}</div>
    </div>
  );
}

/**
 * Effects library: motion, glitch, light, texture and frame effects, previewed on your footage.
 * Drag a tile onto a track on the timeline; nothing is added by clicking.
 */
export function EffectsPanel() {
  usePreviewSourceSync();
  const q = useLibQuery((s) => s.q).trim();
  const adj = useEditor((s) => s.project!.adj);
  const used = new Set((adj ?? []).filter((a) => a.kind === 'effect').map((a) => a.refId));
  if (q) {
    const hits = EFFECTS.filter((e) => e.id !== 'none' && matches(e.label, q));
    return (
      <Section title="Results" right={<span className="text-[11px] text-muted-foreground">{hits.length}</span>}>
        {hits.length === 0 && <p className="text-xs text-muted-foreground">No effect matches “{q}”.</p>}
        <div className="grid grid-cols-4 gap-1.5">
          {hits.map((e) => <PreviewTile key={e.id} spec={{ effects: [{ id: 'p', effectId: e.id, intensity: 0.7 }] }} label={e.label} on={used.has(e.id)} drag={{ type: 'fx', kind: 'effect', refId: e.id }} onClick={() => pickEffect(e.id)} />)}
        </div>
      </Section>
    );
  }
  return (
    <div>
      <div className="border-b px-3 py-2.5 text-xs text-muted-foreground">Drag an effect onto a track on the timeline (or onto a clip to cover it). Select an effect layer and click another to replace it.</div>
      <Section title="Trending" right={<span className="text-[11px] text-muted-foreground">{TRENDING_EFFECTS.length}</span>}>
        <div className="grid grid-cols-4 gap-1.5">
          {EFFECTS.filter((e) => TRENDING_EFFECTS.includes(e.id)).map((e) => (
            <PreviewTile key={e.id} spec={{ effects: [{ id: 'p', effectId: e.id, intensity: 0.7 }] }} label={e.label} on={used.has(e.id)}
              drag={{ type: 'fx', kind: 'effect', refId: e.id }} onClick={() => pickEffect(e.id)} />
          ))}
        </div>
      </Section>
      {EFFECT_GROUPS.map((g) => (
        <Section key={g} title={g} collapsible right={<span className="text-[11px] text-muted-foreground">{EFFECTS.filter((e) => e.group === g).length}</span>}>
          <div className="grid grid-cols-4 gap-1.5">
            {EFFECTS.filter((e) => e.group === g).map((e) => (
              <PreviewTile key={e.id} spec={{ effects: [{ id: 'p', effectId: e.id, intensity: 0.7 }] }} label={e.label} on={used.has(e.id)}
                drag={{ type: 'fx', kind: 'effect', refId: e.id }} onClick={() => pickEffect(e.id)} />
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

/** Click swaps the effect of the selected effect layer; with none selected it does nothing (drag to add). */
function pickEffect(refId: string) {
  const st = useEditor.getState();
  const sel = (st.project?.adj ?? []).find((a) => a.id === st.selectedAdjId && a.kind === 'effect');
  if (!sel || sel.refId === refId) return;
  st.setAdj((l) => l.map((a) => (a.id === sel.id ? { ...a, refId } : a)));
}
