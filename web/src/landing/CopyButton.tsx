'use client';

import { useState } from 'react';

/** Copies a block of text and briefly confirms. The only client component on the landing page. */
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch { /* clipboard blocked: the text stays selectable */ }
      }}
      className="mono rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 transition-colors hover:border-white/25 hover:text-white"
      aria-live="polite"
    >
      {done ? 'copied' : 'copy'}
    </button>
  );
}
