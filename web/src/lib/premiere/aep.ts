/**
 * Reader for the text-animator data inside an After Effects project (.aep, a big-endian RIFX file), which is what a
 * .mogrt made in After Effects carries as project.aegraphic -> "*.aep". It does not rebuild the whole project: it walks
 * the property tree of each text layer and returns its Text Animators (range-selector offset keyframes plus the
 * Position / Opacity / Scale / Blur / Rotation the animator applies), which is where text presets keep their motion.
 */

import type { Track } from './xmlKeyframes';

/** Keyframe times are stored in 1/30720 s. */
const TICKS = 30720;

interface Node { name: string; children: Node[]; vals: number[] | null; keys: { t: number; raw: Uint8Array }[] | null }

export interface AepAnimator {
  /** Selector offset keyframes (% of the text): t in seconds. */
  offset: { t: number; v: number }[] | null;
  start: number; end: number;
  /** Values the animator applies to the characters it selects. Absent = leaves that property alone. */
  position?: [number, number];
  positionKeys?: { t: number; x: number; y: number }[];
  opacity?: number; scale?: number; blur?: number; rotation?: number;
}

export interface AepText {
  animators: AepAnimator[]; start: number;
  /** Keyframed layer transforms (Position, Scale, Rotation, Opacity) of this layer, for whole-text moves. */
  tracks: Track[];
}

export interface AepFile {
  texts: AepText[];
  /** A keyframed slider that runs 0 to 100 (the "Animation" amount of an expression-driven typewriter), if any. */
  slider: { t0: number; t1: number } | null;
  /** The project has a text expression that slices the source text, i.e. a typewriter reveal. */
  typewriter: boolean;
}

