import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { FileType } from '@/components/icons';
import type { FontDef } from '@/types';
import { useEditor } from '@/store';
import { fontFileHasSinhala, fontFileLooksFM, registerCustomFont, removeCustomFont } from '@/lib/fonts';
import * as db from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Segmented } from './controls';

type Mode = 'auto' | 'fm' | 'english';

/** WOFF and WOFF2 wrap the sfnt tables, so the raw-table sniffers in lib/fonts cannot read them. */
async function isWoff(f: File): Promise<boolean> {
  const sig = String.fromCharCode(...new Uint8Array(await f.slice(0, 4).arrayBuffer()));
  return sig === 'wOFF' || sig === 'wOF2';
}

/** Does a (decoded by the browser) font draw Sinhala letters? Its width for අක differs from the plain fallback only when it has those glyphs. */
async function renderedHasSinhala(f: File): Promise<boolean> {
  const family = `SinCap Probe ${nanoid(6).replace(/[^A-Za-z0-9]/g, 'x')}`;
  const face = new FontFace(family, await f.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  try {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const width = (font: string) => { ctx.font = font; return ctx.measureText('අකඅක').width; };
    return width(`64px "${family}", sans-serif`) !== width('64px sans-serif');
  } finally {
    document.fonts.delete(face);
  }
}

/** Add your own font files. "Auto" reads the file: a font with Sinhala letters is a Unicode Sinhala font, otherwise English. */
export function FontImport() {
  const notify = useEditor((s) => s.notify);
  const [mode, setMode] = useState<Mode>('auto');
  const ref = useRef<HTMLInputElement>(null);

  const add = async (files: File[]) => {
    for (const f of files) {
      const label = f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[_-]+/g, ' ');
      try {
        // For WOFF/WOFF2 the file is probed by rendering, and the filename is not used as a hint.
        const woff = mode === 'auto' && await isWoff(f).catch(() => false);
        const unicode = mode === 'auto' ? await (woff ? renderedHasSinhala(f) : fontFileHasSinhala(f)).catch(() => false) : false;
        // Old FM-style Sinhala fonts draw Sinhala letters on ASCII codes, so they have no Sinhala in their cmap: check their metrics, then the name.
        const fm = mode === 'fm' || (mode === 'auto' && !unicode && !woff && (await fontFileLooksFM(f).catch(() => false) || /sinhala|\bfm\b|(^|[^a-z])fm[-_ ]?[a-z]/i.test(f.name)));
        const sinhala = unicode || fm;
        const def: FontDef = { id: `custom-${nanoid(8)}`, label, family: `SinCap Custom ${label.replace(/[^\p{L}\p{N} ]/gu, '')} ${nanoid(6).replace(/[^A-Za-z0-9]/g, 'x')}`, script: sinhala ? 'sinhala' : 'english', source: 'custom', legacy: fm };
        await registerCustomFont(def, f);
        try {
          await db.putFont(def, f);
        } catch (err) {
          // Not persisted (storage full or blocked): do not leave it registered for this session only.
          console.error(err);
          await removeCustomFont(def.id).catch(() => {});
          notify(`“${f.name}” could not be saved to browser storage; it may be full or blocked.`, 'error');
          continue;
        }
        notify(`Added “${label}” as a ${fm ? 'FM (legacy) Sinhala' : sinhala ? 'Sinhala' : 'English'} font. Find it under “My fonts”.`, 'success');
      } catch (err) {
        console.error(err);
        notify(`“${f.name}” could not be loaded as a font${err instanceof Error && err.message ? `: ${err.message}` : ''}.`, 'error');
      }
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed p-3">
      <Segmented size="sm" fill value={mode} onChange={setMode} options={[{ value: 'auto', label: 'Auto-detect' }, { value: 'fm', label: 'FM / legacy' }, { value: 'english', label: 'English' }]} />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()}><FileType />Add fonts (.ttf / .otf / .woff2)</Button>
      <input ref={ref} type="file" multiple accept=".ttf,.otf,.woff,.woff2" hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void add(fs); e.target.value = ''; }} />
    </div>
  );
}
