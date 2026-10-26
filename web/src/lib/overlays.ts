import { nanoid } from 'nanoid';
import type { OverlayAnimId, OverlayBlend, OverlayItem, OverlayLoopId } from '../types';
import type { Project } from '../types';
import { freeTrack } from './adj';
import { freeLayerRow, newLayerRow } from './layers';

/** Pure logic and presets for text, sticker and image overlays. Timeline editing reuses the track helpers in adj.ts. */

export const MIN_OVERLAY = 0.2;

export const ANIM_IN: { id: OverlayAnimId; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'fade', label: 'Fade' }, { id: 'pop', label: 'Pop' }, { id: 'bounce', label: 'Bounce' },
  { id: 'zoom', label: 'Zoom' }, { id: 'slideUp', label: 'Slide up' }, { id: 'slideDown', label: 'Slide down' },
  { id: 'slideLeft', label: 'Slide left' }, { id: 'slideRight', label: 'Slide right' }, { id: 'spin', label: 'Spin' },
  { id: 'shake', label: 'Shake' }, { id: 'blurIn', label: 'Blur in' }, { id: 'glitch', label: 'Glitch' },
  { id: 'typewriter', label: 'Typewriter' }, { id: 'flip', label: 'Flip' },
  { id: 'wipe', label: 'Wipe' }, { id: 'elastic', label: 'Elastic' }, { id: 'drop', label: 'Drop' }, { id: 'swing', label: 'Swing' },
  { id: 'rubber', label: 'Rubber band' }, { id: 'blink', label: 'Blink' }, { id: 'wordPop', label: 'Word by word' }, { id: 'rise', label: 'Rise' },
  { id: 'spinZoom', label: 'Spin zoom' }, { id: 'jelly', label: 'Jelly' },
];
export const LOOPS: { id: OverlayLoopId; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'pulse', label: 'Pulse' }, { id: 'float', label: 'Float' }, { id: 'wiggle', label: 'Wiggle' },
  { id: 'swing', label: 'Swing' }, { id: 'spin', label: 'Spin' }, { id: 'blink', label: 'Blink' }, { id: 'heartbeat', label: 'Heartbeat' },
  { id: 'glitch', label: 'Glitch' }, { id: 'tada', label: 'Tada' }, { id: 'jelly', label: 'Jelly' }, { id: 'shake', label: 'Shake' }, { id: 'breathe', label: 'Breathe' },
];
export const BLENDS: { id: OverlayBlend; label: string }[] = [
  { id: 'normal', label: 'Normal' }, { id: 'screen', label: 'Screen' }, { id: 'multiply', label: 'Multiply' },
  { id: 'overlay', label: 'Overlay' }, { id: 'lighten', label: 'Lighten' }, { id: 'difference', label: 'Difference' },
];

const base = (): Omit<OverlayItem, 'id' | 'kind' | 'text' | 'start' | 'duration' | 'track'> => ({
  x: 50, y: 50, scale: 1, rotation: 0, opacity: 1, color: '#FFFFFF', bold: true, strokeWidth: 0, strokeColor: '#000000',
  shadow: false, glow: null, bg: null, animIn: { id: 'pop', duration: 0.35 }, animOut: { id: 'fade', duration: 0.25 }, loop: 'none',
});

