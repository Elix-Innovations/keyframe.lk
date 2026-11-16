'use client';

import { useEffect } from 'react';

/**
 * Scroll entrances for the landing sections. Adds `fx` to <html> (so content stays visible without JS),
 * then marks each `.reveal` with `is-in` the first time it scrolls into view. Elements that enter together
 * (a row of cards) get a stagger through `--fx-d`. Off for reduced motion.
 */
export function ScrollFx() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    root.classList.add('fx');
    const io = new IntersectionObserver((entries) => {
      const shown = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
      shown.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      shown.forEach((el, i) => {
        el.style.setProperty('--fx-d', `${Math.min(i, 5) * 90}ms`);
        el.classList.add('is-in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    document.querySelectorAll('.landing .reveal').forEach((el) => io.observe(el));
    return () => { io.disconnect(); root.classList.remove('fx'); };
  }, []);
  return null;
}
