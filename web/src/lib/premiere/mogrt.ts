import { readZip } from './zip';
import { parseKeyframeXml, xmlText, type ParsedAnim } from './xmlKeyframes';
import { matchFont } from './toTemplate';
import { parseAep, type AepFile } from './aep';

export interface MogrtInfo { name: string; fontId?: string; size?: number; color?: string; /** Height of the comp the pack was built in, for scaling its pixel sizes to 1080p. */ compH?: number }
export interface MogrtResult { info: MogrtInfo; anims: ParsedAnim[]; aep: AepFile | null; video: Blob | null; notes: string[] }

/** Depth-first search of the parsed definition.json for the first value whose key matches. */
function find(obj: unknown, key: RegExp, ok: (v: unknown) => boolean): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (key.test(k) && ok(v)) return v;
    const r = find(v, key, ok);
    if (r !== undefined) return r;
  }
  return undefined;
}

/** "#RRGGBB" from a hex string, an [r,g,b] array (0..255 or 0..1) or a packed number. */
function toHex(v: unknown): string | undefined {
  if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v)) return '#' + v.replace('#', '').toUpperCase();
  if (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((x) => typeof x === 'number')) {
    const k = Math.max(...(v as number[]).slice(0, 3)) <= 1 ? 255 : 1;
    return '#' + (v as number[]).slice(0, 3).map((x) => Math.round(x * k).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  if (typeof v === 'number' && v >= 0 && v <= 0xffffff) return '#' + v.toString(16).padStart(6, '0').toUpperCase();
  return undefined;
}

function readDefinition(def: unknown, fallback: string): MogrtInfo {
  const loc = (def as { capsuleNameLocalized?: { strDB?: { str?: string }[] } })?.capsuleNameLocalized?.strDB?.[0]?.str;
  const name = loc || (find(def, /^(name|capsuleName)$/i, (v) => typeof v === 'string' && !!v) as string | undefined);
  const font = find(def, /fontEditValue|fontFamily|fontName/i, (v) => typeof v === 'string' || (Array.isArray(v) && typeof v[0] === 'string'));
  const size = find(def, /fontSizeEditValue|fontSize/i, (v) => typeof v === 'number') as number | undefined;
  const centre = find(def, /^value$/i, (v) => !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { y?: unknown }).y === 'number' && typeof (v as { x?: unknown }).x === 'number') as { y: number } | undefined;
  const color = toHex(find(def, /fillColor|textColor|^color$/i, (v) => toHex(v) !== undefined));
  const fontName = Array.isArray(font) ? (font[0] as string) : (font as string | undefined);
  return { name: name || fallback, fontId: fontName ? matchFont(fontName) : undefined, size, color, compH: centre ? centre.y * 2 : undefined };
}

const VIDEO = /\.(mp4|mov|webm|m4v)$/i;
const MAYBE_XML = /\.(xml|prproj|prfpset|aegraphic|json)$/i;

/** Open a .mogrt: read its controls, look for keyframes in any XML inside, and keep a preview video for fallback analysis. */
export async function parseMogrt(file: File): Promise<MogrtResult> {
  const entries = await readZip(await file.arrayBuffer());
  const base = file.name.replace(/\.[^.]+$/, '');
  const notes: string[] = [];
  let info: MogrtInfo = { name: base };
  const def = entries.find((e) => /(^|\/)definition\.json$/i.test(e.name));
  if (def) {
    try { info = readDefinition(JSON.parse(new TextDecoder().decode(await def.read())), base); } catch { notes.push('definition.json could not be read; using the file name.'); }
  } else notes.push('No definition.json: not a standard .mogrt.');
  let anims: ParsedAnim[] = [];
  let aep: AepFile | null = null;
  // After Effects graphics: project.aegraphic is itself a zip holding the .aep.
  const graphic = entries.find((e) => /\.aegraphic$/i.test(e.name));
  if (graphic) {
    try {
      const inner = await readZip((await graphic.read()).slice().buffer as ArrayBuffer);
      const proj = inner.find((e) => /\.aep$/i.test(e.name));
      if (proj) aep = parseAep(await proj.read());
    } catch (err) { notes.push(`The After Effects project inside could not be read (${(err as Error).message}).`); }
  }
  for (const e of entries) {
    if (aep) break;
    if (anims.length || e === def || !MAYBE_XML.test(e.name) || e.size > 40e6) continue;
    try {
      const bytes = await e.read();
      if (bytes[0] !== 0x3c && !(bytes[0] === 0x1f && bytes[1] === 0x8b)) continue; // not XML text
      anims = parseKeyframeXml(await xmlText(bytes), info.name);
    } catch { /* binary or unrelated: keep looking */ }
  }
  const vid = entries.find((e) => VIDEO.test(e.name));
  const video = !anims.length && !aep && vid ? new Blob([(await vid.read()) as BlobPart], { type: 'video/mp4' }) : null;
  if (!anims.length && !aep && !video) notes.push('The graphic inside is binary (made in After Effects) and the pack has no preview video, so its keyframes cannot be read. Import the pack\'s preview video instead.');
  return { info, anims, aep, video, notes };
}
