import * as db from './db';
import type { FontDef } from '../types';

/**
 * Built-in font catalog. Google fonts are loaded on demand via the CSS2 API.
 * Legacy FM/Tharu fonts are proprietary, so users import them (Fonts tab → Import)
 * and flag them as legacy; text is then converted Unicode→FM before drawing.
 */
export const BUILTIN_FONTS: FontDef[] = [
  // Sinhala (Unicode)
  { id: 'noto-sans-sinhala', label: 'Noto Sans Sinhala', family: 'Noto Sans Sinhala', script: 'sinhala', source: 'google', weights: [400, 700, 900] },
  { id: 'noto-sans-sinhala-black', label: 'Noto Sans Sinhala Black', family: 'Noto Sans Sinhala', script: 'sinhala', source: 'google', weights: [900], boldWeight: 900 },
  { id: 'noto-sans-sinhala-extrabold', label: 'Noto Sans Sinhala ExtraBold', family: 'Noto Sans Sinhala', script: 'sinhala', source: 'google', weights: [800], boldWeight: 800 },
  { id: 'noto-serif-sinhala', label: 'Noto Serif Sinhala', family: 'Noto Serif Sinhala', script: 'sinhala', source: 'google', weights: [400, 700, 900] },
  { id: 'noto-serif-sinhala-black', label: 'Noto Serif Sinhala Black', family: 'Noto Serif Sinhala', script: 'sinhala', source: 'google', weights: [900], boldWeight: 900 },
  { id: 'abhaya-libre', label: 'Abhaya Libre', family: 'Abhaya Libre', script: 'sinhala', source: 'google', weights: [400, 700, 800], boldWeight: 800 },
  { id: 'yaldevi', label: 'Yaldevi', family: 'Yaldevi', script: 'sinhala', source: 'google', weights: [400, 700] },
  { id: 'gemunu-libre', label: 'Gemunu Libre', family: 'Gemunu Libre', script: 'sinhala', source: 'google', weights: [400, 700, 800], boldWeight: 800 },
  { id: 'stick-no-bills', label: 'Stick No Bills', family: 'Stick No Bills', script: 'sinhala', source: 'google', weights: [400, 700, 800], boldWeight: 800 },
  { id: 'maname', label: 'Maname', family: 'Maname', script: 'sinhala', source: 'google', weights: [400] },
  { id: 'noto-sans-sinhala-light', label: 'Noto Sans Sinhala Light', family: 'Noto Sans Sinhala', script: 'sinhala', source: 'google', weights: [300], boldWeight: 300 },
  { id: 'noto-sans-sinhala-medium', label: 'Noto Sans Sinhala Medium', family: 'Noto Sans Sinhala', script: 'sinhala', source: 'google', weights: [500], boldWeight: 500 },
  { id: 'noto-sans-sinhala-semibold', label: 'Noto Sans Sinhala SemiBold', family: 'Noto Sans Sinhala', script: 'sinhala', source: 'google', weights: [600], boldWeight: 600 },
  { id: 'abhaya-libre-medium', label: 'Abhaya Libre Medium', family: 'Abhaya Libre', script: 'sinhala', source: 'google', weights: [500], boldWeight: 500 },
  { id: 'abhaya-libre-semibold', label: 'Abhaya Libre SemiBold', family: 'Abhaya Libre', script: 'sinhala', source: 'google', weights: [600], boldWeight: 600 },
  { id: 'yaldevi-light', label: 'Yaldevi Light', family: 'Yaldevi', script: 'sinhala', source: 'google', weights: [300], boldWeight: 300 },
  { id: 'yaldevi-medium', label: 'Yaldevi Medium', family: 'Yaldevi', script: 'sinhala', source: 'google', weights: [500], boldWeight: 500 },
  { id: 'yaldevi-semibold', label: 'Yaldevi SemiBold', family: 'Yaldevi', script: 'sinhala', source: 'google', weights: [600], boldWeight: 600 },
  { id: 'gemunu-libre-light', label: 'Gemunu Libre Light', family: 'Gemunu Libre', script: 'sinhala', source: 'google', weights: [300], boldWeight: 300 },
  { id: 'gemunu-libre-medium', label: 'Gemunu Libre Medium', family: 'Gemunu Libre', script: 'sinhala', source: 'google', weights: [500], boldWeight: 500 },
  { id: 'gemunu-libre-semibold', label: 'Gemunu Libre SemiBold', family: 'Gemunu Libre', script: 'sinhala', source: 'google', weights: [600], boldWeight: 600 },
  { id: 'stick-no-bills-medium', label: 'Stick No Bills Medium', family: 'Stick No Bills', script: 'sinhala', source: 'google', weights: [500], boldWeight: 500 },
  { id: 'stick-no-bills-semibold', label: 'Stick No Bills SemiBold', family: 'Stick No Bills', script: 'sinhala', source: 'google', weights: [600], boldWeight: 600 },
  { id: 'sinhala-mn', label: 'Sinhala MN (system)', family: 'Sinhala MN, Sinhala Sangam MN, Iskoola Pota, Nirmala UI', script: 'sinhala', source: 'system' },
  // English / Latin
  // Latin partners chosen to match the Sinhala fonts above (see lib/style.ts templates).
  { id: 'noto-sans', label: 'Noto Sans', family: 'Noto Sans', script: 'english', source: 'google', weights: [400, 700, 900] },
  { id: 'noto-serif', label: 'Noto Serif', family: 'Noto Serif', script: 'english', source: 'google', weights: [400, 700, 900] },
  { id: 'barlow-condensed', label: 'Barlow Condensed', family: 'Barlow Condensed', script: 'english', source: 'google', weights: [400, 800], boldWeight: 800 },
  { id: 'lexend', label: 'Lexend', family: 'Lexend', script: 'english', source: 'google', weights: [400, 700] },
  { id: 'rubik', label: 'Rubik', family: 'Rubik', script: 'english', source: 'google', weights: [400, 800], boldWeight: 800 },
  { id: 'dm-serif-display', label: 'DM Serif Display', family: 'DM Serif Display', script: 'english', source: 'google', weights: [400] },
  { id: 'abhaya-libre-latin', label: 'Abhaya Libre (Latin)', family: 'Abhaya Libre', script: 'english', source: 'google', weights: [400, 800], boldWeight: 800 },
  { id: 'stick-no-bills-latin', label: 'Stick No Bills (Latin)', family: 'Stick No Bills', script: 'english', source: 'google', weights: [400, 800], boldWeight: 800 },
  { id: 'nunito', label: 'Nunito (rounded)', family: 'Nunito', script: 'english', source: 'google', weights: [400, 800], boldWeight: 800 },
  { id: 'inter', label: 'Inter', family: 'Inter', script: 'english', source: 'google', weights: [400, 700, 900] },
  { id: 'poppins', label: 'Poppins', family: 'Poppins', script: 'english', source: 'google', weights: [400, 700, 900] },
  { id: 'montserrat', label: 'Montserrat', family: 'Montserrat', script: 'english', source: 'google', weights: [400, 700, 900] },
  { id: 'bebas-neue', label: 'Bebas Neue', family: 'Bebas Neue', script: 'english', source: 'google', weights: [400] },
  { id: 'anton', label: 'Anton', family: 'Anton', script: 'english', source: 'google', weights: [400] },
  { id: 'oswald', label: 'Oswald', family: 'Oswald', script: 'english', source: 'google', weights: [400, 700] },
  { id: 'archivo-black', label: 'Archivo Black', family: 'Archivo Black', script: 'english', source: 'google', weights: [400] },
  { id: 'bangers', label: 'Bangers', family: 'Bangers', script: 'english', source: 'google', weights: [400] },
  { id: 'luckiest-guy', label: 'Luckiest Guy', family: 'Luckiest Guy', script: 'english', source: 'google', weights: [400] },
  { id: 'lato', label: 'Lato', family: 'Lato', script: 'english', source: 'google', weights: [400, 700, 900] },
  { id: 'merriweather', label: 'Merriweather', family: 'Merriweather', script: 'english', source: 'google', weights: [400, 700, 900] },
  { id: 'playfair', label: 'Playfair Display', family: 'Playfair Display', script: 'english', source: 'google', weights: [400, 700, 900] },
  { id: 'permanent-marker', label: 'Permanent Marker', family: 'Permanent Marker', script: 'english', source: 'google', weights: [400] },
  { id: 'pacifico', label: 'Pacifico', family: 'Pacifico', script: 'english', source: 'google', weights: [400] },
  { id: 'great-vibes', label: 'Great Vibes', family: 'Great Vibes', script: 'english', source: 'google', weights: [400] },
  { id: 'lobster', label: 'Lobster', family: 'Lobster', script: 'english', source: 'google', weights: [400] },
  { id: 'cinzel-decorative', label: 'Cinzel Decorative', family: 'Cinzel Decorative', script: 'english', source: 'google', weights: [400, 700, 900] },
  { id: 'system-sans', label: 'System Sans', family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', script: 'both', source: 'system' },
  { id: 'system-serif', label: 'System Serif', family: 'Georgia, Times New Roman, serif', script: 'both', source: 'system' },
  { id: 'system-mono', label: 'System Mono', family: 'ui-monospace, Menlo, Consolas, monospace', script: 'both', source: 'system' },
];

const customFonts = new Map<string, FontDef>();
const bundledFonts = new Map<string, FontDef>();

/** Does the font file map Sinhala letters (අ, ක)? Reads only the sfnt directory + cmap table, not the whole font. */
export async function fontFileHasSinhala(blob: Blob): Promise<boolean> {
  let base = 0;
  let head = new DataView(await blob.slice(0, 16).arrayBuffer());
  if (head.byteLength < 16) return false;
  if (head.getUint32(0) === 0x74746366) { // 'ttcf' collection: inspect its first font
    base = head.getUint32(12);
    head = new DataView(await blob.slice(base, base + 12).arrayBuffer());
  }
  const n = head.getUint16(4);
  const dir = new DataView(await blob.slice(base + 12, base + 12 + 16 * n).arrayBuffer());
  let off = 0, len = 0;
  for (let i = 0; i < n; i++) if (dir.getUint32(i * 16) === 0x636d6170) { off = dir.getUint32(i * 16 + 8); len = dir.getUint32(i * 16 + 12); }
  if (!off) return false;
  const cm = new DataView(await blob.slice(off, off + len).arrayBuffer());
  const has = (sub: number, cp: number): boolean => {
    const fmt = cm.getUint16(sub);
    if (fmt === 4) {
      const segX2 = cm.getUint16(sub + 6), end = sub + 14, start = end + segX2 + 2, delta = start + segX2, range = delta + segX2;
      for (let i = 0; i < segX2; i += 2) {
        if (cp > cm.getUint16(end + i) || cp < cm.getUint16(start + i)) continue;
        const ro = cm.getUint16(range + i);
        if (ro === 0) return ((cp + cm.getInt16(delta + i)) & 0xffff) !== 0;
        const g = cm.getUint16(range + i + ro + (cp - cm.getUint16(start + i)) * 2);
        return g !== 0;
      }
      return false;
    }
    if (fmt === 12) {
      const groups = cm.getUint32(sub + 12);
      for (let g = 0; g < groups; g++) {
        const at = sub + 16 + g * 12;
        if (cp >= cm.getUint32(at) && cp <= cm.getUint32(at + 4)) return true;
      }
    }
    return false;
  };
  const tables = cm.getUint16(2);
  for (let t = 0; t < tables; t++) {
    const platform = cm.getUint16(4 + t * 8), sub = cm.getUint32(8 + t * 8);
    if (platform !== 0 && platform !== 3) continue;
    try { if (has(sub, 0x0d85) && has(sub, 0x0d9a)) return true; } catch { /* malformed subtable */ }
  }
  return false;
}

/**
 * Is this an old FM-style Sinhala font? Those draw Sinhala letters on ASCII codes, so the cmap shows nothing Sinhala.
 * What gives them away: vowel signs sit on ordinary letter keys with (almost) zero advance width, which no Latin font does.
 * Reads only the sfnt directory, cmap, head, hhea and hmtx. Plain .ttf / .otf only.
 */
export async function fontFileLooksFM(blob: Blob): Promise<boolean> {
  const dv = new DataView(await blob.slice(0, 12).arrayBuffer());
  if (dv.byteLength < 12) return false;
  const n = dv.getUint16(4);
  const dir = new DataView(await blob.slice(12, 12 + 16 * n).arrayBuffer());
  const at: Record<string, [number, number]> = {};
  for (let i = 0; i < n; i++) {
    const tag = String.fromCharCode(dir.getUint8(i * 16), dir.getUint8(i * 16 + 1), dir.getUint8(i * 16 + 2), dir.getUint8(i * 16 + 3));
    at[tag] = [dir.getUint32(i * 16 + 8), dir.getUint32(i * 16 + 12)];
  }
  if (!at.cmap || !at.head || !at.hhea || !at.hmtx) return false;
  const read = async (tag: string) => new DataView(await blob.slice(at[tag][0], at[tag][0] + at[tag][1]).arrayBuffer());
  const [head, hhea, hmtx, cm] = await Promise.all([read('head'), read('hhea'), read('hmtx'), read('cmap')]);
  const upm = head.getUint16(18) || 1000, metrics = hhea.getUint16(34);
  let sub = -1;
  for (let t = 0, c = cm.getUint16(2); t < c; t++) {
    const platform = cm.getUint16(4 + t * 8), off = cm.getUint32(8 + t * 8);
    if ((platform === 3 || platform === 0) && cm.getUint16(off) === 4) { sub = off; break; }
  }
  if (sub < 0) return false;
  const segX2 = cm.getUint16(sub + 6), end = sub + 14, start = end + segX2 + 2, delta = start + segX2, range = delta + segX2;
  const glyphOf = (cp: number): number => {
    for (let i = 0; i < segX2; i += 2) {
      if (cp > cm.getUint16(end + i) || cp < cm.getUint16(start + i)) continue;
      const ro = cm.getUint16(range + i);
      if (ro === 0) return (cp + cm.getInt16(delta + i)) & 0xffff;
      const g = cm.getUint16(range + i + ro + (cp - cm.getUint16(start + i)) * 2);
      return g === 0 ? 0 : (g + cm.getInt16(delta + i)) & 0xffff;
    }
    return 0;
  };
  let narrow = 0;
  for (const ch of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const g = glyphOf(ch.charCodeAt(0));
    if (!g) continue;
    const m = Math.min(g, metrics - 1) * 4;
    if (m + 2 <= hmtx.byteLength && hmtx.getUint16(m) / upm < 0.2) narrow++;
  }
  return narrow >= 4; // Latin fonts have none; FM fonts have 6 to 8
}

interface ManifestEntry { id: string; label: string; family: string; file: string; license?: string; licenseKnown?: boolean }

/**
 * Register the legacy FM / Tharu fonts shipped in /public/fonts/fm (fetched by python/scripts/fetch_fonts.py).
 * Files load lazily on first use. Returns how many fonts were registered.
 */
let bundledReady: Promise<unknown> = Promise.resolve();
export function loadBundledFMFonts(): Promise<number> {
  const job = loadBundled();
  bundledReady = job;
  return job;
}
async function loadBundled(): Promise<number> {
  try {
    const res = await fetch('/fonts/fm/manifest.json');
    if (!res.ok) return 0;
    const data = await res.json();
    const list: ManifestEntry[] = Array.isArray(data) ? data : data.fonts ?? [];
    // Only list fonts whose file is really there; a missing file would show FM-encoded ASCII gibberish.
    const present = await Promise.all(list.map((e) => fetch(`/fonts/fm/${e.file}`, { method: 'HEAD' }).then((r) => r.ok && !/text\/html/.test(r.headers.get('content-type') ?? '')).catch(() => false)));
    for (const [i, e] of list.entries()) {
      if (!present[i]) continue;
      const id = e.id.startsWith('fm-') ? e.id : `fm-${e.id}`;
      bundledFonts.set(id, {
        id, label: e.label, family: `SinCap ${e.family}`, script: 'sinhala', source: 'bundled', legacy: true, weights: [400], // single-weight: never faux-bold
        url: `/fonts/fm/${e.file}`, license: e.license, licenseKnown: e.licenseKnown,
      });
    }
    listeners.forEach((l) => l());
    return list.length;
  } catch {
    return 0;
  }
}
const loaded = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

export function registerCustomFont(def: FontDef, blob: Blob): Promise<void> {
  const done = loaded.get(def.id);
  if (done && customFonts.has(def.id)) { customFonts.set(def.id, def); return done; } // already registered (React strict mode runs startup effects twice)
  customFonts.set(def.id, def);
  const p = blob.arrayBuffer().then(async (buf) => {
    // Not quoted: FontFace keeps literal quotes in the name and the canvas then never matches it. Import makes the family plain letters, digits and spaces.
    const face = new FontFace(def.family, buf);
    await face.load();
    document.fonts.add(face);
    listeners.forEach((l) => l()); // font pickers and canvases pick up the new font
  });
  p.catch(() => { customFonts.delete(def.id); loaded.delete(def.id); });
  loaded.set(def.id, p);
  return p;
}

export type FontKind = 'unicode' | 'fm' | 'english';
export const fontKindOf = (f: FontDef): FontKind => (f.legacy ? 'fm' : f.script === 'sinhala' ? 'unicode' : 'english');

/** Change how a custom font is treated (Unicode Sinhala, FM legacy Sinhala, English) and remember it. */
export async function setCustomFontKind(id: string, kind: FontKind): Promise<void> {
  const stored = (await db.listFonts()).find((x) => x.def.id === id);
  if (!stored) return;
  const def: FontDef = { ...stored.def, script: kind === 'english' ? 'english' : 'sinhala', legacy: kind === 'fm' };
  await db.putFont(def, stored.blob);
  customFonts.set(id, def);
  listeners.forEach((l) => l());
}

/** Delete a custom font from this browser. Text that used it falls back to the default font. */
export async function removeCustomFont(id: string): Promise<void> {
  await db.deleteFont(id);
  const def = customFonts.get(id);
  unregisterCustomFont(id);
  if (def) for (const face of [...document.fonts]) if (face.family.replace(/^"|"$/g, '') === def.family) document.fonts.delete(face);
  listeners.forEach((l) => l());
}

export function unregisterCustomFont(id: string) {
  customFonts.delete(id);
  loaded.delete(id);
}

export function allFonts(): FontDef[] {
  return [...BUILTIN_FONTS, ...bundledFonts.values(), ...customFonts.values()];
}

export function getFont(id: string | null | undefined): FontDef {
  return (id && (customFonts.get(id) ?? bundledFonts.get(id) ?? BUILTIN_FONTS.find((f) => f.id === id))) || BUILTIN_FONTS[0];
}

/** CSS font-family value with sensible fallbacks. */
export function cssFamily(def: FontDef): string {
  const primary = def.source === 'system' ? def.family : `"${def.family}"`;
  // Legacy fonts must not fall back to a Unicode Sinhala font: their text is ASCII glyph codes.
  const fallback = def.legacy ? 'sans-serif' : def.script === 'sinhala' ? '"Noto Sans Sinhala", sans-serif' : 'sans-serif';
  return `${primary}, ${fallback}`;
}

export function ensureFont(id: string): Promise<void> {
  const def = getFont(id);
  const existing = loaded.get(def.id);
  if (existing) return existing;
  let p: Promise<void>;
  if (def.source === 'google') {
    const weights = (def.weights ?? [400]).join(';');
    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(def.family).replace(/%20/g, '+')}:wght@${weights}&display=block`;
    p = new Promise<void>((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      // A failed load must not stay cached as loaded, or later exports would silently use the fallback font.
      const fail = () => { link.remove(); loaded.delete(def.id); resolve(); };
      link.onload = () => {
        const sample = def.script === 'sinhala' ? 'අආක' : 'Aa';
        Promise.all(
          (def.weights ?? [400]).map((w) => document.fonts.load(`${w} 40px "${def.family}"`, sample)),
        ).then(() => resolve(), fail);
      };
      link.onerror = fail;
      document.head.appendChild(link);
    });
  } else if (def.source === 'bundled' && def.url) {
    const face = new FontFace(def.family, `url(${def.url})`);
    // If an FM file is missing, forget the font so text falls back to Unicode Noto instead of FM gibberish.
    p = face.load().then((f) => { document.fonts.add(f); }, () => { bundledFonts.delete(def.id); listeners.forEach((l) => l()); });
  } else {
    p = Promise.resolve();
  }
  loaded.set(def.id, p);
  return p;
}

/** Subscribe to "a font finished loading" so canvases can redraw. */
export function onFontsChanged(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export async function ensureFonts(ids: (string | null | undefined)[]) {
  await bundledReady; // FM fonts only exist in the catalog once their manifest is read
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const pending = unique.filter((id) => !loaded.has(getFont(id).id));
  await Promise.all(unique.map(ensureFont));
  if (pending.length) {
    listeners.forEach((l) => l());
  }
}

// ---- Favorites ----------------------------------------------------------------

const FAV_KEY = 'keyframe.favFonts';
let favorites: Set<string> | null = null;

export function favoriteFonts(): Set<string> {
  if (!favorites) {
    try { favorites = new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]); } catch { favorites = new Set(); }
  }
  return favorites;
}

export function toggleFavoriteFont(id: string) {
  const fav = favoriteFonts();
  if (fav.has(id)) fav.delete(id); else fav.add(id);
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...fav])); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

/** Weight a font's sample should use: 400 when it has one, else its only/lightest face (Black, ExtraBold…). */
export function previewWeight(def: FontDef): number {
  const w = def.weights ?? [400];
  return w.includes(400) ? 400 : Math.min(...w);
}
