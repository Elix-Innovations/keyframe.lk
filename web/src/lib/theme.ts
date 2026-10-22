import { useEffect, useState } from 'react';

/** Light/dark theme. app/layout.tsx applies the saved choice before first paint; this keeps it in sync after. */
export type Theme = 'light' | 'dark';

const KEY = 'keyframe-theme';

// Dark is the house look (near-black with rose accents); light only when the user picks it.
function systemTheme(): Theme {
  return 'dark';
}

function savedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0b0f' : '#fafafa');
}

const listeners = new Set<(t: Theme) => void>();
let current: Theme = savedTheme() ?? systemTheme();

export function setTheme(theme: Theme) {
  current = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* storage unavailable */ }
  apply(theme);
  listeners.forEach((l) => l(theme));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    return () => { listeners.delete(set); };
  }, []);
  return [theme, setTheme];
}
