import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { CopyButton } from './CopyButton';
import { LoopVideo } from './LoopVideo';
import { ReelFrame } from './ReelFrame';

const EDITOR = '/editor';
const START = '/editor#/new'; // opens a blank project straight in the workspace
const REPO = 'https://github.com/elixinnovations/keyframe-web';
const RELEASES = `${REPO}/releases/latest`;

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

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function Check() {
  return (
    <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--mint)]/35 text-[var(--mint-ink)]">
      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>
    </span>
  );
}

function Button({ href, children, kind = 'primary', external }: { href: string; children: ReactNode; kind?: 'primary' | 'ghost' | 'white'; external?: boolean }) {
  const cls = {
    primary: 'bg-[var(--ink)] text-white shadow-[0_14px_30px_-12px_rgba(27,30,54,.55)] hover:bg-[var(--cobalt)]',
    white: 'bg-white text-[var(--ink)] border border-[var(--line)] shadow-[0_8px_24px_-14px_rgba(27,30,54,.35)] hover:border-[var(--cobalt)]/50',
    ghost: 'text-[var(--ink)] hover:text-[var(--cobalt)]',
  }[kind];
  const props = external ? { target: '_blank', rel: 'noreferrer' } : {};
  return (
    <Link href={href} {...props} className={`group inline-flex h-12 items-center gap-2.5 rounded-full px-6 text-sm font-medium transition-colors ${cls}`}>
      {children}
    </Link>
  );
}

/** Two-tone heading: the first line in ink, the second softened. */
function SectionHead({ index, label, lead, soft, children }: { index: string; label: string; lead: string; soft: string; children?: ReactNode }) {
  return (
    <div className="reveal grid items-end gap-8 md:grid-cols-[1.5fr_1fr]">
      <div>
        <p className="mono text-xs tracking-[0.14em] text-[var(--subtle)] uppercase">{index} / {label}</p>
        <h2 className="mt-5 text-4xl leading-[1.04] font-[450] tracking-[-0.04em] text-balance text-[var(--ink)] sm:text-6xl">
          {lead}<br /><span className="text-[var(--ink-2)]">{soft}</span>
        </h2>
      </div>
      {children && <p className="max-w-md text-base leading-relaxed text-[var(--ink-2)] md:justify-self-end">{children}</p>}
    </div>
  );
}

/* ---------- nav ---------- */

const NAV = [['Features', '#features'], ['Privacy', '#privacy'], ['Specs', '#specs'], ['Install', '#install'], ['FAQ', '#faq']];

