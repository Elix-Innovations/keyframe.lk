import { nanoid } from 'nanoid';
import { useEditor } from '../store';
import { merge } from './style';
import type { AdjClip, Caption, CaptionStyle, Clip, MusicTrack, OverlayItem, Project, VideoLayer, Word } from '../types';
import { currentTime } from './player';
import { freeTrack } from './adj';
import { freeLayerRow } from './layers';
import { freeLayer } from './sounds';
import { freeVideoTrack, videoClips, withPartner } from './clips';
import { migrateVideo } from './videoFx';

/** What Copy took from the timeline: a snapshot, so it can still be pasted after the original is edited or deleted. */
export type Clipboard =
  | { kind: 'overlay'; items: OverlayItem[] }
  | { kind: 'clip'; items: Clip[]; main: string }
  | { kind: 'adj'; items: AdjClip[] }
  | { kind: 'sound'; item: MusicTrack }
  | { kind: 'caption'; look: CaptionLook };

/** The full look of one caption (project style + its own overrides) plus per-word looks (emphasis, colour, size, font, case). */
interface CaptionLook { style: CaptionStyle; words: Pick<Word, 'emphasize' | 'style'>[] }

let held: Clipboard | null = null;
const listeners = new Set<() => void>();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const emit = () => listeners.forEach((l) => l());
export const onClipboardChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const clipboardKind = () => held?.kind ?? null;
export const hasClipboard = () => !!held;

const note = (m: string, kind: 'info' | 'success' | 'error' = 'success') => useEditor.getState().notify(m, kind);

/** What is selected on the timeline, in the order Copy looks: overlays, clips, filter / effect blocks, sound layers. */
function selection(): Clipboard | null {
  const st = useEditor.getState(), p = st.project;
  if (!p) return null;
  const ids = [st.selectedOverlayId, ...st.extraOverlayIds].filter((x): x is string => !!x);
  const ovl = (p.overlays ?? []).filter((o) => ids.includes(o.id));
  if (ovl.length) return { kind: 'overlay', items: clone(ovl) };
  const clip = (p.clips ?? []).find((c) => c.id === st.selectedClipId);
  if (clip) return { kind: 'clip', items: clone(withPartner(p.clips ?? [], clip)), main: clip.id };
  const adj = (p.adj ?? []).find((a) => a.id === st.selectedAdjId);
  if (adj) return { kind: 'adj', items: [clone(adj)] };
  const tr = p.audio.tracks.find((t) => t.id === st.selectedTrackId);
  if (tr) return { kind: 'sound', item: clone(tr) };
  if (st.selectedCaptionId) { const look = captureLook(st.selectedCaptionId); if (look) return { kind: 'caption', look }; }
  return null;
}

export const canCopy = () => !!selection();

/** Copy the selected timeline item(s). */
export function copySelection(): boolean {
  const s = selection();
  if (!s) { note('Select something on the timeline to copy.', 'info'); return false; }
  held = s;
  emit();
  const what = s.kind === 'caption' ? 'caption style' : s.kind === 'overlay' ? `${s.items.length} layer${s.items.length > 1 ? 's' : ''}` : s.kind === 'clip' ? 'clip' : s.kind === 'adj' ? 'filter / effect block' : 'sound layer';
  note(s.kind === 'caption' ? 'Caption style copied. Select another caption → right-click → Paste look only (⇧⌘V).' : `Copied ${what}. Press ⌘V to paste at the playhead.`);
  return true;
}

/** Copy, then delete the original. */
export function cutSelection(): boolean {
  if (!copySelection()) return false;
  const st = useEditor.getState();
  if (held?.kind === 'overlay') { const gone = new Set(held.items.map((o) => o.id)); st.setOverlays((l) => l.filter((o) => !gone.has(o.id))); st.selectOverlay(null); }
  else if (held?.kind === 'clip') { const gone = new Set(held.items.map((c) => c.id)); st.setClips((cs) => cs.filter((c) => !gone.has(c.id))); st.selectClip(null); }
  else if (held?.kind === 'adj') { const id = held.items[0].id; st.setAdj((a) => a.filter((x) => x.id !== id)); st.selectAdj(null); }
  else if (held?.kind === 'caption') { const id = st.selectedCaptionId; if (id) st.setCaptions(st.project!.captions.filter((c) => c.id !== id)); st.select(null); }
  else if (held?.kind === 'sound') { const id = held.item.id; st.update((p) => ({ ...p, audio: { ...p.audio, tracks: p.audio.tracks.filter((t) => t.id !== id) } })); st.selectTrack(null); }
  return true;
}

/** Picture-in-picture pose for a video clip pasted as an overlay: a quarter-size window in the top right. */
const PIP = { scale: 0.45, x: 24, y: -26, rotation: 0, opacity: 1 };

