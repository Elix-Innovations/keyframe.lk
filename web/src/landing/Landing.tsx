import Link from 'next/link';
import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AiMagicIcon, AudioWave01Icon, Clock01Icon, Download04Icon, KeyframesDoubleIcon, LaptopIcon, MusicNote01Icon,
  ShieldKeyIcon, SubtitleIcon, Tick02Icon, Upload04Icon, Video01Icon,
} from '@hugeicons/core-free-icons';
import { Logo, LogoMark } from '@/components/Logo';
import {
  Activity, ArrowLeft, Captions, CloudCheck, Copy, Download, Ellipsis, Film, Frame, Highlighter, Languages, LayoutTemplate,
  Play, Redo2, Save, Scissors, Search, Sparkles, Trash2, Type, Undo2, WandSparkles, ZoomIn, ZoomOut,
} from '@/components/icons';
import { Magnet, Music, Volume } from '@/components/icons-audio';
import { CopyButton } from './CopyButton';
import { LoopVideo } from './LoopVideo';
import { ReelFrame } from './ReelFrame';

type Icon = typeof SubtitleIcon;

const EDITOR = '/editor';
const START = '/editor#/new'; // opens a blank project straight in the workspace
const REPO = 'https://github.com/elixinnovations/keyframe-web';
const RELEASES = `${REPO}/releases/latest`;
const ELIX = 'https://elix.lk';

const INSTALL = `git clone ${REPO}.git keyframe
cd keyframe
npm run setup
npm run dev`;

/* ---------- primitives ---------- */

function GitHubMark({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Up-right arrow, as on the reference's buttons. */
function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  );
}

function Ico({ icon, className = 'size-5' }: { icon: Icon; className?: string }) {
  return <HugeiconsIcon icon={icon} className={className} strokeWidth={1.8} aria-hidden />;
}

/** Keyframe's own chip glyph: a solid keyframe diamond inside a thin outline, like a key on the timeline. */
function Mark({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path d="M8 .9 15.1 8 8 15.1.9 8Z" fill="none" stroke="currentColor" strokeWidth="1.1" opacity=".55" />
      <path d="M8 4 12 8 8 12 4 8Z" fill="currentColor" />
    </svg>
  );
}

function Diamond({ className = 'size-2.5 bg-[var(--rose)]' }: { className?: string }) {
  return <span aria-hidden className={`keyframe-diamond inline-block ${className}`} />;
}

function Button({ href, children, kind = 'rose', external, size = 'md' }: { href: string; children: ReactNode; kind?: 'rose' | 'white' | 'dark' | 'ghost'; external?: boolean; size?: 'md' | 'sm' }) {
  const cls = {
    rose: 'btn-rose',
    dark: 'bg-[var(--ink)] text-white hover:bg-black',
    white: 'bg-white text-[var(--ink)] border border-[var(--line)] shadow-sm hover:border-[var(--rose)]/50',
    ghost: 'border border-white/25 text-white hover:bg-white/10',
  }[kind];
  const h = size === 'md' ? 'h-11 px-5' : 'h-9 px-4';
  const props = external ? { target: '_blank', rel: 'noreferrer' } : {};
  return (
    <Link href={href} {...props} className={`group inline-flex ${h} items-center justify-center gap-2 rounded-full text-sm font-medium transition ${cls}`}>
      {children}
    </Link>
  );
}

