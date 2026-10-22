import { nanoid } from 'nanoid';
import type { AnimKey, Template } from '../../types';
import { makeStyle } from '../style';
import { allFonts } from '../fonts';

/** What an imported pack tells us about one text preset's look. */
export interface PackLook {
  name: string;
  origin: string;
  fontId?: string;
  /** Type size in px at 1080p. */
  size?: number;
  color?: string;
  glow?: string | null;
  perLetter?: boolean;
  approximate?: boolean;
}

/** Closest built-in font for a PostScript / family name such as "Inter-Bold". */
export function matchFont(name: string): string | undefined {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  let best: { id: string; len: number } | undefined;
  for (const f of allFonts()) {
    const fam = f.family.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (fam && n.includes(fam) && (!best || fam.length > best.len)) best = { id: f.id, len: fam.length };
  }
  return best?.id;
}

/** Turn extracted keyframes and look into an editable single-row creative template. */
export interface LetterMotion { letterIn?: AnimKey[]; letterOut?: AnimKey[]; lineIn?: AnimKey[]; perLetter: number }

export function buildTemplate(look: PackLook, inKeys?: AnimKey[], outKeys?: AnimKey[], letters?: LetterMotion): Template {
  const style = makeStyle({
    displayMode: 'word-by-word', wordsPerChunk: 6, animation: 'none', animationSpeed: 1,
    text: {
      fontSize: look.size && look.size >= 30 && look.size <= 160 ? Math.round(look.size) : 64,
      englishFont: look.fontId ?? 'inter', bold: true, shadowPreset: 'none', strokeWidth: 0, lineHeight: 1.1,
    },
    layout: { y: 50, maxWidth: 92, align: 'center' },
    creative: {
      kind: 'stack', wordsPerLine: 6, singleLine: true, stagger: 0.1,
      lineAnim: inKeys || letters?.lineIn ? 'custom' : 'none', outAnim: outKeys ? 'custom' : 'none',
      customIn: inKeys ?? letters?.lineIn, customOut: outKeys,
      ...(letters && (letters.letterIn || letters.letterOut)
        ? { perLetter: letters.perLetter, letterAnim: letters.letterIn ? 'custom' as const : 'none' as const, customLetterIn: letters.letterIn, customLetterOut: letters.letterOut }
        : look.perLetter && inKeys ? { perLetter: 0.04, letterAnim: 'custom' as const } : {}),
      lines: [{
        scale: 1, fill: { color: look.color ?? '#FFFFFF', gradient: null },
        ...(look.glow ? { glow: { color: look.glow, strength: 1, radius: 20 } } : {}),
      }],
    },
  });
  return { id: nanoid(10), name: look.name, builtIn: false, style, createdAt: Date.now(), sfx: null, origin: look.origin, approximate: look.approximate };
}
