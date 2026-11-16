'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/** Lenis smooth scrolling for the landing page; off when the viewer prefers reduced motion. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // anchors: in-page #links glide too; offset matches the fixed nav (scroll-padding-top: 5rem).
    const lenis = new Lenis({ autoRaf: true, anchors: { offset: -80 } });
    return () => lenis.destroy();
  }, []);
  return null;
}