/**
 * Paste at the playhead. `asOverlay` puts a copied video clip on its own overlay track as a small movable window
 * (without its audio); a copied overlay, filter block or sound is placed the usual way.
 */
export function pasteAtPlayhead(asOverlay = false): boolean {
  const st = useEditor.getState(), p = st.project;
  if (!p || !held) { note('Nothing copied yet. Select something and press ⌘C.', 'info'); return false; }
  if (held.kind === 'caption') return pasteAttributes();
  const at = currentTime();
  if (held.kind === 'overlay') {
    const first = Math.min(...held.items.map((o) => o.start));
    const copies: OverlayItem[] = [];
    let proj: Project = p;
    for (const o of held.items) {
      const start = Math.max(0, at + (o.start - first));
      const copy: OverlayItem = { ...clone(o), id: nanoid(8), start, track: freeLayerRow(proj, start, o.duration, o.track) };
      proj = { ...proj, overlays: [...(proj.overlays ?? []), copy] }; copies.push(copy);
    }
    st.setOverlays((l) => [...l, ...copies]);
    st.setOverlaySelection(copies.map((c) => c.id));
    note(`Pasted ${copies.length} layer${copies.length > 1 ? 's' : ''} at ${at.toFixed(1)}s.`);
  } else if (held.kind === 'clip') {
    const mainId = held.main;
    const main = held.items.find((c) => c.id === mainId) ?? held.items[0];
    const group = asOverlay ? held.items.filter((c) => c.kind === 'video') : held.items;
    const link = !asOverlay && main.linkId ? nanoid(6) : undefined;
    const clips = p.clips ?? [];
    const vtrack = freeVideoTrack(clips, at, main.duration, asOverlay ? Math.max(1, main.track ?? 0) : main.track ?? 0, undefined, p.overlays);
    const copies = group.map((g): Clip => {
      const fx = g.kind === 'video' ? migrateVideo(g.fx) : g.fx;
      return {
        ...clone(g), id: nanoid(8), start: Math.max(0, at + (g.start - main.start)), linkId: link, track: g.kind === 'video' ? vtrack : g.track,
        ...(asOverlay && g.kind === 'video' ? { fx: { ...fx!, base: fx!.base && fx!.base.scale < 1 ? fx!.base : { ...PIP } } as VideoLayer } : {}),
      };
    });
    st.setClips((cs) => [...cs, ...copies]);
    const pick = copies.find((c) => c.kind === main.kind) ?? copies[0];
    st.selectClip(pick.id);
    note(asOverlay ? `Pasted the clip as an overlay on video track ${vtrack + 1}. Drag it in the preview to place it.` : `Pasted clip at ${at.toFixed(1)}s${vtrack > 0 ? ` on video track ${vtrack + 1}` : ''}.`);
  } else if (held.kind === 'adj') {
    const a = held.items[0];
    const copy: AdjClip = { ...clone(a), id: nanoid(8), start: at, track: freeTrack(p.adj ?? [], at, a.duration, a.track) };
    st.setAdj((l) => [...l, copy]);
    st.selectAdj(copy.id);
    note(`Pasted ${a.kind} block at ${at.toFixed(1)}s.`);
  } else {
    const t = held.item;
    const copy: MusicTrack = { ...clone(t), id: nanoid(8), start: at, layer: freeLayer(p.audio.tracks, at, t.duration) };
    st.update((q) => ({ ...q, audio: { ...q.audio, tracks: [...q.audio.tracks, copy] } }));
    st.selectTrack(copy.id);
    note(`Pasted sound at ${at.toFixed(1)}s.`);
  }
  return true;
}

/** Fields of an overlay that belong to its look (not to its place on the timeline or its words). */
const OVERLAY_LOOK: (keyof OverlayItem)[] = [
  'fontId', 'color', 'bold', 'italic', 'align', 'strokeWidth', 'strokeColor', 'shadow', 'glow', 'bg', 'letterSpacing', 'corner', 'blend',
  'animIn', 'animOut', 'loop', 'speed', 'scale', 'opacity', 'rotation', 'keyframes', 'tpl', 'flipH',
];