function Nav() {
  return (
    <header className="sticky top-0 z-40">
      <div className="border-b border-[var(--line)] bg-white/70 py-2 text-center text-xs text-[var(--ink-2)] backdrop-blur-xl">
        Free for noncommercial use, with the source on GitHub.{' '}
        <a href={REPO} target="_blank" rel="noreferrer" className="font-medium text-[var(--ink)] underline-offset-4 hover:underline">Get the code →</a>
      </div>
      <div className="border-b border-[var(--line)] bg-[#f6f7fb]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" aria-label="Keyframe.lk home" className="text-[var(--ink)]"><Logo size={28} withWordmark /></Link>
          <nav aria-label="Sections" className="hidden items-center gap-8 text-sm text-[var(--ink-2)] md:flex">
            {NAV.map(([label, href]) => <a key={href} href={href} className="transition-colors hover:text-[var(--ink)]">{label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <a href={REPO} target="_blank" rel="noreferrer" aria-label="Keyframe.lk on GitHub" className="grid size-10 place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--ink)] transition-colors hover:border-[var(--cobalt)]/50"><GitHubMark /></a>
            <Link href={EDITOR} className="inline-flex h-10 items-center rounded-full bg-[var(--ink)] px-5 text-sm font-medium text-white transition-colors hover:bg-[var(--cobalt)]">Open editor</Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ---------- hero: original silk ribbons + a sample-project console ---------- */

function Silk() {
  return (
    <svg aria-hidden viewBox="0 0 1440 420" preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full [mask-image:linear-gradient(to_bottom,transparent,#000_16%,#000_84%,transparent)]">
      <defs>
        <linearGradient id="sk-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2f5ae6" /><stop offset=".3" stopColor="#7fa2ff" /><stop offset=".48" stopColor="#3f6df0" /><stop offset=".72" stopColor="#b9ccff" /><stop offset="1" stopColor="#eef3ff" /></linearGradient>
        <linearGradient id="sk-blue2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9db8ff" /><stop offset=".5" stopColor="#e1eaff" /><stop offset="1" stopColor="#f6f8ff" /></linearGradient>
        <linearGradient id="sk-lilac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8a78f5" /><stop offset=".28" stopColor="#c5b9ff" /><stop offset=".45" stopColor="#7d6bf0" /><stop offset=".72" stopColor="#d9d0ff" /><stop offset="1" stopColor="#f3f0ff" /></linearGradient>
        <linearGradient id="sk-peach" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff8a4d" /><stop offset=".3" stopColor="#ffc09a" /><stop offset=".5" stopColor="#ff9a64" /><stop offset=".78" stopColor="#ffd9c2" /><stop offset="1" stopColor="#fff3ea" /></linearGradient>
        <linearGradient id="sk-sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <filter id="sk-soft" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="3" /></filter>
        <filter id="sk-haze" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="16" /></filter>
      </defs>
      <g className="silk-a">
        <path d="M-120 420 L-120 250 C 90 140, 300 130, 490 214 S 770 332, 920 300 S 1110 236, 1200 304 L1200 420 Z" fill="url(#sk-blue)" />
        <path d="M-120 420 L-120 338 C 70 250, 250 252, 410 322 S 650 420, 710 420 Z" fill="url(#sk-blue2)" opacity=".92" />
        <path d="M-60 262 C 120 168, 310 162, 480 236" stroke="url(#sk-sheen)" strokeWidth="5" fill="none" filter="url(#sk-soft)" />
      </g>
      <g className="silk-b">
        <path d="M280 420 C 410 250, 600 104, 830 114 S 1130 184, 1190 300 S 1260 396, 1290 420 Z" fill="url(#sk-lilac)" />
        <path d="M360 420 C 480 296, 640 188, 840 198 C 980 204, 1086 252, 1140 336" stroke="#fff" strokeOpacity=".4" strokeWidth="34" fill="none" filter="url(#sk-haze)" />
        <path d="M420 300 C 560 170, 760 126, 940 160" stroke="url(#sk-sheen)" strokeWidth="5" fill="none" filter="url(#sk-soft)" />
        <path d="M880 420 C 980 250, 1130 76, 1300 66 S 1500 130, 1550 196 L1550 420 Z" fill="url(#sk-peach)" />
        <path d="M1040 420 C 1110 300, 1230 196, 1360 184 L1550 184 L1550 420 Z" fill="#fff" opacity=".28" />
        <path d="M980 290 C 1090 160, 1230 100, 1370 112" stroke="url(#sk-sheen)" strokeWidth="5" fill="none" filter="url(#sk-soft)" />
      </g>
    </svg>
  );
}

const CAPTION = ['අද', 'video', 'එක', 'edit', 'කරමු'];
const WORD_TIMES = ['0.00', '1.20', '2.40', '3.60', '4.80'];
// Deterministic pseudo-waveform so server and client markup match.
const WAVE = Array.from({ length: 72 }, (_, i) => Math.round(28 + 62 * Math.abs(Math.sin(i * 0.61) * Math.cos(i * 0.17 + 1.3))));

function Track({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[2rem_1fr] items-center gap-3">
      <span className="mono text-[10px] tracking-wider text-[var(--subtle)]">{label}</span>
      {children}
    </div>
  );
}

function Console() {
  return (
    <div className="glass relative overflow-hidden rounded-[28px]" aria-hidden>
      <div className="mono flex items-center justify-between border-b border-[var(--line)] px-5 py-3 text-[11px] text-[var(--subtle)]">
        <span className="flex items-center gap-2.5">
          <span className="demo-rec size-1.5 rounded-full bg-[var(--flag)]" />
          1080×1920 · 30 fps
          <span className="rounded-full border border-[var(--line)] bg-white/80 px-2 py-0.5 text-[10px]">Sample project</span>
        </span>
        <span className="demo-clock text-[var(--cobalt)]" />
      </div>

      <div className="grid md:grid-cols-[15rem_1fr]">
        <div className="border-b border-[var(--line)] p-4 md:border-r md:border-b-0">
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[13.5rem] overflow-hidden rounded-2xl bg-[#0a0a14] p-2 shadow-[0_20px_40px_-20px_rgba(27,30,54,.55)]">
            <ReelFrame overlay={
              <div className="absolute inset-x-3 bottom-[18%] text-center">
                <p lang="si" className="font-sinhala flex flex-wrap justify-center gap-y-1 text-[1.15rem] leading-snug font-bold text-white [text-shadow:0_2px_14px_rgba(0,0,0,.7)]">
                  {CAPTION.map((w, i) => <span key={w} className="demo-word" style={{ ['--i' as string]: i }}>{w}</span>)}
                </p>
              </div>
            } />
            <div className="hud-corners pointer-events-none absolute inset-1.5" />
            <div className="absolute inset-x-3 top-2.5 flex justify-between"><span className="mono text-[9px] text-white/70">SAFE 9:16</span><span className="mono text-[9px] text-white/70">REELS</span></div>
            <div className="absolute inset-4 rounded-sm border border-dashed border-white/25" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="grid grid-cols-5 divide-x divide-[var(--line)] border-b border-[var(--line)]">
            {CAPTION.map((w, i) => (
              <div key={w} className="px-3 py-3">
                <p className="mono text-[10px] text-[var(--subtle)]">{WORD_TIMES[i]}s</p>
                <p lang="si" className="font-sinhala mt-1 truncate text-xs text-[var(--ink)]">{w}</p>
              </div>
            ))}
          </div>

          <div className="relative flex flex-1 flex-col justify-center gap-3 p-4">
            {/* playhead: spans only the track lane (label column 2rem + gap 0.75rem) */}
            <div aria-hidden className="pointer-events-none absolute top-3 right-4 bottom-3 left-[3.75rem] z-10">
              <span className="demo-head absolute inset-y-0 w-px bg-[var(--cobalt)] shadow-[0_0_12px_2px_rgba(47,90,230,.35)]">
                <span className="keyframe-diamond absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 bg-[var(--cobalt)]" />
              </span>
            </div>
            <Track label="">
              <div className="mono flex justify-between text-[9px] text-[var(--subtle)]"><span>0s</span><span>1s</span><span>2s</span><span>3s</span><span>4s</span><span>5s</span><span>6s</span></div>
            </Track>
            <Track label="VID">
              <div className="flex h-7 gap-1">
                {[1.4, 1, 1.6].map((w, i) => <div key={i} className="rounded-md border border-[var(--line)] bg-[var(--tint)] bg-[repeating-linear-gradient(90deg,rgba(27,30,54,.07)_0_1px,transparent_1px_14px)]" style={{ flex: w }} />)}
              </div>
            </Track>
            <Track label="CAP">
              <div className="flex h-7 gap-1">
                {[1, 1.3, 0.8, 1.1, 1].map((w, i) => <div key={i} className="mono grid place-items-center rounded-md border border-[var(--cobalt)]/25 bg-[var(--cobalt)]/10 text-[9px] text-[var(--cobalt)]" style={{ flex: w }}>{`c${i + 1}`}</div>)}
              </div>
            </Track>
            <Track label="FX">
              <div className="relative h-6">
                <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--line)]" />
                {[6, 21, 38, 52, 69, 86].map((l) => <span key={l} className="keyframe-diamond absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 bg-[var(--azure)]" style={{ left: `${l}%` }} />)}
              </div>
            </Track>
            <Track label="VOX">
              <div className="flex h-10 items-center gap-[2px]">
                {WAVE.map((h, i) => <span key={i} className="demo-bar block flex-1 rounded-full bg-[var(--ink)]/30" style={{ height: `${h}%`, ['--i' as string]: i % 9 }} />)}
              </div>
            </Track>
            <Track label="MUS">
              <div className="flex h-8 items-center gap-[2px]">
                {WAVE.map((h, i) => <span key={i} className="demo-duck block flex-1 rounded-full bg-[var(--lilac)]" style={{ height: `${30 + ((h * 7) % 60)}%` }} />)}
              </div>
            </Track>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-5 pt-16 text-center sm:pt-24">
        <p className="mono inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/80 px-3.5 py-1.5 text-[11px] text-[var(--ink-2)] backdrop-blur">
          <span className="size-1.5 rounded-full bg-[var(--cobalt)]" />Source available · runs on your machine · සිංහල first
        </p>
        <h1 className="mx-auto mt-7 max-w-4xl text-[2.7rem] leading-[1.02] font-[450] tracking-[-0.045em] text-balance text-[var(--ink)] sm:text-7xl lg:text-[5.2rem]">
          Sinhala captions.<br /><span className="text-[var(--ink-2)]">Timed to the frame.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-[var(--ink-2)]">
          Drop in a reel and get word-by-word captions in Sinhala, English or both in one sentence. Style them, score them, and render up to 4K without the video leaving your computer.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button href={START}>Start a project <Arrow /></Button>
          <Button href={REPO} kind="ghost" external><GitHubMark />View source <Arrow /></Button>
        </div>
      </div>
      <div aria-hidden className="relative -mt-2 h-[24rem] sm:h-[30rem]"><Silk /></div>
      <div className="relative z-10 mx-auto -mt-48 max-w-6xl px-5 pb-24 sm:-mt-60"><Console /></div>
    </section>
  );
}

/* ---------- pipeline ---------- */

const STEPS = [
  ['Ingest', 'Drop a video. It stays on disk.'],
  ['Transcribe', 'Audio only, to the provider you choose.'],
  ['Style', 'Fonts, highlights, motion and music.'],
  ['Render', 'WebCodecs on your GPU. MP4, MOV, WebM.'],
];

function Pipeline() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-32">
      <SectionHead index="01" label="How it works" lead="Drop it in. Caption it." soft="Ship it.">
        Four steps from raw clip to a finished render, all in one editor and one project file.
      </SectionHead>
      <ol className="relative mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <span aria-hidden className="absolute top-6 right-6 left-6 hidden h-px bg-gradient-to-r from-[var(--azure)]/60 via-[var(--lilac)]/60 to-[var(--peach)]/70 lg:block" />
        {STEPS.map(([t, d], i) => (
          <li key={t} className="reveal relative">
            <span className="node mono relative grid size-12 rotate-45 place-items-center rounded-[14px] text-sm font-medium" style={{ ['--i' as string]: i }}>
              <span className="-rotate-45">0{i + 1}</span>
            </span>
            <p className="mt-6 text-xl font-medium tracking-[-0.02em] text-[var(--ink)]">{t}</p>
            <p className="mt-1.5 max-w-[16rem] text-sm leading-relaxed text-[var(--ink-2)]">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- features ---------- */

function Tile({ title, copy, className = '', tone = 'card', children }: { title: string; copy: string; className?: string; tone?: string; children: ReactNode }) {
  return (
    <article className={`reveal relative flex flex-col overflow-hidden rounded-[26px] p-7 ${tone} ${className}`}>
      <div className="relative min-h-36 flex-1" aria-hidden>{children}</div>
      <h3 className="mt-7 text-2xl font-medium tracking-[-0.025em] text-[var(--ink)]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-2)]">{copy}</p>
    </article>
  );
}

const WORDS = [['මම', '0.00'], ['software', '0.41'], ['engineering', '0.93'], ['කරනවා', '1.66']];
const WAVE_S = Array.from({ length: 56 }, (_, i) => Math.round(25 + 65 * Math.abs(Math.sin(i * 0.5 + 0.4) * Math.cos(i * 0.21))));

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 pb-32">
      <SectionHead index="02" label="Features" lead="A real editor." soft="With transcription built in.">
        Transcription is the first minute. The rest of the work is typography, timing and export, and that is where this is built to be good.
      </SectionHead>

      <div className="mt-16 grid gap-4 lg:grid-cols-6">
        <Tile className="lg:col-span-4" tone="bg-[linear-gradient(135deg,#fff4ec_0%,#ece9ff_55%,#dde7ff_100%)] border border-white shadow-[0_24px_60px_-34px_rgba(47,90,230,.4)]"
          title="Word-level transcription"
          copy="Sinhala, English and code-mixed speech with ElevenLabs Scribe, Gemini or OpenAI Whisper. Every word gets its own timestamp, so highlights land on the beat. Import SRT, VTT or ASS if you already have captions.">
          <div className="flex h-24 items-center gap-[3px]">
            {WAVE_S.map((h, i) => <span key={i} className="demo-bar block flex-1 rounded-full bg-[var(--cobalt)]/35" style={{ height: `${h}%`, ['--i' as string]: i % 9 }} />)}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {WORDS.map(([w, t]) => (
              <span key={w} className="mono inline-flex items-center gap-2 rounded-full border border-white bg-white/80 px-3 py-1.5 text-xs shadow-sm">
                <span lang="si" className="font-sinhala text-[var(--ink)]">{w}</span><span className="text-[10px] text-[var(--cobalt)]">{t}s</span>
              </span>
            ))}
          </div>
        </Tile>

        <Tile className="lg:col-span-2" title="Edit Unicode, render FM" copy="Type Unicode, see it live in legacy FM fonts. Text is converted only when drawn. 25 built-in fonts, plus your own files.">
          <div className="relative grid h-full min-h-36 place-items-center rounded-2xl border border-[var(--line)] bg-[var(--tint)]">
            <p lang="si" className="font-sinhala text-4xl font-bold text-[var(--ink)]">සිංහල</p>
            <span className="mono demo-swap-a absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-[10px] text-[var(--ink-2)] shadow-sm">UNICODE · editing</span>
            <span className="mono demo-swap-b absolute top-3 left-3 rounded-full bg-[var(--cobalt)] px-2.5 py-1 text-[10px] text-white">FM · drawn</span>
          </div>
        </Tile>

        <Tile className="lg:col-span-2" title="Motion and keyframes" copy="14 entrance animations, per-word styling, speed curves and a multi-track timeline with split, trim, snap and ripple delete.">
          <svg viewBox="0 0 200 110" className="h-full min-h-36 w-full" fill="none">
            <path d="M8 98 C 70 98, 60 12, 100 12 S 150 12, 192 12" stroke="#e3e6f0" strokeWidth="2" />
            <path d="M8 98 C 70 98, 60 12, 100 12 S 150 12, 192 12" stroke="var(--cobalt)" strokeWidth="2" strokeDasharray="4 8" className="demo-flow" />
            {[[8, 98], [100, 12], [192, 12]].map(([x, y]) => <rect key={x} x={x - 5} y={y - 5} width="10" height="10" transform={`rotate(45 ${x} ${y})`} fill="#fff" stroke="var(--cobalt)" strokeWidth="2" />)}
          </svg>
        </Tile>

        <Tile className="lg:col-span-2" tone="bg-[linear-gradient(160deg,#ecfbf6_0%,#f6f7fb_70%)] border border-white shadow-[0_24px_60px_-38px_rgba(43,107,88,.45)]"
          title="Music that ducks" copy="Jamendo library, beat detection and auto-ducking under speech. Voice enhance, RNNoise denoise, LUFS mastering.">
          <div className="grid h-full min-h-36 content-center gap-3">
            <div className="flex h-9 items-end gap-[3px]">{Array.from({ length: 28 }, (_, i) => <span key={i} className="demo-duck block flex-1 rounded-sm bg-[var(--mint)]" style={{ height: `${40 + ((i * 37) % 55)}%` }} />)}</div>
            <div className="flex h-9 items-end gap-[3px]">{Array.from({ length: 28 }, (_, i) => <span key={i} className="block flex-1 rounded-sm bg-[var(--ink)]/55" style={{ height: `${25 + ((i * 53) % 70)}%`, opacity: i > 8 && i < 22 ? 1 : 0.15 }} />)}</div>
          </div>
        </Tile>

        <Tile className="lg:col-span-2" title="Vertical by default" copy="Safe zones for Reels, TikTok and Shorts, a live preview, and one renderer for preview and export, so what you see is what ships.">
          <div className="grid h-full min-h-36 place-items-center">
            <div className="relative h-36 w-[5.1rem] overflow-hidden rounded-xl border border-[var(--ink)]/15 bg-white shadow-[0_14px_30px_-16px_rgba(27,30,54,.4)]">
              <div className="absolute inset-x-2 top-5 bottom-9 rounded-sm border border-dashed border-[var(--cobalt)]/60" />
              <div className="absolute inset-x-0 top-0 h-5 border-b border-[var(--line)] bg-[var(--tint)]" />
              <div className="absolute inset-x-0 bottom-0 h-9 border-t border-[var(--line)] bg-[var(--tint)]" />
              <div className="absolute inset-x-3 top-[58%] h-1.5 rounded-full bg-[var(--cobalt)]" />
            </div>
          </div>
        </Tile>

        <Tile className="lg:col-span-6" tone="bg-[linear-gradient(120deg,#e8efff_0%,#f4f0ff_55%,#fff1e8_100%)] border border-white shadow-[0_24px_60px_-38px_rgba(47,90,230,.4)]"
          title="AI tools, when you want them"
          copy="Pick emphasis words, write hook lines, place B-roll, draft post descriptions and proofread, using Gemini or Claude. Sinhala-script English words get fixed back to Latin.">
          <div className="flex h-full min-h-20 flex-wrap content-center gap-2">
            {['emphasis', 'hook lines', 'b-roll', 'descriptions', 'proofread', 'සිංහල → English words'].map((t, i) => (
              <span key={t} lang={i === 5 ? 'si' : undefined} className={`mono rounded-full border px-4 py-2 text-xs ${i === 0 ? 'border-[var(--cobalt)] bg-[var(--cobalt)] text-white' : 'border-white bg-white/85 text-[var(--ink-2)] shadow-sm'} ${i === 5 ? 'font-sinhala' : ''}`}>{t}</span>
            ))}
          </div>
        </Tile>
      </div>
    </section>
  );
}

/* ---------- real reels ---------- */

const LOOKS = [
  { name: 'Word highlight', note: 'Each word lights as it is spoken.', clip: 'style-highlight' },
  { name: 'Bold punch', note: 'Big, centred, built for a thumb scroll.', clip: 'style-punch' },
  { name: 'Clean subtitle', note: 'A quiet lower third for talking heads.', clip: 'style-clean' },
];

function Looks() {
  return (
    <section className="bg-[linear-gradient(180deg,#eef1fb,#f6f7fb)] py-28">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead index="03" label="Styles" lead="Same words." soft="Different energy.">
          Real reels, captioned in Keyframe. Templates give you a starting point, and every style is per-word editable, with stroke, shadow, glow, plates and gradients.
        </SectionHead>
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {LOOKS.map((l, k) => (
            <figure key={l.name} className="reveal card rounded-[26px] p-3">
              <div className="relative aspect-[9/16] overflow-hidden rounded-[18px] bg-[#0a0a14]">
                <LoopVideo src={`/landing/${l.clip}.mp4`} poster={`/landing/${l.clip}.jpg`} className="absolute inset-0 size-full object-cover" />
                <div className="hud-corners pointer-events-none absolute inset-2.5" />
                <span className="mono absolute top-4 left-4 rounded-full bg-white/85 px-2.5 py-1 text-[10px] text-[var(--ink)] backdrop-blur">STYLE / 0{k + 1}</span>
              </div>
              <figcaption className="px-3 pt-4 pb-3">
                <span className="block text-base font-medium text-[var(--ink)]">{l.name}</span>
                <span className="mt-1 block text-sm text-[var(--ink-2)]">{l.note}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- privacy ---------- */

function Node({ title, items, local }: { title: string; items: string[]; local?: boolean }) {
  return (
    <div className={`card rounded-[26px] p-7 ${local ? 'border-[var(--cobalt)]/25 shadow-[0_28px_60px_-34px_rgba(47,90,230,.45)]' : ''}`}>
      <p className={`mono text-[11px] tracking-[0.14em] uppercase ${local ? 'text-[var(--cobalt)]' : 'text-[var(--subtle)]'}`}>{title}</p>
      <ul className="mt-6 space-y-3.5">
        {items.map((t) => <li key={t} className="flex items-start gap-3 text-sm leading-snug text-[var(--ink)]"><Check />{t}</li>)}
      </ul>
    </div>
  );
}

function Privacy() {
  return (
    <section id="privacy" className="mx-auto max-w-6xl px-5 py-28">
      <SectionHead index="04" label="Privacy" lead="Local by design." soft="Your video stays put.">
        Rendering runs in your browser with WebCodecs. Transcription needs a speech model, so only the extracted audio goes out, to a provider you picked, with your own key.
      </SectionHead>
      <div className="reveal mt-16 grid items-center gap-4 md:grid-cols-[1fr_minmax(9rem,13rem)_1fr]">
        <Node local title="Your device" items={['Video file stays on disk', 'Preview and export render here', 'Projects saved in the browser', 'Your API keys, saved locally and never sent to the browser']} />
        <div className="flex flex-col items-center gap-2 py-2" aria-hidden>
          <span className="mono text-[11px] text-[var(--subtle)]">audio only</span>
          <svg viewBox="0 0 160 12" className="hidden w-full md:block"><line x1="0" y1="6" x2="160" y2="6" stroke="var(--cobalt)" strokeWidth="2" strokeDasharray="6 6" className="demo-flow" /></svg>
          <svg viewBox="0 0 12 56" className="h-14 md:hidden"><line x1="6" y1="0" x2="6" y2="56" stroke="var(--cobalt)" strokeWidth="2" strokeDasharray="6 6" className="demo-flow" /></svg>
          <span className="mono text-[11px] text-[var(--subtle)]">no video</span>
        </div>
        <Node title="Provider you choose" items={['ElevenLabs Scribe', 'Gemini', 'OpenAI Whisper', 'Optional AI tools: caption text, and any images you add for B-roll (Gemini or Claude)']} />
      </div>
    </section>
  );
}

/* ---------- spec sheet ---------- */

const SPECS: [string, string[]][] = [
  ['Video export', ['MP4 up to 4K (WebCodecs)', 'MOV ProRes 4444 with alpha', 'WebM VP9 with alpha']],
  ['Caption files', ['SRT (Unicode)', 'SRT (legacy FM)', 'VTT', 'ASS']],
  ['Speech', ['Sinhala', 'English', 'Code-mixed']],
  ['Speech providers', ['ElevenLabs Scribe', 'Gemini', 'OpenAI Whisper']],
  ['Typography', ['25 built-in fonts', 'Custom .ttf / .otf / .woff2', 'Legacy FM fonts, live']],
  ['Platforms', ['Web (Node + Python)', 'macOS desktop (Electron .dmg)']],
  ['License', ['PolyForm Noncommercial 1.0.0']],
];

function Specs() {
  return (
    <section id="specs" className="mx-auto max-w-6xl px-5 pb-32">
      <SectionHead index="05" label="Specs" lead="The datasheet." soft="Nothing hidden." />
      <dl className="reveal card mt-16 divide-y divide-[var(--line)] overflow-hidden rounded-[26px] text-sm">
        {SPECS.map(([k, v]) => (
          <div key={k} className="grid gap-3 px-7 py-5 sm:grid-cols-[13rem_1fr] sm:gap-6">
            <dt className="mono text-xs tracking-[0.12em] text-[var(--subtle)] uppercase sm:pt-1.5">{k}</dt>
            <dd className="flex flex-wrap gap-2">
              {v.map((x) => <span key={x} className="rounded-full bg-[var(--tint)] px-3.5 py-1.5 text-[var(--ink)]">{x}</span>)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ---------- install ---------- */

function Install() {
  return (
    <section id="install" className="mx-auto max-w-6xl px-5 pb-32">
      <SectionHead index="06" label="Install" lead="Four commands." soft="Then you are captioning.">
        You need Node, Python with uv, and one speech provider key. The README walks through the rest.
      </SectionHead>
      <div className="mt-16 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="reveal overflow-hidden rounded-[26px] bg-[var(--ink)] shadow-[0_30px_70px_-34px_rgba(27,30,54,.7)]">
          <div className="mono flex items-center justify-between border-b border-white/10 px-5 py-3 text-[11px] text-white/55">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-white/20" /><i className="size-2.5 rounded-full bg-white/20" /><i className="size-2.5 rounded-full bg-white/20" /><span className="ml-2">~/keyframe</span></span>
            <CopyButton text={INSTALL} />
          </div>
          <pre className="mono overflow-x-auto p-6 text-[13px] leading-7 text-white/90">
            {INSTALL.split('\n').map((l) => <span key={l} className="block whitespace-pre"><span className="mr-3 text-[var(--azure)] select-none">$</span>{l}</span>)}
            <span className="mt-2 block text-white/45"># add a key to server/.env, then open http://localhost:5180</span>
          </pre>
        </div>
        <div className="reveal card flex flex-col justify-between gap-8 rounded-[26px] p-7">
          <div>
            <p className="text-2xl font-medium tracking-[-0.025em] text-[var(--ink)]">Prefer an app?</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">A macOS build is on the releases page. Same editor, packaged with Electron.</p>
          </div>
          <div className="flex flex-col items-start gap-3">
            <Button href={RELEASES} external>Download for macOS <Arrow /></Button>
            <Button href={REPO} kind="white" external><GitHubMark />Star on GitHub</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- faq ---------- */

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
    <section id="faq" className="mx-auto max-w-6xl px-5 pb-32">
      <SectionHead index="07" label="FAQ" lead="Questions." soft="Answered plainly." />
      <div className="reveal card mt-16 divide-y divide-[var(--line)] overflow-hidden rounded-[26px] px-7">
        {FAQ.map(([q, a], i) => (
          <details key={q} open={i === 0} className="group py-6">
            <summary className="flex cursor-pointer items-center justify-between gap-6 text-lg font-medium tracking-[-0.015em] text-[var(--ink)]">
              {q}
              <span aria-hidden className="faq-plus mono grid size-8 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--tint)] text-base leading-none text-[var(--cobalt)] transition-transform">+</span>
            </summary>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ---------- cta + footer ---------- */

function Cta() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="reveal relative isolate overflow-hidden rounded-[32px] border border-white bg-[linear-gradient(120deg,#dfe8ff_0%,#ece8ff_50%,#ffe9db_100%)] px-6 py-24 text-center shadow-[0_40px_90px_-48px_rgba(47,90,230,.55)] sm:py-32">
        <div aria-hidden className="absolute -top-24 -left-16 -z-10 size-72 rounded-full bg-[var(--azure)]/40 blur-3xl" />
        <div aria-hidden className="absolute -right-16 -bottom-24 -z-10 size-80 rounded-full bg-[var(--peach)]/55 blur-3xl" />
        <h2 className="mx-auto max-w-3xl text-4xl leading-[1.04] font-[450] tracking-[-0.04em] text-balance text-[var(--ink)] sm:text-6xl">
          Your next reel, <span className="text-[var(--ink-2)]">captioned before the kettle boils.</span>
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button href={START}>Open the editor <Arrow /></Button>
          <Button href="#install" kind="white">Run it locally</Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--line)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-9 text-sm text-[var(--subtle)]">
        <span>© 2026 <a href="https://elix.lk" target="_blank" rel="noreferrer" className="text-[var(--ink)] hover:text-[var(--cobalt)]">Elix Innovations</a> · Keyframe.lk</span>
        <span>Source available under PolyForm Noncommercial 1.0.0</span>
        <nav aria-label="Footer" className="flex gap-6">
          <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-[var(--ink)]">GitHub</a>
          <a href={`${REPO}/blob/main/README.md`} target="_blank" rel="noreferrer" className="hover:text-[var(--ink)]">Docs</a>
          <a href={RELEASES} target="_blank" rel="noreferrer" className="hover:text-[var(--ink)]">Releases</a>
        </nav>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="landing min-h-screen bg-[var(--canvas)] text-[var(--ink)] antialiased">
      <Nav />
      <main>
        <Hero />
        <Pipeline />
        <Features />
        <Looks />
        <Privacy />
        <Specs />
        <Install />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