/** Section eyebrow: a small diamond and an uppercase label. */
function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] uppercase ${light ? 'text-white' : 'text-[var(--ink)]'}`}>
      <Diamond className={`size-2 ${light ? 'bg-white' : 'bg-[var(--rose)]'}`} />{children}
    </p>
  );
}

function Heading({ eyebrow, title, children, light }: { eyebrow: string; title: ReactNode; children?: ReactNode; light?: boolean }) {
  return (
    <div className="reveal mx-auto max-w-2xl text-center">
      <Eyebrow light={light}>{eyebrow}</Eyebrow>
      <h2 className={`mt-4 text-4xl leading-[1.08] font-semibold tracking-[-0.04em] text-balance sm:text-[3.3rem] ${light ? 'text-white' : 'text-[var(--ink)]'}`}>{title}</h2>
      {children && <p className={`mx-auto mt-4 max-w-md text-[15px] leading-relaxed ${light ? 'text-white/85' : 'text-[var(--ink-2)]'}`}>{children}</p>}
    </div>
  );
}

/** Card with an illustration panel on top, title and copy below. `wash` gives it the rose gradient instead of grey. */
function ShowCard({ title, copy, children, panel = 'h-64', wash }: { title: string; copy: string; children: ReactNode; panel?: string; wash?: boolean }) {
  return (
    <article className={`reveal flex flex-col overflow-hidden rounded-[22px] border border-[var(--line)] ${wash ? 'bg-[linear-gradient(170deg,#f43f5e_0%,#ff8a80_45%,#ffe4dc_100%)]' : 'bg-[#f3f1f1]'}`}>
      <div aria-hidden className={`relative ${panel}`}>{children}</div>
      <div className="px-6 pt-6 pb-7">
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h3>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--ink-2)]">{copy}</p>
      </div>
    </article>
  );
}

// Ruler ticks for the hero texture: a long tick every 5th.
const TICKS = Array.from({ length: 27 }, (_, i) => i * 20);

/** Left hero texture: a ghost timeline. Ruler, clip blocks on tracks, a keyframe lane, a waveform and the playhead. */
function TimelineGhost({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 520 900" className={`absolute top-0 h-[56rem] w-auto ${className}`} fill="none" stroke="#fff" strokeOpacity=".24" strokeWidth="1.2">
      <path d="M0 130H520" />
      {TICKS.map((x, i) => <path key={x} d={`M${x} 130v${i % 5 ? 6 : 14}`} />)}
      {[200, 270, 340].map((y) => <path key={y} d={`M0 ${y + 22}H520`} strokeOpacity=".08" />)}
      <rect x="20" y="200" width="150" height="44" rx="12" /><rect x="182" y="200" width="210" height="44" rx="12" /><rect x="404" y="200" width="110" height="44" rx="12" />
      <rect x="60" y="270" width="240" height="44" rx="12" /><rect x="312" y="270" width="160" height="44" rx="12" />
      <rect x="20" y="340" width="120" height="44" rx="12" /><rect x="152" y="340" width="300" height="44" rx="12" />
      <path d="M0 440H520" />
      {[70, 190, 330, 450].map((x) => <path key={x} d={`M${x} 430l10 10-10 10-10-10Z`} fill="#fff" fillOpacity=".14" />)}
      {WAVE.slice(0, 40).map((h, i) => <path key={i} d={`M${20 + i * 12.5} ${520 - h * 0.4}V${520 + h * 0.4}`} strokeLinecap="round" />)}
      <rect x="20" y="600" width="490" height="120" rx="28" />
      <path d="M362 110V760" strokeOpacity=".5" />
      <path d="M362 102l8 8-8 8-8-8Z" fill="#fff" fillOpacity=".6" stroke="none" />
    </svg>
  );
}

/** Right hero texture: a ghost graph editor (easing curve with handles) above a selection box with resize handles. */
function GraphGhost({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 520 900" className={`absolute top-0 h-[56rem] w-auto ${className}`} fill="none" stroke="#fff" strokeOpacity=".24" strokeWidth="1.2">
      <rect x="40" y="150" width="460" height="300" rx="28" />
      {[225, 300, 375].map((y) => <path key={y} d={`M40 ${y}H500`} strokeOpacity=".08" />)}
      {[155, 270, 385].map((x) => <path key={x} d={`M${x} 150V450`} strokeOpacity=".08" />)}
      <path d="M80 410C240 410 300 190 460 190" strokeOpacity=".55" strokeWidth="1.6" />
      <path d="M80 410H210M460 190H330" strokeDasharray="3 4" />
      <circle cx="210" cy="410" r="6" /><circle cx="330" cy="190" r="6" />
      <path d="M80 400l10 10-10 10-10-10ZM460 180l10 10-10 10-10-10Z" fill="#fff" fillOpacity=".3" />
      <rect x="110" y="540" width="330" height="220" rx="4" strokeDasharray="5 5" />
      {[[110, 540], [440, 540], [110, 760], [440, 760], [275, 540], [275, 760], [110, 650], [440, 650]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - 6} y={y - 6} width="12" height="12" rx="3" fill="#fff" fillOpacity=".12" />)}
      <path d="M275 540V500" /><circle cx="275" cy="494" r="6" />
    </svg>
  );
}

/** Hairline with short glowing segments, the reference's lit edges. */
function Glint({ className }: { className: string }) {
  return <span aria-hidden className={`absolute bg-white shadow-[0_0_10px_1px_rgba(255,255,255,.7)] ${className}`} />;
}

/* ---------- nav ---------- */

const NAV = [['Features', '#features'], ['Benefits', '#benefits'], ['Pricing', '#pricing'], ['Install', '#install'], ['FAQ', '#faq']];

function Nav() {
  return (
    <header className="relative z-40">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" aria-label="Keyframe.lk home" className="flex items-center gap-2 text-white">
          <LogoMark size={28} className="rounded-lg ring-2 ring-white/40" />
          <span className="text-lg font-semibold tracking-tight">Keyframe<span className="text-white/70">.lk</span></span>
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-7 text-sm text-white/90 md:flex">
          {NAV.map(([label, href]) => <a key={href} href={href} className="transition-colors hover:text-white">{label}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <a href={REPO} target="_blank" rel="noreferrer" aria-label="Keyframe.lk on GitHub" className="hidden size-10 place-items-center rounded-full text-white transition-colors hover:bg-white/10 sm:grid"><GitHubMark /></a>
          <Button href={EDITOR} kind="dark">Open editor <Arrow /></Button>
        </div>
      </div>
    </header>
  );
}

/* ---------- hero ---------- */

const CAPTION = ['අද', 'video', 'එක', 'edit', 'කරමු'];
// Deterministic pseudo-waveform so server and client markup match.
const WAVE = Array.from({ length: 64 }, (_, i) => Math.round(28 + 62 * Math.abs(Math.sin(i * 0.61) * Math.cos(i * 0.17 + 1.3))));
// Mirrors the real editor (components/Editor.tsx): library rail on the left, inspector tabs on the right, timeline below.
const RAIL: [Ic, string][] = [[Film, 'Media'], [Captions, 'Captions'], [Type, 'Text'], [Volume, 'Sounds'], [Activity, 'Transitions'], [WandSparkles, 'Effects'], [Sparkles, 'Filters'], [LayoutTemplate, 'Templates']];
const TABS: [Ic, string][] = [[Type, 'Style'], [Highlighter, 'Display'], [Activity, 'Motion'], [Frame, 'Layout'], [Music, 'Audio']];
const MEDIA = [['style-highlight', '0:12'], ['style-punch', '0:09'], ['style-clean', '0:15'], ['hero', '0:06']];
const RULER = [0, 1, 2, 3, 4, 5, 6];
type Ic = (p: { className?: string }) => ReactNode;

/** Small square icon button like the editor header and timeline toolbar. */
function Tool({ icon: I, on }: { icon: Ic; on?: boolean }) {
  return <span className={`grid size-6 place-items-center rounded-md ${on ? 'bg-[var(--rose)]/15 text-[var(--rose)]' : 'text-[var(--subtle)]'}`}><I className="size-3.5" /></span>;
}

function Lane({ icon: I, h = 'h-7', children }: { icon: Ic; h?: string; children: ReactNode }) {
  return (
    <div className="flex items-stretch border-b border-[var(--line)] last:border-b-0">
      <span className={`grid w-10 shrink-0 place-items-center border-r border-[var(--line)] bg-white text-[var(--subtle)] ${h}`}><I className="size-3.5" /></span>
      <div className={`relative flex-1 px-1.5 py-1 ${h}`}>{children}</div>
    </div>
  );
}

function Prop({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-[var(--ink-2)]">{label}</p>
      {children ?? <p className="mt-1 flex h-7 items-center justify-between rounded-md border border-[var(--line)] bg-white px-2 text-[11px] text-[var(--ink)]">{value}<span className="text-[9px] text-[var(--subtle)]">▾</span></p>}
    </div>
  );
}

function EditorWindow() {
  return (
    <div className="relative overflow-hidden rounded-[18px] bg-[#ecebee] text-left shadow-[0_40px_100px_-40px_rgba(120,20,40,.55)]" aria-hidden>
      {/* header */}
      <div className="relative flex h-11 items-center gap-1.5 px-3">
        <Tool icon={ArrowLeft} />
        <LogoMark size={20} /><span className="text-xs font-semibold text-[var(--ink)]">Keyframe</span>
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 sm:flex">
          <span className="text-xs font-medium text-[var(--ink)]">My first reel</span>
          <span className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[9px] text-[var(--subtle)]"><CloudCheck className="size-3 text-emerald-600" />Saved</span>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <span className="hidden items-center gap-0.5 md:flex">{[Save, Undo2, Redo2, Languages, Ellipsis].map((I, i) => <Tool key={i} icon={I} />)}</span>
          <span className="btn-rose ml-1 flex h-7 items-center gap-1 rounded-lg px-2.5 text-[10px] font-medium"><Download className="size-3" />Export</span>
        </div>
      </div>

      <div className="grid gap-1.5 px-1.5 lg:grid-cols-[14rem_1fr_14rem]">
        {/* library: icon rail + media grid */}
        <aside className="hidden overflow-hidden rounded-xl border border-[var(--line)] bg-[#f8f7f9] lg:flex">
          <div className="flex w-14 shrink-0 flex-col gap-0.5 border-r border-[var(--line)] p-1">
            {RAIL.map(([I, l], i) => (
              <span key={l} className={`flex flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 text-[8px] leading-none ${i === 0 ? 'bg-[var(--rose)]/15 text-[var(--ink)]' : 'text-[var(--subtle)]'}`}>
                <I className={`size-3.5 ${i === 0 ? 'text-[var(--rose)]' : ''}`} />{l}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="border-b border-[var(--line)] p-1.5"><p className="flex h-6 items-center gap-1.5 rounded-md border border-[var(--line)] bg-white px-2 text-[9px] text-[var(--subtle)]"><Search className="size-3" />Search media</p></div>
            <div className="grid grid-cols-2 gap-1.5 p-1.5">
              {MEDIA.map(([m, d], i) => (
                <span key={m} className={`relative aspect-[9/14] overflow-hidden rounded-md bg-[#0d0a10] ${i === 0 ? 'ring-2 ring-[var(--rose)]' : ''}`}>
                  <img src={`/landing/${m}.jpg`} alt="" loading="lazy" className="size-full object-cover" />
                  <span className="mono absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[8px] text-white">{d}</span>
                </span>
              ))}
            </div>
          </div>
        </aside>

        {/* preview pane */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white">
          <div className="flex h-8 items-center justify-between border-b border-[var(--line)] px-3">
            <span className="text-[11px] font-semibold text-[var(--ink)]">Preview</span>
            <span className="mono text-[9px] text-[var(--subtle)]">1080 × 1920</span>
          </div>
          <div className="dot-grid relative grid flex-1 place-items-center bg-[#f6f5f7] px-4 py-5">
            <div className="relative aspect-[9/16] w-full max-w-[10.5rem] overflow-hidden rounded-lg bg-[#0d0a10] shadow-[0_20px_40px_-20px_rgba(31,22,34,.6)]">
              <ReelFrame overlay={
                <div className="absolute inset-x-3 bottom-[18%] text-center">
                  <p lang="si" className="font-sinhala flex flex-wrap justify-center gap-y-1 text-[0.95rem] leading-snug font-bold text-white [text-shadow:0_2px_14px_rgba(0,0,0,.7)]">
                    {CAPTION.map((w, i) => <span key={w} className="demo-word" style={{ ['--i' as string]: i }}>{w}</span>)}
                  </p>
                </div>
              } />
              {/* safe-zone guide, as the editor draws it */}
              <span className="pointer-events-none absolute inset-x-2 top-[8%] bottom-[16%] rounded border border-dashed border-white/35" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 border-t border-[var(--line)] py-1.5">
            <span className="mono demo-clock text-[10px] text-[var(--ink)]" />
            <span className="btn-rose grid size-6 place-items-center rounded-full"><Play className="size-3" /></span>
            <span className="mono text-[10px] text-[var(--subtle)]">00:06:00</span>
          </div>
        </div>

        {/* inspector: tab strip + style panel */}
        <aside className="hidden flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[#f8f7f9] lg:flex">
          <div className="flex gap-0.5 border-b border-[var(--line)] p-1">
            {TABS.map(([I, l], i) => (
              <span key={l} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[8px] leading-none ${i === 0 ? 'bg-[var(--rose)]/15 text-[var(--ink)]' : 'text-[var(--subtle)]'}`}>
                <I className={`size-3.5 ${i === 0 ? 'text-[var(--rose)]' : ''}`} />{l}
              </span>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-3 p-3">
            <Prop label="Font" value="FM Abhaya" />
            <Prop label="Size">
              <div className="relative mt-2 h-1 rounded-full bg-[var(--line)]"><div className="h-1 w-3/5 rounded-full bg-[var(--rose)]" /><span className="absolute top-1/2 left-3/5 size-3 -translate-1/2 rounded-full border-2 border-[var(--rose)] bg-white" /></div>
            </Prop>
            <Prop label="Highlight">
              <div className="mt-1 flex gap-1.5">
                {['var(--hot)', '#ffd84d', '#1f1622', '#fff'].map((c, i) => <span key={c} className={`size-4 rounded-full border border-[var(--line)] ${i === 0 ? 'ring-2 ring-[var(--rose)] ring-offset-1' : ''}`} style={{ background: c }} />)}
              </div>
            </Prop>
            <Prop label="Animation" value="Pop in" />
            <Prop label="Stroke">
              <div className="mt-1 grid grid-cols-3 gap-1 rounded-md bg-[var(--line)]/60 p-0.5 text-center text-[9px]">
                <span className="rounded bg-white py-0.5 font-medium shadow-sm">Off</span><span className="py-0.5 text-[var(--subtle)]">Thin</span><span className="py-0.5 text-[var(--subtle)]">Bold</span>
              </div>
            </Prop>
          </div>
        </aside>
      </div>

      {/* timeline pane */}
      <div className="m-1.5 overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <div className="flex h-8 items-center gap-0.5 border-b border-[var(--line)] px-1.5">
          {[Undo2, Redo2].map((I, i) => <Tool key={i} icon={I} />)}
          <span className="mx-1 h-4 w-px bg-[var(--line)]" />
          {[Scissors, Copy, Trash2].map((I, i) => <Tool key={i} icon={I} />)}
          <span className="mx-1 h-4 w-px bg-[var(--line)]" />
          <Tool icon={Magnet} on />
          <span className="ml-2 hidden text-[9px] text-[var(--subtle)] md:inline">5 captions · right-click a caption for more</span>
          <span className="ml-auto flex items-center gap-1.5"><Tool icon={ZoomOut} /><span className="relative h-1 w-16 rounded-full bg-[var(--line)]"><span className="absolute top-1/2 left-1/3 size-2.5 -translate-1/2 rounded-full border border-[var(--line)] bg-white shadow-sm" /></span><Tool icon={ZoomIn} /></span>
        </div>
        <div className="relative">
          <div className="flex h-5 border-b border-[var(--line)] bg-[#f8f7f9]">
            <span className="w-10 shrink-0 border-r border-[var(--line)] bg-white" />
            <div className="relative flex-1">
              {RULER.map((t) => <span key={t} className="mono absolute top-0 h-full border-l border-[var(--line)] pt-0.5 pl-1 text-[8px] text-[var(--subtle)]" style={{ left: `${(t / 6) * 96 + 1}%` }}>{t}s</span>)}
            </div>
          </div>
          <Lane icon={Captions}>
            <div className="flex h-full gap-1">
              {CAPTION.map((w, i) => <div key={w} lang="si" className={`font-sinhala grid min-w-0 place-items-center truncate rounded-lg border text-[9px] text-[var(--ink)] ${i === 1 ? 'border-[var(--rose)] bg-[var(--rose)]/40 shadow-sm' : 'border-[var(--rose)]/25 bg-[var(--rose)]/15'}`} style={{ flex: [1, 1.3, 0.8, 1.1, 1][i] }}>{w}</div>)}
            </div>
          </Lane>
          <Lane icon={Film} h="h-9">
            <div className="flex h-full gap-1">
              {[['style-highlight', 1.4], ['style-punch', 1], ['style-clean', 1.6]].map(([m, f]) => (
                <div key={m as string} className="overflow-hidden rounded-md border border-sky-500/40 bg-sky-500/10" style={{ flex: f as number, backgroundImage: `url(/landing/${m}.jpg)`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }} />
              ))}
            </div>
          </Lane>
          <Lane icon={Volume}>
            <div className="flex h-full items-center gap-[2px] rounded-md border border-[var(--ink)]/10 bg-[var(--ink)]/[.03] px-1">
              {WAVE.map((h, i) => <span key={i} className="demo-bar block flex-1 rounded-full bg-[var(--ink)]/35" style={{ height: `${h}%`, ['--i' as string]: i % 9 }} />)}
            </div>
          </Lane>
          <Lane icon={Music}>
            <div className="relative flex h-full items-center gap-[2px] overflow-hidden rounded-md border border-violet-500/40 bg-violet-500/10 px-1">
              <span className="absolute top-0 left-1.5 text-[8px] font-medium text-[var(--ink)]/80">♪ Sunny morning</span>
              {WAVE.map((h, i) => <span key={i} className="demo-duck mt-2 block flex-1 rounded-full bg-violet-500/50" style={{ height: `${20 + ((h * 7) % 45)}%` }} />)}
            </div>
          </Lane>
          {/* playhead */}
          <div className="pointer-events-none absolute top-0 right-1.5 bottom-0 left-[3.4rem] z-10">
            <span className="demo-head absolute inset-y-0 w-px bg-[var(--rose)] shadow-[0_0_12px_2px_rgba(232,52,79,.35)]">
              <span className="keyframe-diamond absolute -top-0.5 left-1/2 size-2.5 -translate-x-1/2 bg-[var(--rose)]" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* theme wash: rose (brand-1) only, lightening through rose tints, a soft blush bloom on the right, fading to the canvas at the bottom */}
      <div aria-hidden className="absolute inset-x-0 top-0 -z-20 h-[64rem] [mask-image:linear-gradient(180deg,#000_80%,transparent)] bg-[radial-gradient(42%_38%_at_86%_50%,color-mix(in_oklab,var(--rose)_35%,white),transparent_72%),radial-gradient(70%_32%_at_50%_100%,color-mix(in_oklab,var(--rose)_6%,white),transparent_75%),linear-gradient(180deg,var(--rose)_0%,var(--rose)_40%,color-mix(in_oklab,var(--rose)_80%,white)_60%,color-mix(in_oklab,var(--rose)_35%,white)_80%,var(--canvas)_100%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
        <TimelineGhost className="-left-24" />
        <GraphGhost className="-right-24" />
        {/* hairline under the nav, lit in two places */}
        <span className="absolute inset-x-0 top-20 h-px bg-white/15" />
        <Glint className="top-20 left-[31%] h-px w-28" />
        <Glint className="top-20 right-[31%] h-px w-28" />
        {/* the headline sits in a canvas safe zone: corner brackets and a lit playhead edge */}
        <span className="hud-corners absolute top-32 left-1/2 h-[30rem] w-[56rem] -translate-x-1/2 opacity-60">
          <Glint className="top-[18rem] -left-px h-20 w-px" />
          <Glint className="top-[20rem] -right-px h-16 w-px" />
        </span>
      </div>
      <Nav />
      <div className="mx-auto max-w-6xl px-5 pt-14 text-center sm:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur">
          <Mark />Sinhala, English and code-mixed
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-[2.7rem] leading-[1.04] font-semibold tracking-[-0.05em] text-balance text-white sm:text-6xl lg:text-[4.4rem]">
          Sinhala captions, timed to the frame.
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-white/90">
          Word-by-word captions, live FM fonts, music and 4K export, all in your browser. The video never leaves your computer.
        </p>
        {/* the reference's email pill, reworked: repo on the left, download on the right */}
        <div className="mx-auto mt-9 flex w-fit items-center gap-3 rounded-full bg-white/85 p-1.5 shadow-[0_20px_40px_-20px_rgba(120,20,40,.6)] backdrop-blur sm:pl-5">
          <a href={REPO} target="_blank" rel="noreferrer" className="hidden items-center gap-2 text-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink)] sm:flex">
            <GitHubMark /><span className="mono">elixinnovations/keyframe-web</span>
          </a>
          <Button href={RELEASES} kind="dark" external>Download for macOS <Arrow /></Button>
        </div>
        <p className="mt-4 text-sm text-white/90">
          or <Link href={START} className="font-medium text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">try it in your browser</Link>, no account needed
        </p>
      </div>
      {/* the editor inside a ghost browser frame, as in the reference */}
      <div className="mx-auto mt-16 max-w-5xl px-5">
        <div className="rounded-[30px] border border-white/45 bg-white/10 p-2 pt-0 backdrop-blur-sm sm:p-3 sm:pt-0">
          <div aria-hidden className="flex h-10 items-center gap-1.5 px-2">
            {[0, 1, 2].map((i) => <span key={i} className="size-3 rounded-full border border-white/60" />)}
            <span className="mx-auto h-4 w-1/3 rounded-full border border-white/50" />
          </div>
          <EditorWindow />
        </div>
      </div>
    </section>
  );
}

/* ---------- works-with strip ---------- */

const WORKS = ['ElevenLabs Scribe', 'Gemini', 'OpenAI Whisper', 'Claude', 'Jamendo', 'WebCodecs', 'RNNoise', 'Electron'];

function WorksWith() {
  return (
    <section className="mx-auto max-w-5xl px-5 pt-24 pb-6 text-center">
      <p className="text-sm font-medium text-[var(--ink)]">Built on the tools creators already trust</p>
      <p className="sr-only">{WORKS.join(', ')}</p>
      <div className="mask-x mt-8 overflow-hidden">
        <div className="marquee flex w-max gap-14" aria-hidden>
          {[...WORKS, ...WORKS].map((w, i) => (
            <span key={i} className="flex items-center gap-2 text-xl font-semibold tracking-[-0.03em] whitespace-nowrap text-[var(--ink)]/40"><Diamond className="size-3 bg-[var(--ink)]/30" />{w}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- features: 2 × 2 cards ---------- */

const WORDS = [['මම', '0.00'], ['software', '0.41'], ['engineering', '0.93'], ['කරනවා', '1.66']];

// Node graph: tags around a glowing hub. [label, x%, y%, tone]
const NODES: [string, number, number, string][] = [
  ['Captions', 24, 24, 'bg-[var(--rose)] text-white'], ['Fonts', 20, 42, 'bg-[var(--coral)] text-white'], ['Music', 24, 60, 'bg-[#f59e0b] text-white'], ['AI tools', 20, 78, 'bg-[#8b5cf6] text-white'],
  ['Timeline', 76, 24, 'bg-white text-[var(--ink)] border border-[var(--line)]'], ['Styles', 80, 42, 'bg-white text-[var(--ink)] border border-[var(--line)]'],
  ['Audio', 76, 60, 'bg-white text-[var(--ink)] border border-[var(--line)]'], ['Export', 80, 78, 'bg-white text-[var(--rose)] border border-[var(--rose)]/40'],
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-24">
      <Heading eyebrow="Features" title={<>Everything a reel needs,<br />in one editor</>}>
        Transcription is the first minute. The rest is typography, timing and export, and that is where Keyframe is built to be good.
      </Heading>
      <div className="mt-14 grid gap-5 md:grid-cols-2">
        <ShowCard wash title="Word-level transcription" copy="Sinhala, English and code-mixed speech with ElevenLabs Scribe, Gemini or Whisper. Every word gets its own timestamp.">
          <div className="absolute inset-x-8 top-8 rounded-2xl bg-white p-4 shadow-[0_20px_40px_-20px_rgba(120,20,40,.5)]">
            <p className="flex items-center justify-between text-xs font-medium text-[var(--ink)]">Transcript<span className="mono rounded-md bg-[var(--canvas)] px-2 py-0.5 text-[10px] text-[var(--ink-2)]">si + en</span></p>
            <div className="mt-3 space-y-1.5">
              {WORDS.map(([w, t], i) => (
                <div key={w} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${i === 1 ? 'bg-[var(--rose)]/8 ring-1 ring-[var(--rose)]/30' : 'bg-[var(--canvas)]'}`}>
                  <span className="flex items-center gap-2">{i === 1 ? <Mark className="size-3.5 text-[var(--rose)]" /> : <Ico icon={SubtitleIcon} className="size-3.5 text-[var(--subtle)]" />}<span lang="si" className="font-sinhala font-medium text-[var(--ink)]">{w}</span></span>
                  <span className="mono text-[11px] text-[var(--rose)]">{t}s</span>
                </div>
              ))}
            </div>
          </div>
        </ShowCard>
        <ShowCard title="Edit Unicode, render FM" copy="Type Unicode and see it live in legacy FM fonts. 25 built-in fonts, plus your own .ttf, .otf or .woff2 files.">
          <div className="absolute inset-x-8 top-8 bottom-0 rounded-t-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--ink)]">Caption text</span>
              <span className="relative h-6 w-28">
                <span className="mono demo-swap-a absolute inset-0 grid place-items-center rounded-full bg-[var(--canvas)] text-[10px] text-[var(--ink-2)]">UNICODE</span>
                <span className="mono demo-swap-b btn-rose absolute inset-0 grid place-items-center rounded-full text-[10px]">FM · drawn</span>
              </span>
            </div>
            <p lang="si" className="font-sinhala mt-6 text-center text-5xl font-bold text-[var(--ink)]">සිංහල</p>
            <div className="mt-6 flex justify-center gap-1.5">
              {['FM Abhaya', 'FM Malithi', 'Noto Sans'].map((f, i) => <span key={f} className={`rounded-full px-3 py-1 text-[11px] ${i === 0 ? 'bg-[var(--ink)] text-white' : 'border border-[var(--line)] text-[var(--ink-2)]'}`}>{f}</span>)}
            </div>
          </div>
        </ShowCard>
        <ShowCard title="One project, every layer" copy="Captions, fonts, music, styles and AI tools all hang off one timeline, with 14 animations, keyframes and speed curves.">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" fill="none">
            {NODES.map(([l, x, y]) => <path key={l} d={`M50 50 C ${(50 + x) / 2} 50, ${(50 + x) / 2} ${y}, ${x} ${y}`} stroke="#e2dada" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />)}
          </svg>
          {NODES.map(([l, x, y, tone]) => (
            <span key={l} className={`absolute -translate-1/2 rounded-full px-3 py-1 text-[11px] font-medium shadow-sm ${tone}`} style={{ left: `${x}%`, top: `${y}%` }}>{l}</span>
          ))}
          <span className="absolute top-1/2 left-1/2 grid size-16 -translate-1/2 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--rose),var(--coral))] text-white shadow-[0_0_0_8px_rgba(244,63,94,.12),0_0_50px_10px_rgba(244,63,94,.45)]">
            <Ico icon={KeyframesDoubleIcon} className="size-7" />
          </span>
        </ShowCard>
        <ShowCard title="Music that ducks under speech" copy="Jamendo library, beat detection and auto-ducking. Voice enhance, RNNoise denoise and LUFS mastering.">
          <div className="absolute inset-x-8 top-8 bottom-8 grid content-center gap-3 rounded-2xl bg-white p-5 shadow-sm">
            <p className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-medium text-[var(--ink)]"><Ico icon={MusicNote01Icon} className="size-3.5 text-[var(--coral)]" />Music</span><span className="mono text-[10px] text-[var(--rose)]">ducks under voice</span></p>
            <div className="flex h-10 items-end gap-[3px]">{Array.from({ length: 32 }, (_, i) => <span key={i} className="demo-duck block flex-1 rounded-sm bg-[var(--coral)]/70" style={{ height: `${40 + ((i * 37) % 55)}%` }} />)}</div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink)]"><Ico icon={AudioWave01Icon} className="size-3.5 text-[var(--rose)]" />Voice</p>
            <div className="flex h-10 items-end gap-[3px]">{Array.from({ length: 32 }, (_, i) => <span key={i} className="block flex-1 rounded-sm bg-[var(--ink)]/70" style={{ height: `${25 + ((i * 53) % 70)}%`, opacity: i > 9 && i < 25 ? 1 : 0.15 }} />)}</div>
          </div>
        </ShowCard>
      </div>
    </section>
  );
}