/** Paste what the copied item looks like (style, animation, effects) onto the selected item(s) of the same kind. */
export function pasteAttributes(): boolean {
  const st = useEditor.getState(), p = st.project;
  if (!p || !held) { note('Nothing copied yet. Select something and press ⌘C.', 'info'); return false; }
  if (held.kind === 'overlay') {
    const src = held.items[0];
    const targets = new Set([st.selectedOverlayId, ...st.extraOverlayIds].filter((x): x is string => !!x));
    if (!targets.size) { note('Select the layer(s) to restyle first.', 'info'); return false; }
    const look = Object.fromEntries(OVERLAY_LOOK.filter((k) => src[k] !== undefined).map((k) => [k, clone(src[k])]));
    // Template text keeps its own words: only the look moves.
    st.setOverlays((l) => l.map((o) => (targets.has(o.id) && !(o.kind === 'text') === !(src.kind === 'text') ? { ...o, ...look, ...(o.tpl && src.tpl ? { tpl: clone(src.tpl) } : {}) } : o)));
    note(`Pasted the look onto ${targets.size} layer${targets.size > 1 ? 's' : ''}.`);
    return true;
  }
  if (held.kind === 'clip') {
    const src = held.items.find((c) => c.kind === 'video');
    const sel = (p.clips ?? []).find((c) => c.id === st.selectedClipId);
    if (!src || !sel) { note('Select a video clip to paste the look onto.', 'info'); return false; }
    const target = videoClips(p.clips ?? []).find((c) => c.id === sel.id) ?? videoClips(p.clips ?? []).find((c) => c.linkId && c.linkId === sel.linkId);
    if (!target) { note('Select a video clip to paste the look onto.', 'info'); return false; }
    const { keyframes: _k, ...rest } = migrateVideo(src.fx); // the position keyframes belong to the original clip's movement
    void _k;
    st.setClips((cs) => cs.map((c) => (c.id === target.id ? { ...c, fx: { ...migrateVideo(c.fx), ...clone(rest), keyframes: migrateVideo(c.fx).keyframes } } : c)));
    note('Pasted filters, effects, cut-out, blur and transitions onto the clip.');
    return true;
  }
  if (held.kind === 'adj') {
    const a = held.items[0];
    const id = st.selectedAdjId;
    if (!id) { note('Select a filter / effect block first.', 'info'); return false; }
    st.setAdj((l) => l.map((x) => (x.id === id ? { ...x, kind: a.kind, refId: a.refId, intensity: a.intensity } : x)));
    note('Pasted the filter / effect settings.');
    return true;
  }
  if (held.kind === 'caption') {
    const id = st.selectedCaptionId;
    if (!id) { note('Select the caption to restyle first.', 'info'); return false; }
    return applyLook(held.look, [id]);
  }
  note('Sounds have no look to paste. Use ⌘V to paste the sound.', 'info');
  return false;
}

// ---- Caption styling -------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Only the parts of `a` that differ from `b`, so a pasted caption keeps following the project style for everything else. */
function diff(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(a)) {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    out[k] = isObj(a[k]) && isObj(b[k]) ? diff(a[k] as Record<string, unknown>, b[k] as Record<string, unknown>) : a[k];
  }
  return Object.keys(out).length ? out : undefined;
}

function captureLook(id: string): CaptionLook | null {
  const p = useEditor.getState().project;
  const c = p?.captions.find((x) => x.id === id);
  if (!p || !c) return null;
  return clone({ style: merge(p.style, c.styleOverride), words: c.words.map((w) => ({ emphasize: w.emphasize, style: w.style })) });
}

/** Apply a copied look to the given captions. Word looks carry over by position, only where the word counts match. */
function applyLook(look: CaptionLook, ids: string[]): boolean {
  const st = useEditor.getState();
  if (!st.project) return false;
  const want = new Set(ids);
  const override = diff(clone(look.style) as unknown as Record<string, unknown>, st.project.style as unknown as Record<string, unknown>);
  st.setCaptions(st.project.captions.map((c) => {
    if (!want.has(c.id)) return c;
    const next: Caption = { ...c, styleOverride: override ? (clone(override) as Caption['styleOverride']) : undefined };
    if (look.words.length === c.words.length) {
      next.words = c.words.map((w, i) => {
        const { emphasize, style } = look.words[i];
        const out = { ...w, emphasize, style: style ? clone(style) : undefined };
        if (emphasize === undefined) delete out.emphasize;
        if (!style) delete out.style;
        return out;
      });
    }
    return next;
  }));
  note(ids.length > 1 ? `Style pasted to ${ids.length} captions.` : 'Style pasted.');
  return true;
}

/** Copy a caption's look; shares the timeline clipboard, so ⌘C on a selected caption does the same. */
export function copyCaptionStyle(id: string): boolean {
  const look = captureLook(id);
  if (!look) return false;
  held = { kind: 'caption', look };
  emit();
  note('Caption style copied. Select another caption → right-click → Paste look only (⇧⌘V).');
  return true;
}

export function pasteCaptionStyle(ids: string[]): boolean {
  if (held?.kind !== 'caption') { note('Copy a caption style first: right-click a caption → Copy style.', 'info'); return false; }
  return applyLook(held.look, ids);
}
