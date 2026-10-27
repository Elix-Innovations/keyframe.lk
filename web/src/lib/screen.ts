import { nanoid } from 'nanoid';
import type { Ease, FeedPost, OverlayItem, ScreenQuadKf, ScreenSpec } from '../types';
import { applyEase } from './videoFx';

/** Pure logic for the phone-screen layer: the pinned corners over time and the feed's scroll. */

export type Quad = [number, number][];

/** A portrait phone-screen rectangle in the middle of the frame (% of the frame). */
export const defaultQuad = (): Quad => [[30, 22], [70, 22], [70, 78], [30, 78]];

export const newQuadKf = (t: number, pts: Quad, ease: Ease = 'linear'): ScreenQuadKf => ({ id: nanoid(6), t, pts: pts.map(([x, y]) => [x, y]), ease });

export const defaultPosts = (): FeedPost[] => [
  { id: nanoid(6), text: 'Sunset over the hills this evening 🌄', likes: 128, comments: 14, time: '3h', author: 'Kasun Perera' },
  { id: nanoid(6), text: 'Weekend escape to the lake. Totally worth it!', likes: 342, comments: 27, time: '1d', author: 'Nadeesha Fernando' },
  { id: nanoid(6), text: '', likes: 1204, comments: 96, time: '16m', author: 'Nimali Furniture' },
];

export function makeScreenSpec(duration: number): ScreenSpec {
  return {
    quad: [newQuadKf(0, defaultQuad())],
    feed: { pageName: 'Your page', posts: defaultPosts() },
    scroll: { start: 0.3, stop: Math.max(1, Math.min(2.8, duration - 0.5)), ease: 'easeOut' },
    corner: 7,
  };
}

/** Corners at time `lt` (seconds since the layer started): held before the first and after the last pin, eased in between. */
export function quadAt(kfs: ScreenQuadKf[], lt: number): Quad {
  if (!kfs.length) return defaultQuad();
  const ks = [...kfs].sort((a, b) => a.t - b.t);
  if (lt <= ks[0].t) return ks[0].pts;
  const last = ks[ks.length - 1];
  if (lt >= last.t) return last.pts;
  let i = 0;
  while (ks[i + 1].t < lt) i++;
  const a = ks[i], b = ks[i + 1];
  const u = applyEase(a.ease, (lt - a.t) / Math.max(1e-6, b.t - a.t));
  return a.pts.map(([x, y], k) => [x + (b.pts[k][0] - x) * u, y + (b.pts[k][1] - y) * u] as [number, number]);
}

/** How far the feed has scrolled, 0..1 of the way to the last post: eased between the start and stop times, then held. */
export function scrollProgress(scroll: ScreenSpec['scroll'], lt: number): number {
  const span = Math.max(1e-3, scroll.stop - scroll.start);
  return applyEase(scroll.ease, Math.max(0, Math.min(1, (lt - scroll.start) / span)));
}

/** Image assets a layer needs decoded (the feed's photos and avatar for a screen layer). */
export const overlayAssetIds = (o: OverlayItem): string[] => [
  ...(o.assetId ? [o.assetId] : []),
  ...(o.screen ? [...(o.screen.feed.avatarAssetId ? [o.screen.feed.avatarAssetId] : []), ...o.screen.feed.posts.flatMap((p) => (p.assetId ? [p.assetId] : []))] : []),
];

/** Pin the corners at `lt`: updates the pin that is already there (within 50 ms), or adds one. */
export function setQuadAt(kfs: ScreenQuadKf[], lt: number, pts: Quad): ScreenQuadKf[] {
  const near = kfs.find((k) => Math.abs(k.t - lt) < 0.05);
  const copy = pts.map(([x, y]) => [x, y] as [number, number]);
  if (near) return kfs.map((k) => (k === near ? { ...k, pts: copy } : k));
  return [...kfs, newQuadKf(Number(lt.toFixed(2)), copy)].sort((a, b) => a.t - b.t);
}
