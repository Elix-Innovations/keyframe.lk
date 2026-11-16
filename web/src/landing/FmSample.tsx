'use client';

import { useEffect, useState } from 'react';
import { unicodeToFM } from '@/lib/fm';

const URL = '/fonts/fm/fm-ganganee.ttf';

/**
 * Draws Sinhala text in FM Ganganee, the way the editor renders FM captions (Unicode converted to FM encoding).
 * The FM fonts are gitignored (unclear licence, fetched by `npm run fonts:fetch`), so if the file is missing
 * this keeps the plain Unicode text: FM-encoded text in a fallback font would show Latin gibberish.
 */
export function FmSample({ text, className = '' }: { text: string; className?: string }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    new FontFace('FM Ganganee Landing', `url(${URL})`).load()
      .then((f) => { document.fonts.add(f); if (live) setOk(true); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return ok
    ? <p className={className} style={{ fontFamily: "'FM Ganganee Landing'" }}>{unicodeToFM(text)}</p>
    : <p lang="si" className={`font-sinhala ${className}`}>{text}</p>;
}
