import type { Project } from '../types';
import { overlayFontIds } from '../render/overlays';

export function projectFontIds(p: Project): string[] {
  const s = p.style;
  const ids = [s.text.sinhalaFont, s.text.englishFont, s.text.sinhala.fontFamily, s.text.english.fontFamily, s.emphasis.sinhalaFont, s.emphasis.englishFont];
  for (const c of p.captions) {
    const o = c.styleOverride?.text;
    if (o) ids.push(o.sinhalaFont, o.englishFont);
    for (const w of c.words) if (w.style?.font) ids.push(w.style.font);
  }
  ids.push(...overlayFontIds(p.overlays));
  return ids.filter((x): x is string => !!x);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'keyframe';
}
