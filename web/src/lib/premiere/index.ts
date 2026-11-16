import type { Template } from '../../types';
import { animFromTracks } from './keys';
import { parseKeyframeXml, xmlText } from './xmlKeyframes';
import { parseMogrt } from './mogrt';
import { analyzeVideo } from './videoMotion';
import { buildTemplate, type PackLook } from './toTemplate';
import { motionFromAep } from './aepAnim';

export const PACK_ACCEPT = '.mogrt,.prfpset,.prproj,.aep,.mp4,.mov,.webm,.m4v';

export interface PackResult { templates: Template[]; warnings: string[] }

const ext = (f: File) => f.name.toLowerCase().split('.').pop() ?? '';

/**
 * Read text animations out of Premiere Pro packs and return them as editable templates.
 * .prfpset / .prproj: exact keyframes. .mogrt: controls plus keyframes when readable. Preview videos: measured, approximate.
 */
export async function importPremierePack(files: File[], onStatus?: (s: string) => void): Promise<PackResult> {
  const templates: Template[] = [], warnings: string[] = [];
  for (const file of files) {
    const origin = `Premiere pack: ${file.name}`, base = file.name.replace(/\.[^.]+$/, '');
    onStatus?.(`Reading ${file.name}…`);
    try {
      const e = ext(file);
      if (e === 'aep') {
        warnings.push(`${file.name}: .aep is a binary After Effects project and cannot be read here. Import the pack's preview video, or its .mogrt, instead.`);
      } else if (e === 'prfpset' || e === 'prproj') {
        const anims = parseKeyframeXml(await xmlText(new Uint8Array(await file.arrayBuffer())), base);
        if (!anims.length) warnings.push(`${file.name}: no keyframed Motion, Opacity or Blur parameters found.`);
        for (const a of anims) {
          const { inKeys, outKeys } = animFromTracks(a.tracks);
          if (!inKeys && !outKeys) continue;
          templates.push(buildTemplate({ name: a.name, origin, perLetter: a.perLetter }, inKeys, outKeys));
          if (a.perLetter) warnings.push(`${a.name}: per-letter animators found, so a letter delay was added; tune it in the editor.`);
        }
      } else if (e === 'mogrt') {
        const m = await parseMogrt(file);
        warnings.push(...m.notes.map((n) => `${file.name}: ${n}`));
        const look: PackLook = { name: m.info.name, origin, fontId: m.info.fontId, size: m.info.size, color: m.info.color };
        const preview = async () => {
          onStatus?.(`Analysing the preview in ${file.name}…`);
          for (const [i, r] of (await analyzeVideo(m.video!)).entries()) templates.push(buildTemplate({ ...look, name: `${look.name} ${i + 1}`, color: look.color ?? r.color, glow: r.glow, approximate: true }, r.inKeys, r.outKeys));
        };
        if (m.aep) {
          const px = m.info.size && m.info.compH ? m.info.size * (1080 / m.info.compH) : m.info.size;
          const mo = motionFromAep(m.aep, m.info.size ?? 64);
          warnings.push(...mo.notes.map((n) => `${file.name}: ${n}`));
          if (mo.letterIn || mo.letterOut || mo.lineIn || mo.lineOut) {
            const t = buildTemplate({ ...look, size: px, approximate: true }, mo.lineIn, mo.lineOut, mo.letterIn || mo.letterOut ? mo : undefined);
            templates.push(t);
          } else if (m.video) await preview(); // no usable motion in the project: measure the bundled preview instead
          else templates.push(buildTemplate({ ...look, size: px })); // keep the pack's font, size and colour
        } else if (m.anims.length) {
          for (const a of m.anims) {
            const { inKeys, outKeys } = animFromTracks(a.tracks);
            if (inKeys || outKeys) templates.push(buildTemplate({ ...look, name: m.anims.length > 1 ? a.name : look.name, perLetter: a.perLetter }, inKeys, outKeys));
          }
        } else if (m.video) {
          await preview();
        } else if (!m.notes.length) templates.push(buildTemplate(look));
      } else {
        const runs = await analyzeVideo(file, (f) => onStatus?.(`Analysing ${file.name}… ${Math.round(f * 100)}%`));
        if (!runs.length) warnings.push(`${file.name}: no bright text found. Light text on a darker background works best.`);
        runs.forEach((r, i) => templates.push(buildTemplate({ name: `${base} ${i + 1}`, origin, color: r.color, glow: r.glow, approximate: true }, r.inKeys, r.outKeys)));
        if (runs.length) warnings.push(`${file.name}: measured from the video, so the motion is approximate (no easing or per-letter timing).`);
      }
    } catch (err) {
      warnings.push(`${file.name}: ${(err as Error).message || 'could not be imported.'}`);
    }
  }
  return { templates, warnings };
}
