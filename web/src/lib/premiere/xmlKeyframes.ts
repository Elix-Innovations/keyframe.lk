import { inflate } from './zip';

/** Premiere stores time as ticks: 254016000000 per second. */
const TICKS = 254016000000;

export type ParamKind = 'position' | 'scale' | 'rotation' | 'opacity' | 'blur';
export interface Track { kind: ParamKind; keys: { t: number; v: number[] }[] }
export interface ParsedAnim { name: string; tracks: Track[]; perLetter: boolean }

const kindOf = (name: string): ParamKind | null => {
  const n = name.toLowerCase();
  if (n.includes('anchor')) return null;
  if (n.includes('position')) return 'position';
  if (n.includes('rotation')) return 'rotation';
  if (n.includes('opacity')) return 'opacity';
  if (n.includes('blur')) return 'blur';
  if (n.includes('scale') && !n.includes('width')) return 'scale';
  return null;
};

/** Gunzip when the bytes start with the gzip magic (.prproj, some presets), else read as UTF-8 text. */
export async function xmlText(bytes: Uint8Array): Promise<string> {
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? await inflate(bytes, 'gzip') : bytes;
  return new TextDecoder().decode(raw);
}

/** "time,value[:value];time,value;..." → keys. Times may be ticks or seconds. */
function parseKeys(text: string): Track['keys'] {
  const raw = text.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
    const parts = s.split(',');
    return { t: Number(parts[0]), v: (parts[1] ?? '').split(':').map(Number) };
  }).filter((k) => Number.isFinite(k.t) && k.v.length && k.v.every(Number.isFinite));
  const ticks = raw.some((k) => Math.abs(k.t) > 1e6);
  return raw.map((k) => ({ t: ticks ? k.t / TICKS : k.t, v: k.v })).sort((a, b) => a.t - b.t);
}

const childText = (el: Element, tags: string[]) => {
  for (const c of Array.from(el.children)) if (tags.includes(c.tagName)) return c.textContent?.trim() ?? '';
  return '';
};

/**
 * Pull every keyframed Motion / Opacity / Blur parameter out of a Premiere XML document (.prproj, .prfpset, or the XML
 * inside a .mogrt) and group them by the preset or clip they belong to. Tolerant by design: unknown elements are skipped.
 */
export function parseKeyframeXml(xml: string, fallbackName: string): ParsedAnim[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('The file is not readable XML.');
  const groups = new Map<Element | null, ParsedAnim>();
  const GROUP = /^(Preset|PresetItem|SubClip|VideoClipTrackItem|ClipTrackItem|GraphicClip)$/;
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const kf = Array.from(el.children).find((c) => c.tagName === 'Keyframes');
    if (!kf) continue;
    const kind = kindOf(childText(el, ['Name', 'ParameterName', 'DisplayName']));
    if (!kind) continue;
    const keys = parseKeys(kf.textContent ?? '');
    if (keys.length < 2) continue;
    let g: Element | null = el.parentElement;
    while (g && !GROUP.test(g.tagName)) g = g.parentElement;
    let a = groups.get(g);
    if (!a) { a = { name: (g && childText(g, ['Name', 'PresetName'])) || fallbackName, tracks: [], perLetter: /Animator|RangeSelector|TextSelector/i.test(xml) }; groups.set(g, a); }
    a.tracks.push({ kind, keys });
  }
  return [...groups.values()].filter((a) => a.tracks.length);
}