export function parseAep(buf: Uint8Array): AepFile {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength < 12 || v.getUint32(0) !== 0x52494658) throw new Error('Not an After Effects project.'); // RIFX
  const tag = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  function* chunks(off: number, end: number) {
    while (off + 8 <= end) {
      const size = v.getUint32(off + 4);
      yield { type: tag(off), body: off + 8, size };
      off += 8 + size + (size & 1);
    }
  }
  const cstr = (o: number, n: number) => { let s = ''; for (let i = 0; i < n && buf[o + i]; i++) s += String.fromCharCode(buf[o + i]); return s; };

  /** A property (LIST tdbs): static values and keyframes. */
  function readProp(body: number, size: number, name: string): Node {
    const n: Node = { name, children: [], vals: null, keys: null };
    for (const c of chunks(body + 4, body + size)) {
      if (c.type === 'cdat') { n.vals = []; for (let i = 0; i + 8 <= c.size; i += 8) n.vals.push(v.getFloat64(c.body + i)); }
      if (c.type === 'LIST' && tag(c.body) === 'list') {
        let isz = 0, count = 0, data: { body: number; size: number } | null = null;
        for (const d of chunks(c.body + 4, c.body + c.size)) {
          if (d.type === 'lhd3') { count = v.getUint32(d.body + 8); isz = v.getUint32(d.body + 16); }
          if (d.type === 'ldat') data = d;
        }
        if (data && isz > 0 && count > 0) {
          n.keys = [];
          for (let k = 0; k < Math.min(count, data.size / isz); k++) {
            const o = data.body + k * isz;
            n.keys.push({ t: v.getUint32(o) / TICKS, raw: buf.subarray(o, o + isz) });
          }
        }
      }
    }
    return n;
  }

  /** A property group (LIST tdgp): every tdmn names the group or property that follows it. */
  function readGroup(body: number, size: number, name: string, depth: number): Node {
    const n: Node = { name, children: [], vals: null, keys: null };
    let pending = '';
    for (const c of chunks(body + 4, body + size)) {
      if (c.type === 'tdmn') pending = cstr(c.body, c.size);
      else if (c.type === 'LIST') {
        const sub = tag(c.body);
        if (sub === 'tdgp' && depth < 16) n.children.push(readGroup(c.body, c.size, pending, depth + 1));
        else if (sub === 'tdbs') n.children.push(readProp(c.body, c.size, pending));
        else if (sub === 'otst') for (const d of chunks(c.body + 4, c.body + c.size)) if (d.type === 'LIST' && tag(d.body) === 'tdbs') n.children.push(readProp(d.body, d.size, pending));
      }
    }
    return n;
  }

  const texts: AepText[] = [];
  const sliders: { t0: number; t1: number }[] = [];
  const findLayers = (off: number, end: number) => {
    for (const c of chunks(off, end)) {
      if (c.type !== 'LIST') continue;
      if (tag(c.body) === 'Layr') {
        let start = 0;
        for (const d of chunks(c.body + 4, c.body + c.size)) {
          if (d.type === 'ldta') start = v.getInt32(d.body + 4) / TICKS || 0;
          if (d.type === 'LIST' && tag(d.body) === 'tdgp') {
            const root = readGroup(d.body, d.size, '', 0);
            collectSliders(root);
            const found = animatorsOf(root), tracks = transformOf(root);
            if (found.length || tracks.length) texts.push({ animators: found, start, tracks });
          }
        }
      } else findLayers(c.body + 4, c.body + c.size);
    }
  };
  findLayers(12, buf.byteLength);
  const raw = new TextDecoder('latin1').decode(buf);
  return { texts, slider: sliders[0] ?? null, typewriter: raw.includes('sourceText') && raw.includes('.slice(') };

  function collectSliders(n: Node) {
    if (/^ADBE Slider Control-0001$/.test(n.name) && n.keys && n.keys.length > 1) {
      const vals = n.keys.map((k) => new DataView(k.raw.buffer, k.raw.byteOffset, k.raw.byteLength).getFloat64(8));
      if (Math.min(...vals) <= 1 && Math.max(...vals) >= 99) sliders.push({ t0: n.keys[0].t, t1: n.keys[n.keys.length - 1].t });
    }
    n.children.forEach(collectSliders);
  }

  /** Keyframed Position / Scale / Rotation / Opacity of the layer itself (not of a text animator). */
  function transformOf(root: Node): Track[] {
    const tg = find(root, 'ADBE Transform Group');
    if (!tg) return [];
    const out: Track[] = [];
    for (const [name, kind] of [['ADBE Position', 'position'], ['ADBE Scale', 'scale'], ['ADBE Rotate Z', 'rotation'], ['ADBE Opacity', 'opacity']] as const) {
      const p = tg.children.find((c) => c.name === name);
      if (!p?.keys || p.keys.length < 2) continue;
      out.push({ kind, keys: p.keys.map((k) => {
        const dv = new DataView(k.raw.buffer, k.raw.byteOffset, k.raw.byteLength);
        const v = kind === 'position' ? [dv.getFloat64(16), dv.getFloat64(24)] : kind === 'scale' ? [dv.getFloat64(8) * 100] : [dv.getFloat64(8)];
        return { t: k.t, v };
      }) });
    }
    return out;
  }

  function find(n: Node, name: string): Node | undefined {
    if (n.name === name) return n;
    for (const c of n.children) { const r = find(c, name); if (r) return r; }
    return undefined;
  }

  function animatorsOf(root: Node): AepAnimator[] {
    const list = find(root, 'ADBE Text Animators');
    if (!list) return [];
    return list.children.filter((a) => a.name === 'ADBE Text Animator').map((a): AepAnimator => {
      const sel = find(a, 'ADBE Text Selector'), props = find(a, 'ADBE Text Animator Properties');
      const get = (parent: Node | undefined, name: string) => parent?.children.find((c) => c.name === name);
      const off = get(sel, 'ADBE Text Percent Offset');
      const first = (p: Node | undefined) => p?.vals?.[0];
      const out: AepAnimator = {
        offset: off?.keys && off.keys.length > 1 ? off.keys.map((k) => ({ t: k.t, v: new DataView(k.raw.buffer, k.raw.byteOffset, k.raw.byteLength).getFloat64(8) })) : null,
        start: first(get(sel, 'ADBE Text Percent Start')) ?? 0,
        end: first(get(sel, 'ADBE Text Percent End')) ?? 100,
      };
      const pos = get(props, 'ADBE Text Position 3D');
      if (pos?.keys && pos.keys.length > 1) out.positionKeys = pos.keys.map((k) => { const dv = new DataView(k.raw.buffer, k.raw.byteOffset, k.raw.byteLength); return { t: k.t, x: dv.getFloat64(16), y: dv.getFloat64(24) }; });
      else if (pos?.vals) out.position = [pos.vals[0], pos.vals[1] ?? 0];
      const num = (n: string) => first(get(props, n));
      out.opacity = num('ADBE Text Opacity');
      out.scale = num('ADBE Text Scale 3D');
      out.blur = num('ADBE Text Blur');
      out.rotation = num('ADBE Text Rotation');
      return out;
    });
  }
}