/** Text looks that are common in TikTok, Reels and Shorts edits. */
export interface TextPreset { id: string; label: string; sample: string; apply: Partial<OverlayItem> }
export const TEXT_PRESETS: TextPreset[] = [
  { id: 'classic', label: 'Classic', sample: 'Aa', apply: { color: '#FFFFFF', strokeWidth: 9, strokeColor: '#000000', bold: true } },
  { id: 'tiktok', label: 'TikTok', sample: 'Aa', apply: { color: '#FFFFFF', strokeWidth: 0, shadow: true, bold: true, animIn: { id: 'pop', duration: 0.3 } } },
  { id: 'yellowBox', label: 'Yellow box', sample: 'Aa', apply: { color: '#111111', bg: { color: '#FFD400', opacity: 1, radius: 0.25 }, animIn: { id: 'slideUp', duration: 0.3 } } },
  { id: 'whiteBox', label: 'White box', sample: 'Aa', apply: { color: '#111111', bg: { color: '#FFFFFF', opacity: 1, radius: 0.3 } } },
  { id: 'blackBox', label: 'Dark plate', sample: 'Aa', apply: { color: '#FFFFFF', bg: { color: '#000000', opacity: 0.7, radius: 0.35 }, animIn: { id: 'fade', duration: 0.3 } } },
  { id: 'neonPink', label: 'Neon pink', sample: 'Aa', apply: { color: '#FFFFFF', glow: { color: '#FF2E93', radius: 1 }, animIn: { id: 'blurIn', duration: 0.4 }, loop: 'blink' } },
  { id: 'neonBlue', label: 'Neon blue', sample: 'Aa', apply: { color: '#E6FBFF', glow: { color: '#18D2FF', radius: 1 }, animIn: { id: 'blurIn', duration: 0.4 } } },
  { id: 'neonGreen', label: 'Neon green', sample: 'Aa', apply: { color: '#EFFFEA', glow: { color: '#39FF14', radius: 1 } } },
  { id: 'comic', label: 'Comic', sample: 'Aa', apply: { color: '#FFE600', strokeWidth: 12, strokeColor: '#E4002B', animIn: { id: 'bounce', duration: 0.45 }, loop: 'wiggle' } },
  { id: 'retro', label: 'Retro', sample: 'Aa', apply: { color: '#FF9ECF', strokeWidth: 8, strokeColor: '#3A1C71', shadow: true, italic: true } },
  { id: 'y2k', label: 'Y2K', sample: 'Aa', apply: { color: '#F4F7FF', strokeWidth: 6, strokeColor: '#7A5CFF', glow: { color: '#C8B6FF', radius: 0.7 }, italic: true, animIn: { id: 'glitch', duration: 0.4 } } },
  { id: 'glitch', label: 'Glitch', sample: 'Aa', apply: { color: '#FFFFFF', glow: { color: '#FF0055', radius: 0.5 }, animIn: { id: 'glitch', duration: 0.5 }, loop: 'glitch' } },
  { id: 'typewriter', label: 'Typewriter', sample: 'Aa', apply: { color: '#FFFFFF', bg: { color: '#000000', opacity: 0.55, radius: 0.1 }, bold: false, animIn: { id: 'typewriter', duration: 0.9 } } },
  { id: 'outline', label: 'Outline', sample: 'Aa', apply: { color: '#00000000', strokeWidth: 5, strokeColor: '#FFFFFF' } },
  { id: 'gold', label: 'Gold', sample: 'Aa', apply: { color: '#FFD76A', strokeWidth: 7, strokeColor: '#5A3A00', shadow: true, animIn: { id: 'zoom', duration: 0.4 } } },
  { id: 'fire', label: 'Fire', sample: 'Aa', apply: { color: '#FFEFB0', glow: { color: '#FF5A00', radius: 1 }, loop: 'pulse' } },
  { id: 'subtle', label: 'Subtle', sample: 'Aa', apply: { color: '#FFFFFF', bold: false, shadow: true, animIn: { id: 'fade', duration: 0.5 } } },
];

