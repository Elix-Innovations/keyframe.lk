import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { FileType } from '@/components/icons';
import type { FontDef } from '@/types';
import { useEditor } from '@/store';
import { fontFileHasSinhala, fontFileLooksFM, registerCustomFont } from '@/lib/fonts';
import * as db from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Segmented } from './controls';

type Mode = 'auto' | 'fm' | 'english';

/** Add your own font files. "Auto" reads the file: a font with Sinhala letters is a Unicode Sinhala font, otherwise English. */
export function FontImport() {
  const notify = useEditor((s) => s.notify);
  const [mode, setMode] = useState<Mode>('auto');
  const ref = useRef<HTMLInputElement>(null);

  const add = async (files: File[]) => {
    for (const f of files) {
      const label = f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[_-]+/g, ' ');
      try {
        const unicode = mode === 'auto' ? await fontFileHasSinhala(f).catch(() => false) : false;
        // Old FM-style Sinhala fonts draw Sinhala letters on ASCII codes, so they have no Sinhala in their cmap: check their metrics, then the name.
        const fm = mode === 'fm' || (mode === 'auto' && !unicode && (await fontFileLooksFM(f).catch(() => false) || /sinhala|\bfm\b|fm[-_ ]?[a-z]/i.test(f.name)));
        const sinhala = unicode || fm;
        const def: FontDef = { id: `custom-${nanoid(8)}`, label, family: `SinCap Custom ${label.replace(/[^\p{L}\p{N} ]/gu, '')} ${nanoid(6).replace(/[^A-Za-z0-9]/g, 'x')}`, script: sinhala ? 'sinhala' : 'english', source: 'custom', legacy: fm };
        await registerCustomFont(def, f);
        await db.putFont(def, f);
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
