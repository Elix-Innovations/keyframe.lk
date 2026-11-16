'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Clips shown in the hero frame, one after another. `captioned` clips already have captions burned in, so the animated demo caption is hidden for them. */
const REELS = [
  { src: '/landing/hero.mp4', poster: '/landing/hero.jpg', captioned: false },
  { src: '/landing/style-highlight.mp4', poster: '/landing/style-highlight.jpg', captioned: true },
  { src: '/landing/style-punch.mp4', poster: '/landing/style-punch.jpg', captioned: true },
  { src: '/landing/style-clean.mp4', poster: '/landing/style-clean.jpg', captioned: true },
];

/** Plays the reels in turn inside the hero preview. Pauses off-screen; under reduced motion it shows the first still. */
export function ReelFrame({ overlay }: { overlay: ReactNode }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [still, setStill] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const vids = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setStill(true); return; }
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (still) return;
    vids.current.forEach((v, i) => {
      if (!v) return;
      if (i === idx && visible) v.play().catch(() => {});
      else { v.pause(); if (i !== idx) v.currentTime = 0; }
    });
  }, [idx, visible, still]);

  return (
    <div ref={wrap} className="absolute inset-0">
      {REELS.map((r, i) => (
        <video key={r.src} ref={(el) => { vids.current[i] = el; }} src={r.src} poster={r.poster} muted playsInline preload={i < 2 ? 'auto' : 'metadata'}
          aria-hidden tabIndex={-1} onEnded={() => setIdx((n) => (n + 1) % REELS.length)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${i === idx ? 'opacity-100' : 'opacity-0'}`} />
      ))}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,10,.35),transparent_30%,rgba(5,6,10,.15)_55%,rgba(5,6,10,.8))]" />
      <div className="absolute inset-x-4 top-5 flex gap-1">
        {REELS.map((r, i) => <span key={r.src} className={`h-0.5 flex-1 rounded-full transition-colors ${i === idx ? 'bg-white/90' : 'bg-white/25'}`} />)}
      </div>
      <div className={`transition-opacity duration-300 ${REELS[idx].captioned ? 'opacity-0' : 'opacity-100'}`}>{overlay}</div>
    </div>
  );
}