/** Stickers are drawn as text glyphs, so they need no image files and render the same in preview and export. */
export const STICKER_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Trending', items: ['🔥', '😂', '😍', '🥹', '😭', '💀', '✨', '💯', '🫶', '🙌', '👀', '🤯', '😎', '🥳', '🫠', '🤌'] },
  { label: 'Reactions', items: ['👍', '👏', '🙏', '💪', '🤝', '🤣', '😮', '😱', '🤔', '😴', '😡', '🥺', '🤩', '😅', '🙄', '😬'] },
  { label: 'Love', items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💘', '💕', '💞', '😘', '🌹', '💌', '💍'] },
  { label: 'Arrows & marks', items: ['➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '🔄', '✅', '❌', '⭐', '❗', '❓', '‼️', '💥', '⚡', '🔔'] },
  { label: 'Party', items: ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '👑', '💎', '🎂', '🍾', '🪩', '🎵', '🎶', '🎤', '🎧', '📸'] },
  { label: 'Sri Lanka', items: ['🇱🇰', '🥥', '🍛', '🐘', '🌴', '🌊', '🏏', '☕', '🛺', '🪔', '🌺', '🦚', '🌞', '🛕', '🍵', '🌶️'] },
  { label: 'Social', items: ['📱', '💬', '👤', '🔗', '📍', '🏷️', '🔖', '📌', '🛒', '💰', '📈', '🚀', '🆕', '🔝', '🆓', '▶️'] },
];

/** Word-art stickers: short labels that are everywhere on short video. */
export const BADGES: { id: string; text: string; apply: Partial<OverlayItem> }[] = [
  { id: 'new', text: 'NEW', apply: { color: '#FFFFFF', bg: { color: '#FF2D55', opacity: 1, radius: 0.5 } } },
  { id: 'live', text: '● LIVE', apply: { color: '#FFFFFF', bg: { color: '#E11D48', opacity: 1, radius: 0.25 }, loop: 'blink' } },
  { id: 'follow', text: 'FOLLOW', apply: { color: '#FFFFFF', bg: { color: '#FE2C55', opacity: 1, radius: 0.3 }, animIn: { id: 'bounce', duration: 0.5 } } },
  { id: 'sub', text: 'SUBSCRIBE', apply: { color: '#FFFFFF', bg: { color: '#FF0000', opacity: 1, radius: 0.2 }, animIn: { id: 'bounce', duration: 0.5 } } },
  { id: 'like', text: '👍 LIKE', apply: { color: '#111111', bg: { color: '#FFFFFF', opacity: 1, radius: 0.5 }, loop: 'heartbeat' } },
  { id: 'part2', text: 'PART 2', apply: { color: '#111111', bg: { color: '#FFD400', opacity: 1, radius: 0.15 } } },
  { id: 'wait', text: 'WAIT FOR IT…', apply: { color: '#FFFFFF', strokeWidth: 8, strokeColor: '#000000', loop: 'pulse' } },
  { id: 'pov', text: 'POV:', apply: { color: '#FFFFFF', bg: { color: '#000000', opacity: 0.65, radius: 0.35 } } },
  { id: 'sale', text: 'SALE 50%', apply: { color: '#FFFFFF', bg: { color: '#7C3AED', opacity: 1, radius: 0.2 }, loop: 'wiggle' } },
  { id: 'ad', text: 'AD', apply: { color: '#FFFFFF', bg: { color: '#00000099', opacity: 1, radius: 0.2 }, bold: false } },
];

export interface OverlayInit {
  kind: OverlayItem['kind'];
  text?: string;
  assetId?: string;
  imgW?: number;
  imgH?: number;
  start: number;
  duration: number;
  track?: number;
  apply?: Partial<OverlayItem>;
}

/** With `project`, the row is free of video clips too, and a new layer lands in front by default. */
export function makeOverlay(o: OverlayInit, list: OverlayItem[], project?: Project): OverlayItem {
  const duration = Math.max(MIN_OVERLAY, o.duration);
  const start = Math.max(0, o.start);
  const b = base();
  const item: OverlayItem = {
    ...b, id: nanoid(8), kind: o.kind, text: o.text ?? '', assetId: o.assetId, imgW: o.imgW, imgH: o.imgH,
    start, duration,
    track: project ? (o.track === undefined ? newLayerRow(project, start, duration) : freeLayerRow(project, start, duration, o.track)) : freeTrack(list, start, duration, o.track ?? 1),
    ...(o.kind === 'text' ? { y: 62 } : {}),
    ...(o.kind === 'sticker' ? { bold: false, animIn: { id: 'pop' as const, duration: 0.35 }, color: '#FFFFFF' } : {}),
    ...(o.kind === 'image' ? { animIn: { id: 'fade' as const, duration: 0.3 }, scale: 0.6 } : {}),
    ...o.apply,
  };
  return item;
}

/**
 * An image overlay from a B-roll-style placement. "Full" sizes the image to cover the frame (`frame` and `img` give the shapes when known;
 * otherwise it spans the frame's short side), "pip" is a card.
 */
export function brollOverlay(
  b: { assetId: string; start: number; end: number; mode?: 'fullscreen' | 'pip'; note?: string },
  list: OverlayItem[], frame?: { w: number; h: number }, img?: { w: number; h: number },
): OverlayItem {
  const o = makeOverlay({ kind: 'image', text: b.note ?? 'Image', assetId: b.assetId, imgW: img?.w, imgH: img?.h, start: b.start, duration: b.end - b.start }, list);
  if (b.mode === 'pip') return o;
  const fw = frame?.w || 1080, fh = frame?.h || 1920;
  const ia = img ? img.w / img.h : 1;
  const cover = Math.max(fw, fh * ia); // drawn width that covers the frame
  return { ...o, scale: cover / Math.min(fw, fh) / 0.7, animIn: { id: 'fade', duration: 0.2 } };
}

export const overlayEnd = (o: OverlayItem) => o.start + o.duration;
export const overlaysAt = (list: OverlayItem[], t: number) =>
  list.filter((o) => t >= o.start - 1e-6 && t < overlayEnd(o) - 1e-6).sort((a, b) => a.track - b.track);

export const overlayLabel = (o: OverlayItem) => (o.kind === 'motion' ? o.scene?.name ?? 'Motion' : o.kind === 'image' ? 'Image' : o.text.replace(/\s+/g, ' ').trim().slice(0, 24) || 'Text');

/** Fill in fields that older saved overlays may lack. */
export const withOverlayDefaults = (o: OverlayItem): OverlayItem => ({ ...base(), ...o });

// ---- Animation -------------------------------------------------------------

export interface OverlayPose {
  alpha: number; scale: number; sx: number; sy: number; dx: number; dy: number; rot: number; blur: number;
  /** Fraction of the text revealed, for the typewriter. */
  reveal: number;
  /** Reveal whole words instead of letters. */
  byWord: boolean;
  /** Wipe reveal from the left, 0..1 (1 = fully shown). */
  wipe: number;
  /** RGB-split distance in units of the overlay's height. */
  split: number;
}

const easeOutBack = (u: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
const easeOutBounce = (u: number) => { const n = 7.5625, d = 2.75; if (u < 1 / d) return n * u * u; if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75; if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375; return n * (u -= 2.625 / d) * u + 0.984375; };
const elastic = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(2, -10 * u) * Math.sin(((u * 10 - 0.75) * 2 * Math.PI) / 3) + 1);
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Pose at time `lt` (seconds since the overlay started). Offsets are in units of the frame (dx: of width, dy: of height). */
/** Overlay-local time scaled by the overlay's speed, for its loop and keyframes. */
export const overlayClock = (o: OverlayItem, lt: number) => lt * (o.speed || 1);

export type PoseSource = Pick<OverlayItem, 'animIn' | 'animOut' | 'loop' | 'duration' | 'speed'>;

export function overlayPose(o: PoseSource, lt: number): OverlayPose {
  const s: OverlayPose = { alpha: 1, scale: 1, sx: 1, sy: 1, dx: 0, dy: 0, rot: 0, blur: 0, reveal: 1, byWord: false, wipe: 1, split: 0 };
  const step = (id: OverlayAnimId, p: number, dir: 1 | -1) => { // p: 0 = hidden, 1 = settled
    const q = 1 - p;
    switch (id) {
      case 'fade': s.alpha *= p; break;
      case 'pop': s.scale *= Math.max(0, easeOutBack(p)); s.alpha *= Math.min(1, p * 4); break;
      case 'bounce': s.dy -= Math.abs(Math.sin(p * Math.PI * 3)) * q * 0.06; s.scale *= Math.max(0, easeOutBack(Math.min(1, p * 1.3))); break;
      case 'zoom': s.scale *= 1 + 1.5 * q * q; s.alpha *= p; break;
      case 'slideUp': s.dy += dir * q * 0.18; s.alpha *= p; break;
      case 'slideDown': s.dy -= dir * q * 0.18; s.alpha *= p; break;
      case 'slideLeft': s.dx += dir * q * 0.35; s.alpha *= p; break;
      case 'slideRight': s.dx -= dir * q * 0.35; s.alpha *= p; break;
      case 'spin': s.rot += dir * q * 360; s.scale *= p; s.alpha *= Math.min(1, p * 3); break;
      case 'shake': s.dx += Math.sin(p * 70) * 0.03 * q; s.alpha *= Math.min(1, p * 3); break;
      case 'blurIn': s.blur = Math.max(s.blur, q * 18); s.alpha *= 0.2 + 0.8 * p; s.scale *= 1 + 0.12 * q; break;
      case 'glitch': s.dx += (hash(Math.floor(p * 14)) - 0.5) * 0.06 * q; s.split = Math.max(s.split, q * 0.08); s.alpha *= hash(Math.floor(p * 18) + 3) > q * 0.6 ? 1 : 0.2; break;
      case 'typewriter': s.reveal = Math.min(s.reveal, p); break;
      case 'wipe': s.wipe = Math.min(s.wipe, p); break;
      case 'elastic': s.scale *= Math.max(0, elastic(p)); s.alpha *= Math.min(1, p * 5); break;
      case 'drop': s.dy -= dir * (1 - easeOutBounce(p)) * 0.3; s.alpha *= Math.min(1, p * 5); break;
      case 'swing': s.rot += Math.sin(p * 11) * q * 28; s.alpha *= Math.min(1, p * 4); break;
      case 'rubber': s.sx *= 1 + 0.4 * q * Math.sin(p * 15); s.sy *= 1 - 0.3 * q * Math.sin(p * 15); s.alpha *= Math.min(1, p * 5); break;
      case 'blink': s.alpha *= p >= 1 || Math.sin(p * 60) > -0.2 ? 1 : 0; break;
      case 'wordPop': s.reveal = Math.min(s.reveal, p); s.byWord = true; break;
      case 'rise': s.dy += dir * q * 0.08; s.alpha *= p; s.scale *= 0.9 + 0.1 * p; break;
      case 'spinZoom': s.rot += dir * q * 180; s.scale *= p; s.alpha *= Math.min(1, p * 3); break;
      case 'jelly': s.sx *= 1 + 0.3 * q * Math.sin(p * 18); s.sy *= 1 - 0.3 * q * Math.sin(p * 18); s.scale *= Math.max(0, easeOutBack(p)); break;
      case 'flip': s.sx *= Math.max(0.001, Math.abs(Math.cos((1 - p) * Math.PI / 2))); s.alpha *= Math.min(1, p * 3); break;
    }
  };
  const inLen = o.animIn.duration / (o.animIn.speed || 1), outLen = o.animOut.duration / (o.animOut.speed || 1);
  if (o.animIn.id !== 'none' && inLen > 0 && lt < inLen) step(o.animIn.id, easeOutCubic(Math.max(0, lt / inLen)), 1);
  const left = o.duration - lt;
  if (o.animOut.id !== 'none' && outLen > 0 && left < outLen) step(o.animOut.id === 'typewriter' ? 'fade' : o.animOut.id, Math.max(0, left / outLen), -1);
  lt *= o.speed || 1; // the loop runs on the sped-up clock
  switch (o.loop) {
    case 'pulse': s.scale *= 1 + 0.06 * Math.sin(lt * 5); break;
    case 'float': s.dy += Math.sin(lt * 2.2) * 0.012; break;
    case 'wiggle': s.rot += Math.sin(lt * 9) * 3.5; break;
    case 'swing': s.rot += Math.sin(lt * 3) * 9; break;
    case 'spin': s.rot += lt * 120; break;
    case 'blink': s.alpha *= Math.sin(lt * 7) > -0.3 ? 1 : 0.15; break;
    case 'heartbeat': s.scale *= 1 + 0.12 * Math.pow(Math.max(0, Math.sin((lt / 0.85) * Math.PI * 2)), 3); break;
    case 'tada': { const u = lt % 2.4; if (u < 0.8) { s.scale *= 1 + 0.08 * Math.sin(u * Math.PI / 0.8); s.rot += Math.sin(u * 22) * 5 * Math.sin(u * Math.PI / 0.8); } break; }
    case 'jelly': s.sx *= 1 + 0.06 * Math.sin(lt * 6); s.sy *= 1 - 0.06 * Math.sin(lt * 6); break;
    case 'shake': s.dx += Math.sin(lt * 40) * 0.006; s.dy += Math.cos(lt * 33) * 0.004; break;
    case 'breathe': s.scale *= 1 + 0.035 * Math.sin(lt * 2); s.alpha *= 0.85 + 0.15 * Math.sin(lt * 2 + 1); break;
    case 'glitch': { const k = Math.floor(lt * 12); if (hash(k) > 0.72) { s.dx += (hash(k + 4) - 0.5) * 0.05; s.split = Math.max(s.split, 0.05); } break; }
  }
  return s;
}