/* ---------- benefits: 3 × 2 ---------- */

const BENEFITS: [Icon, string, string][] = [
  [LaptopIcon, 'Renders on your device', 'Preview and export run in your browser with WebCodecs. No render queue, no upload wait.'],
  [ShieldKeyIcon, 'Only audio leaves', 'Only the extracted audio goes to the speech provider you pick, with your own key.'],
  [Clock01Icon, 'Timed to the frame', 'Word timestamps drive highlights, so emphasis lands on the beat every time.'],
  [Video01Icon, 'Vertical by default', 'Safe zones for Reels, TikTok and Shorts, and one renderer for preview and export.'],
  [Download04Icon, 'Export anywhere', 'MP4 up to 4K, MOV ProRes 4444 or WebM with alpha, plus SRT, VTT and ASS.'],
  [AiMagicIcon, 'AI when you want it', 'Emphasis words, hook lines, B-roll and proofreading with Gemini or Claude.'],
];

function Benefits() {
  return (
    <section id="benefits" className="mx-auto max-w-6xl px-5 pb-24">
      <Heading eyebrow="Benefits" title={<>The advantages your<br />reels get</>}>
        Built around how Sinhala reels are actually made: fast, vertical and mixed-language.
      </Heading>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map(([icon, t, d]) => (
          <article key={t} className="reveal rounded-[20px] border border-[var(--line)] bg-white p-6 transition-shadow hover:shadow-[0_20px_40px_-24px_rgba(120,20,40,.35)]">
            <span className="btn-rose grid size-9 place-items-center rounded-lg"><Ico icon={icon} className="size-[18px]" /></span>
            <h3 className="mt-8 text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-2)]">{d}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- steps ---------- */

function Steps() {
  return (
    <section id="steps" className="mx-auto max-w-6xl px-5 pb-24">
      <Heading eyebrow="How it works" title={<>From raw clip to reel<br />in 3 steps</>}>
        Drop it in, caption it, ship it. One editor and one project file the whole way.
      </Heading>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        <ShowCard title="1. Drop in a video" copy="Drag a clip into the editor. It stays on your disk, and only the audio goes out for transcription." panel="h-60">
          <div className="absolute inset-x-6 top-6 bottom-6 grid place-items-center rounded-2xl border-2 border-dashed border-[var(--rose)]/30 bg-white/70">
            <div className="text-center">
              <span className="demo-float btn-rose mx-auto grid size-14 place-items-center rounded-2xl"><Ico icon={Upload04Icon} className="size-6" /></span>
              <p className="mono mt-4 text-xs text-[var(--ink)]">reel_final.mp4</p>
              <div className="mx-auto mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full w-2/3 rounded-full bg-[var(--rose)]" /></div>
            </div>
          </div>
        </ShowCard>
        <ShowCard title="2. Caption and style" copy="Get word-by-word captions, then pick a template and tune fonts, colour, motion and music." panel="h-60">
          <div className="absolute inset-x-6 top-6 bottom-6 rounded-2xl bg-white p-4 shadow-sm">
            <p className="flex items-center justify-between text-xs font-medium text-[var(--ink)]">Captions<span className="flex gap-1">{['var(--rose)', 'var(--coral)', '#ffd84d'].map((c) => <i key={c} className="size-3 rounded-full" style={{ background: c }} />)}</span></p>
            <div className="mt-3 space-y-2">
              {([['0.00', 'අද video එක', true], ['1.20', 'edit කරමු', false], ['2.40', 'හරිම ලේසියි', false]] as const).map(([t, w, on]) => (
                <div key={t} className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs ${on ? 'bg-[var(--rose)]/8' : 'bg-[var(--canvas)]'}`}>
                  <span className="mono text-[10px] text-[var(--rose)]">{t}</span><span lang="si" className="font-sinhala text-[var(--ink)]">{w}</span>
                </div>
              ))}
            </div>
          </div>
        </ShowCard>
        <ShowCard title="3. Render and ship" copy="Export MP4 up to 4K on your own machine, or transparent MOV and WebM for other editors." panel="h-60">
          <div className="absolute inset-x-6 top-6 bottom-6 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-[var(--subtle)]">Export</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">2160 × 3840</p>
            <div className="mt-4 grid grid-cols-3 gap-1.5 text-center text-[10px]">
              {['MP4', 'MOV', 'WebM'].map((f, i) => <span key={f} className={`rounded-md py-1.5 ${i === 0 ? 'btn-rose' : 'bg-[var(--canvas)] text-[var(--ink-2)]'}`}>{f}</span>)}
            </div>
            <div className="mt-5 flex items-center justify-between text-[10px] text-[var(--subtle)]"><span>Rendering</span><span className="mono text-[var(--rose)]">87%</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full w-[87%] rounded-full bg-[linear-gradient(90deg,var(--rose),var(--coral))]" /></div>
          </div>
        </ShowCard>
      </div>
    </section>
  );
}

/* ---------- pricing (licence), nested-box cards ---------- */

const PLANS = [
  { name: 'Noncommercial', icon: LaptopIcon, price: 'Free', per: 'forever', note: 'For creators, students and personal channels.', cta: 'Open the editor', href: START, external: false, hot: true,
    items: ['Every editor feature', 'Unlimited projects', 'Unlimited exports', 'Your own speech keys', 'macOS desktop app', 'Source on GitHub'] },
  { name: 'Commercial', icon: KeyframesDoubleIcon, price: 'Licence', per: 'on request', note: 'For agencies, brands and paid client work.', cta: 'Contact Elix', href: ELIX, external: true, hot: false,
    items: ['Everything in Free', 'Paid and client work', 'Licence from Elix', 'Talk to us about setup'] },
];

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 pb-24">
      <Heading eyebrow="Pricing" title="Free to use. Fair for business.">
        Source-available under the PolyForm Noncommercial License 1.0.0.
      </Heading>
      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        {PLANS.map((p) => (
          <article key={p.name} className={`reveal rounded-[26px] p-2 ${p.hot ? 'bg-[linear-gradient(160deg,#ffd0c8,#ffe9e2_55%,#fff4f0)] shadow-[0_30px_60px_-36px_rgba(225,29,72,.7)]' : 'bg-[#f1eeee]'}`}>
            <div className="rounded-[20px] bg-white p-6 shadow-sm">
              <p className="flex items-center gap-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                <span className={`grid size-9 place-items-center rounded-xl ${p.hot ? 'btn-rose' : 'bg-[var(--canvas)] text-[var(--rose)]'}`}><Ico icon={p.icon} className="size-[18px]" /></span>{p.name}
              </p>
              <p className="mt-3 max-w-xs text-sm text-[var(--ink-2)]">{p.note}</p>
              <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
                <Button href={p.href} external={p.external} kind={p.hot ? 'rose' : 'white'}>{p.cta} <Arrow /></Button>
                <p className="flex items-baseline gap-1"><span className="text-4xl font-semibold tracking-[-0.05em] text-[var(--ink)]">{p.price}</span><span className="text-sm text-[var(--subtle)]">/{p.per}</span></p>
              </div>
            </div>
            <ul className="grid gap-x-6 gap-y-3 px-6 pt-6 pb-5 sm:grid-cols-2">
              {p.items.map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-sm text-[var(--ink)]">
                  <span className="grid size-4 place-items-center rounded-full bg-[var(--ink)] text-white"><Ico icon={Tick02Icon} className="size-2.5" /></span>{t}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- formats band (the reference's integrations strip) ---------- */

const FORMATS: [string, string, string][] = [
  ['MP4', 'up to 4K', 'top-[12%] left-[5%]'], ['MOV', 'ProRes 4444', 'top-[12%] left-[16%]'], ['WebM', 'with alpha', 'top-[52%] left-[24%]'],
  ['SRT', 'subtitles', 'top-[12%] right-[16%]'], ['VTT', 'web captions', 'top-[12%] right-[5%]'], ['ASS', 'styled subs', 'top-[52%] right-[24%]'],
];

function Formats() {
  return (
    <section className="relative isolate overflow-hidden py-28">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,var(--canvas)_0%,#ffb3a3_22%,#f43f5e_55%,#ff8a7a_80%,var(--canvas)_100%)]" />
      <div className="relative mx-auto max-w-6xl px-5">
        {FORMATS.map(([f, sub, pos], i) => (
          <span key={f} aria-hidden className={`absolute hidden flex-col items-center gap-2 lg:flex ${pos}`}>
            <span className="demo-float grid size-16 place-items-center rounded-2xl bg-white shadow-[0_16px_30px_-14px_rgba(120,20,40,.5)]" style={{ ['--i' as string]: i % 4 }}>
              <span className="mono bg-[linear-gradient(135deg,var(--rose),var(--coral))] bg-clip-text text-sm font-bold text-transparent">{f}</span>
            </span>
            <span className="rounded-md bg-white px-2 py-0.5 text-[10px] text-[var(--ink-2)] shadow-sm">{sub}</span>
          </span>
        ))}
        <Heading light eyebrow="Formats" title={<>Fits every<br />workflow</>}>
          Import SRT, VTT or ASS, and hand off video, alpha overlays or caption files to whatever comes next.
        </Heading>
        <div className="mt-8 flex justify-center"><Button href={START} kind="dark">Start captioning <Arrow /></Button></div>
      </div>
    </section>
  );
}

/* ---------- real reels in a masonry wall (no invented testimonials) ---------- */

const LOOKS = [
  { name: 'Word highlight', note: 'Each word lights as it is spoken.', clip: 'style-highlight' },
  { name: 'Bold punch', note: 'Big, centred, built for a thumb scroll.', clip: 'style-punch' },
  { name: 'Clean subtitle', note: 'A quiet lower third for talking heads.', clip: 'style-clean' },
];

function Reel({ i }: { i: number }) {
  const l = LOOKS[i];
  return (
    <figure className="reveal overflow-hidden rounded-[22px] border border-[var(--line)] bg-white p-2">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#0d0a10]">
        <LoopVideo src={`/landing/${l.clip}.mp4`} poster={`/landing/${l.clip}.jpg`} className="absolute inset-0 size-full object-cover" />
        <span className="mono absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] text-[var(--ink)]">STYLE / 0{i + 1}</span>
      </div>
      <figcaption className="px-3 pt-3 pb-2">
        <span className="block text-sm font-semibold text-[var(--ink)]">{l.name}</span>
        <span className="block text-xs text-[var(--ink-2)]">{l.note}</span>
      </figcaption>
    </figure>
  );
}

function Fact({ tone, tag, children, foot }: { tone: 'dark' | 'rose' | 'white'; tag: string; children: ReactNode; foot: string }) {
  const cls = { dark: 'bg-[var(--ink)] text-white', rose: 'bg-[linear-gradient(160deg,#f43f5e,#ff7a6e)] text-white', white: 'border border-[var(--line)] bg-white text-[var(--ink)]' }[tone];
  return (
    <article className={`reveal flex flex-col justify-between gap-10 rounded-[22px] p-7 ${cls}`}>
      <div>
        <p className={`text-[11px] font-medium tracking-[0.14em] uppercase ${tone === 'white' ? 'text-[var(--rose)]' : 'text-white/70'}`}>{tag}</p>
        <p className="mt-4 text-xl leading-snug font-medium tracking-[-0.02em]">{children}</p>
      </div>
      <p className={`flex items-center gap-2.5 text-xs ${tone === 'white' ? 'text-[var(--ink-2)]' : 'text-white/75'}`}><LogoMark size={22} className="rounded-md" />{foot}</p>
    </article>
  );
}

function Reels() {
  return (
    <section id="styles" className="mx-auto max-w-6xl px-5 py-24">
      <Heading eyebrow="Made with Keyframe" title="See the captions in action">
        Real reels captioned in Keyframe. Every style is editable word by word.
      </Heading>
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        <div className="grid content-start gap-4">
          <Fact tone="dark" tag="Word highlight" foot="Timed from word-level transcripts">Every word lights up the moment it is spoken, so emphasis lands on the beat.</Fact>
          <Reel i={0} />
        </div>
        <div className="grid content-start gap-4">
          <Reel i={1} />
          <Fact tone="white" tag="FM fonts" foot="25 built-in fonts">Type in Unicode. The canvas draws legacy FM fonts live, no converter round trips.</Fact>
        </div>
        <div className="grid content-start gap-4">
          <Fact tone="rose" tag="One renderer" foot="WebCodecs · up to 4K">Preview and export share one renderer, so what you see is the file you get.</Fact>
          <Reel i={2} />
        </div>
      </div>
    </section>
  );
}

/* ---------- install ---------- */

function Install() {
  return (
    <section id="install" className="mx-auto max-w-6xl px-5 pb-24">
      <Heading eyebrow="Install" title="Four commands. Then you are captioning.">
        You need Node, Python with uv, and one speech provider key.
      </Heading>
      <div className="mt-14 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="reveal min-w-0 overflow-hidden rounded-[22px] bg-[var(--ink)] shadow-[0_30px_70px_-34px_rgba(31,22,34,.7)]">
          <div className="mono flex items-center justify-between border-b border-white/10 px-5 py-3 text-[11px] text-white/55">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#ff5f57]/80" /><i className="size-2.5 rounded-full bg-[#febc2e]/80" /><i className="size-2.5 rounded-full bg-[#28c840]/80" /><span className="ml-2">~/keyframe</span></span>
            <CopyButton text={INSTALL} />
          </div>
          <pre className="mono overflow-x-auto p-6 text-[13px] leading-7 text-white/90">
            {INSTALL.split('\n').map((l) => <span key={l} className="block whitespace-pre"><span className="mr-3 text-[var(--coral)] select-none">$</span>{l}</span>)}
            <span className="mt-2 block text-white/45"># add a key to server/.env, then open http://localhost:5180</span>
          </pre>
        </div>
        <div className="reveal flex flex-col justify-between gap-8 rounded-[22px] border border-[var(--line)] bg-white p-7">
          <div>
            <span className="btn-rose grid size-9 place-items-center rounded-lg"><Ico icon={LaptopIcon} className="size-[18px]" /></span>
            <p className="mt-6 text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">Prefer an app?</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-2)]">A macOS build is on the releases page. Same editor, packaged with Electron.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button href={RELEASES} external>Download for macOS</Button>
            <Button href={REPO} kind="white" external><GitHubMark />GitHub</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- faq, two columns ---------- */

const FAQ = [
  ['Does my video get uploaded?', 'No. Rendering and export run in your browser, so the video stays on your computer. Only the audio track is sent to the transcription provider you configure. The optional AI tools send caption text, plus any images you ask it to place as B-roll.'],
  ['Which languages work?', 'Sinhala, English and code-mixed speech such as "මම software engineering කරනවා", in Unicode and legacy FM fonts.'],
  ['What do I need to run it?', 'Node and Python locally, plus an API key for transcription (ElevenLabs, Gemini or OpenAI). The setup steps are in the README.'],
  ['What can I export?', 'MP4 up to 4K, transparent MOV (ProRes 4444) or WebM for other editors, and SRT, VTT and ASS caption files.'],
  ['Can I use FM fonts?', 'Yes. Type Unicode and it renders in FM fonts live, or convert text with the built-in converter. The FM fonts themselves are fetched separately and are not covered by the project license.'],
  ['Is it free to use?', 'Free for noncommercial use under the PolyForm Noncommercial License 1.0.0. Commercial use needs a separate license from Elix Innovations.'],
];

function Faq() {
  return (
    <section id="faq" className="mx-auto grid max-w-6xl gap-10 px-5 pb-28 lg:grid-cols-[1fr_1.4fr]">
      <div className="reveal">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-[-0.045em] text-[var(--ink)] sm:text-[3.3rem]">Your questions<br />answered</h2>
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--ink-2)]">Something else? Open an issue on GitHub and we will get back to you.</p>
        <div className="mt-6"><Button href={`${REPO}/issues`} kind="white" external size="sm">Ask on GitHub <Arrow /></Button></div>
      </div>
      <div className="reveal divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {FAQ.map(([q, a], i) => (
          <details key={q} open={i === 0} className="group py-5">
            <summary className="flex cursor-pointer items-center justify-between gap-6 text-base font-medium tracking-[-0.01em] text-[var(--ink)]">
              {q}
              <span aria-hidden className="faq-plus grid size-7 shrink-0 place-items-center rounded-full border border-[var(--line)] text-base leading-none text-[var(--rose)] transition-transform">+</span>
            </summary>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--ink-2)]">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ---------- dark cta band + footer ---------- */

function Cta() {
  return (
    <section className="relative isolate overflow-hidden bg-[#140d12] px-5 py-28 text-center">
      <div aria-hidden className="absolute bottom-[-12rem] left-1/2 -z-10 h-[24rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(244,63,94,.55),transparent)] blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
        <span className="absolute top-20 left-[-4rem] h-48 w-80 rounded-[26px] border border-white/10" />
        <span className="absolute top-20 right-[-4rem] h-48 w-80 rounded-[26px] border border-white/10" />
        {/* side fragments of the editor */}
        <div className="absolute top-28 left-12 w-56 -rotate-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur">
          <p className="text-[10px] text-white/50">Captions</p>
          {['අද video එක', 'edit කරමු'].map((w, i) => <p key={w} lang="si" className={`font-sinhala mt-2 rounded-lg px-2.5 py-1.5 text-xs ${i === 0 ? 'bg-[var(--rose)] text-white' : 'bg-white/10 text-white/80'}`}>{w}</p>)}
        </div>
        <div className="absolute right-12 bottom-24 w-56 rotate-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur">
          <p className="flex justify-between text-[10px] text-white/50">Export<span className="mono text-[var(--coral)]">4K</span></p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[72%] rounded-full bg-[linear-gradient(90deg,var(--rose),var(--coral))]" /></div>
          <div className="mt-3 flex h-6 items-end gap-[2px]">{WAVE.slice(0, 28).map((h, i) => <span key={i} className="block flex-1 rounded-full bg-white/30" style={{ height: `${h}%` }} />)}</div>
        </div>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white"><Mark />Free · source available</span>
      <h2 className="mx-auto mt-6 max-w-2xl text-4xl leading-[1.05] font-semibold tracking-[-0.045em] text-balance text-white sm:text-6xl">Your next reel, captioned before the kettle boils.</h2>
      <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/70">Open the editor in your browser. No account, no upload.</p>
      <div className="mt-9 flex flex-wrap justify-center gap-2">
        <Button href={START}>Open the editor <Arrow /></Button>
        <Button href="#install" kind="ghost">Run it locally</Button>
      </div>
    </section>
  );
}

const FOOT: [string, [string, string][]][] = [
  ['Sections', [['Features', '#features'], ['Benefits', '#benefits'], ['Pricing', '#pricing'], ['FAQ', '#faq']]],
  ['Project', [['GitHub', REPO], ['Docs', `${REPO}#readme`], ['Releases', RELEASES], ['Issues', `${REPO}/issues`]]],
  ['Company', [['Elix Innovations', ELIX], ['Open editor', EDITOR]]],
];

function Footer() {
  return (
    <footer className="bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-5 py-16 md:grid-cols-[1.8fr_repeat(3,1fr)]">
        <div className="col-span-2 md:col-span-1">
          <Logo size={44} withWordmark />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-[var(--ink-2)]">Sinhala caption video editor with auto captions, live FM fonts, music and on-device export.</p>
          <a href={REPO} target="_blank" rel="noreferrer" aria-label="Keyframe.lk on GitHub" className="mt-5 inline-grid size-9 place-items-center rounded-full border border-[var(--line)] text-[var(--ink)] hover:text-[var(--rose)]"><GitHubMark /></a>
        </div>
        {FOOT.map(([h, links]) => (
          <nav key={h} aria-label={h}>
            <p className="text-sm font-semibold text-[var(--ink)]">{h}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-[var(--ink-2)]">
              {links.map(([l, href]) => <li key={l}><a href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})} className="hover:text-[var(--rose)]">{l}</a></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 border-t border-[var(--line)] px-5 py-6 text-xs text-[var(--subtle)]">
        <span>© 2026 Elix Innovations · Keyframe.lk</span>
        <span>Source available under PolyForm Noncommercial 1.0.0</span>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="landing min-h-screen bg-[var(--canvas)] text-[var(--ink)] antialiased">
      <main>
        <Hero />
        <WorksWith />
        <Features />
        <Benefits />
        <Steps />
        <Pricing />
        <Formats />
        <Reels />
        <Install />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
