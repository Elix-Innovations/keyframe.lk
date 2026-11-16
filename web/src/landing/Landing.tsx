import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { CopyButton } from './CopyButton';

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

function Button({ href, children, kind = 'primary', external }: { href: string; children: ReactNode; kind?: 'primary' | 'ghost'; external?: boolean }) {
  const cls = kind === 'primary'
    ? 'bg-white text-[#05060a] hover:bg-[var(--signal)] shadow-[0_0_0_1px_rgba(255,255,255,.4),0_10px_40px_-10px_rgba(255,122,69,.45)]'
    : 'border border-white/15 bg-white/[0.04] text-white hover:border-white/30 hover:bg-white/[0.08]';
  const props = external ? { target: '_blank', rel: 'noreferrer' } : {};
  return (
    <Link href={href} {...props} className={`inline-flex h-11 items-center gap-2.5 rounded-lg px-5 text-sm font-medium transition-colors ${cls}`}>
      {children}
    </Link>
  );
}

function SectionHead({ index, label, title, children }: { index: string; label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="reveal grid gap-6 border-t border-white/10 pt-6 md:grid-cols-[14rem_1fr]">
      <p className="mono text-xs tracking-wider text-white/45 uppercase"><span className="text-[var(--signal)]">{index}</span> / {label}</p>
      <div className="max-w-3xl">
        <h2 className="text-3xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-5xl">{title}</h2>
        {children && <p className="mt-5 max-w-xl text-base leading-relaxed text-white/55">{children}</p>}
      </div>
    </div>
  );
}

/* ---------- nav ---------- */

const NAV = [['Features', '#features'], ['Privacy', '#privacy'], ['Specs', '#specs'], ['Install', '#install'], ['FAQ', '#faq']];

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#05060a]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-5">
        <Link href="/" aria-label="Keyframe.lk home"><Logo size={26} withWordmark /></Link>
        <nav aria-label="Sections" className="mono hidden items-center gap-7 text-xs text-white/60 md:flex">
          {NAV.map(([label, href]) => <a key={href} href={href} className="transition-colors hover:text-white">{label}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <a href={REPO} target="_blank" rel="noreferrer" aria-label="Keyframe.lk on GitHub" className="grid size-9 place-items-center rounded-lg border border-white/10 text-white/70 transition-colors hover:border-white/30 hover:text-white"><GitHubMark /></a>
          <Link href={EDITOR} className="inline-flex h-9 items-center rounded-lg bg-white px-4 text-xs font-semibold text-[#05060a] transition-colors hover:bg-[var(--signal)]">Open editor</Link>
        </div>
      </div>
    </header>
  );
}

/* ---------- hero: a render console that plays on a 6 s loop ---------- */

const CAPTION = ['අද', 'video', 'එක', 'edit', 'කරමු'];
const WORD_TIMES = ['0.00', '1.20', '2.40', '3.60', '4.80'];
// Deterministic pseudo-waveform so server and client markup match.
const WAVE = Array.from({ length: 72 }, (_, i) => Math.round(28 + 62 * Math.abs(Math.sin(i * 0.61) * Math.cos(i * 0.17 + 1.3))));

function Console() {
  return (
    <div className="hud-panel relative overflow-hidden rounded-2xl" aria-hidden>
      {/* title bar */}
      <div className="mono flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5 text-[11px] text-white/50">
        <span className="flex items-center gap-2"><span className="demo-rec size-1.5 rounded-full bg-[var(--hot)]" />render://preview · 1080×1920 · 30fps</span>
        <span className="demo-clock text-[var(--signal)]" />
      </div>

      <div className="grid gap-0 md:grid-cols-[minmax(0,15rem)_1fr]">
        {/* 9:16 frame */}
        <div className="border-b border-white/[0.07] p-4 md:border-r md:border-b-0">
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[13.5rem] overflow-hidden rounded-md p-2"
            style={{ background: 'radial-gradient(120% 80% at 30% 10%, #3b1830 0%, #0a0a14 60%), #0a0a14' }}>
            <div className="hud-corners pointer-events-none absolute inset-1" />
            <div className="absolute inset-x-2 top-2 flex justify-between"><span className="mono text-[9px] text-white/40">SAFE 9:16</span><span className="mono text-[9px] text-white/40">REELS</span></div>
            <div className="absolute inset-4 rounded-sm border border-dashed border-white/[0.12]" />
            <div className="absolute inset-x-3 bottom-[18%] text-center">
              <p lang="si" className="font-sinhala flex flex-wrap justify-center gap-y-1 text-[1.15rem] leading-snug font-bold text-white [text-shadow:0_2px_14px_rgba(0,0,0,.7)]">
                {CAPTION.map((w, i) => <span key={w} className="demo-word" style={{ ['--i' as string]: i }}>{w}</span>)}
              </p>
            </div>
          </div>
        </div>

        {/* readouts + tracks */}
        <div className="flex min-w-0 flex-col">
          <div className="grid grid-cols-5 gap-px border-b border-white/[0.07] bg-white/[0.05]">
            {CAPTION.map((w, i) => (
              <div key={w} className="bg-[#080a10] px-2.5 py-3">
                <p className="mono text-[10px] text-white/35">{WORD_TIMES[i]}s</p>
                <p lang="si" className="font-sinhala mt-1 truncate text-xs text-white/80">{w}</p>
              </div>
            ))}
          </div>

          <div className="relative flex flex-1 flex-col justify-center gap-3 p-4">
            {/* playhead: spans only the track lane (label column 2rem + gap 0.75rem) */}
            <div aria-hidden className="pointer-events-none absolute top-3 right-4 bottom-3 left-[3.75rem] z-10">
              <span className="demo-head absolute inset-y-0 w-px bg-[var(--signal)] shadow-[0_0_14px_2px_rgba(255,122,69,.6)]" />
            </div>
            <Track label="">
              <div className="mono flex justify-between text-[9px] text-white/30"><span>0s</span><span>1s</span><span>2s</span><span>3s</span><span>4s</span><span>5s</span><span>6s</span></div>
            </Track>
            <Track label="VID">
              <div className="flex h-7 gap-1">
                {[1.4, 1, 1.6].map((w, i) => <div key={i} className="rounded-[4px] border border-white/10 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.07)_0_1px,transparent_1px_14px)] bg-white/[0.04]" style={{ flex: w }} />)}
              </div>
            </Track>
            <Track label="CAP">
              <div className="flex h-7 gap-1">
                {[1, 1.3, 0.8, 1.1, 1].map((w, i) => <div key={i} className="mono grid place-items-center rounded-[4px] border border-[var(--hot)]/40 bg-[var(--hot)]/15 text-[9px] text-[var(--hot)]" style={{ flex: w }}>{`c${i + 1}`}</div>)}
              </div>
            </Track>
            <Track label="FX">
              <div className="relative h-6">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                {[6, 21, 38, 52, 69, 86].map((l) => <span key={l} className="keyframe-diamond absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 bg-[var(--signal)]" style={{ left: `${l}%` }} />)}
              </div>
            </Track>
            <Track label="VOX">
              <div className="flex h-10 items-center gap-[2px]">
                {WAVE.map((h, i) => <span key={i} className="demo-bar block flex-1 rounded-full bg-white/40" style={{ height: `${h}%`, ['--i' as string]: i % 9 }} />)}
              </div>
            </Track>
            <Track label="MUS">
              <div className="flex h-8 items-center gap-[2px]">
                {WAVE.map((h, i) => <span key={i} className="demo-duck block flex-1 rounded-full bg-[var(--signal)]/35" style={{ height: `${30 + ((h * 7) % 60)}%` }} />)}
              </div>
            </Track>
          </div>
        </div>
      </div>
    </div>
  );
}

function Track({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[2rem_1fr] items-center gap-3">
      <span className="mono text-[9px] tracking-wider text-white/35">{label}</span>
      {children}
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="hud-grid pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,69,.13),rgba(255,45,90,.07)_55%,transparent)] blur-2xl" />

      <div className="mx-auto max-w-7xl px-5 pt-12 pb-20 sm:pt-16">
        <p className="mono demo-pulse inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60">
          <span className="size-1.5 rounded-full bg-[var(--signal)]" />Source available · runs on your machine · සිංහල first
        </p>
        <h1 className="mt-6 max-w-5xl text-[2.75rem] leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-7xl lg:text-[5.5rem]">
          Sinhala captions, <span className="text-signal-grad">timed to the frame.</span>
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/60">
          Drop in a reel. Get word-by-word captions in Sinhala, English or both in one sentence. Style them, score them, and render up to 4K without the video ever leaving your computer.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Button href={START}>Start a project</Button>
          <Button href={REPO} kind="ghost" external><GitHubMark />View source</Button>
        </div>

        <div className="mt-12"><Console /></div>
      </div>
    </section>
  );
}

/* ---------- pipeline ---------- */

const STEPS = [
  ['Ingest', 'Drop a video. It stays on disk.'],
  ['Transcribe', 'Audio only, to the provider you choose.'],
  ['Style', 'Fonts, highlights, motion, music.'],
  ['Render', 'WebCodecs on your GPU. MP4, MOV, WebM.'],
];

function Pipeline() {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-28">
      <ol className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="reveal bg-[#07080d] p-6">
            <span className="mono text-xs text-[var(--signal)]">0{i + 1}</span>
            <p className="mt-6 text-lg font-medium tracking-tight">{t}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/50">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- features bento ---------- */

function Tile({ title, copy, className = '', children }: { title: string; copy: string; className?: string; children: ReactNode }) {
  return (
    <article className={`reveal hud-panel group relative flex flex-col overflow-hidden rounded-2xl p-6 transition-colors hover:border-white/20 ${className}`}>
      <div className="relative min-h-36 flex-1" aria-hidden>{children}</div>
      <h3 className="mt-6 text-xl font-medium tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-white/50">{copy}</p>
    </article>
  );
}

const WORDS = [['මම', '0.00'], ['software', '0.41'], ['engineering', '0.93'], ['කරනවා', '1.66']];
const WAVE_S = Array.from({ length: 56 }, (_, i) => Math.round(25 + 65 * Math.abs(Math.sin(i * 0.5 + 0.4) * Math.cos(i * 0.21))));

function Features() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-5 pb-28">
      <SectionHead index="01" label="Features" title="A real editor, with transcription built in.">
        Transcription is the first minute. The rest of the work is typography, timing and export, and that is where this is built to be good.
      </SectionHead>

      <div className="mt-14 grid gap-4 lg:grid-cols-4">
        <Tile className="lg:col-span-2" title="Word-level transcription" copy="Sinhala, English and code-mixed speech with ElevenLabs Scribe, Gemini or OpenAI Whisper. Every word gets its own timestamp, so highlights land on the beat. Import SRT, VTT or ASS if you already have captions.">
          <div className="flex h-20 items-center gap-[2px]">
            {WAVE_S.map((h, i) => <span key={i} className="demo-bar block flex-1 rounded-full bg-white/35" style={{ height: `${h}%`, ['--i' as string]: i % 9 }} />)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {WORDS.map(([w, t]) => (
              <span key={w} className="mono inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs">
                <span lang="si" className="font-sinhala text-white/90">{w}</span><span className="text-[10px] text-[var(--signal)]">{t}s</span>
              </span>
            ))}
          </div>
        </Tile>

        <Tile title="Edit Unicode, render FM" copy="Type Unicode, see it live in legacy FM fonts. Text is converted only when drawn, plus 25 built-in fonts and your own files.">
          <div className="relative grid h-full min-h-36 place-items-center rounded-lg border border-white/10 bg-black/30">
            <p lang="si" className="font-sinhala text-4xl font-bold">සිංහල</p>
            <span className="mono demo-swap-a absolute top-3 left-3 rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/70">UNICODE · editing</span>
            <span className="mono demo-swap-b absolute top-3 left-3 rounded bg-[var(--hot)]/20 px-2 py-0.5 text-[10px] text-[var(--hot)]">FM · drawn</span>
          </div>
        </Tile>

        <Tile title="Motion and keyframes" copy="14 entrance animations, per-word styling, speed curves and a multi-track timeline with split, trim, snap and ripple delete.">
          <svg viewBox="0 0 200 110" className="h-full min-h-36 w-full" fill="none">
            <path d="M8 98 C 70 98, 60 12, 100 12 S 150 12, 192 12" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
            <path d="M8 98 C 70 98, 60 12, 100 12 S 150 12, 192 12" stroke="var(--signal)" strokeWidth="1.5" strokeDasharray="4 8" className="demo-flow" />
            {[[8, 98], [100, 12], [192, 12]].map(([x, y]) => <rect key={x} x={x - 5} y={y - 5} width="10" height="10" transform={`rotate(45 ${x} ${y})`} fill="#05060a" stroke="var(--signal)" strokeWidth="1.5" />)}
          </svg>
        </Tile>

        <Tile title="Music that ducks" copy="Jamendo library, beat detection and auto-ducking under speech. Voice enhance, RNNoise denoise, LUFS mastering.">
          <div className="grid h-full min-h-36 content-center gap-3">
            <div className="flex h-9 items-end gap-[3px]">{Array.from({ length: 28 }, (_, i) => <span key={i} className="demo-duck block flex-1 rounded-sm bg-[var(--signal)]/50" style={{ height: `${40 + ((i * 37) % 55)}%` }} />)}</div>
            <div className="flex h-9 items-end gap-[3px]">{Array.from({ length: 28 }, (_, i) => <span key={i} className="block flex-1 rounded-sm bg-white/45" style={{ height: `${25 + ((i * 53) % 70)}%`, opacity: i > 8 && i < 22 ? 1 : 0.15 }} />)}</div>
          </div>
        </Tile>

        <Tile title="Vertical by default" copy="Safe zones for Reels, TikTok and Shorts, a live preview, and one renderer for preview and export, so what you see is what ships.">
          <div className="grid h-full min-h-36 place-items-center">
            <div className="relative h-36 w-[5.1rem] rounded-xl border border-white/20 bg-black/30">
              <div className="absolute inset-x-2 top-5 bottom-9 rounded-sm border border-dashed border-[var(--signal)]/60" />
              <div className="absolute inset-x-0 top-0 h-5 border-b border-white/10 bg-white/[0.04]" />
              <div className="absolute inset-x-0 bottom-0 h-9 border-t border-white/10 bg-white/[0.04]" />
              <div className="absolute inset-x-3 top-[58%] h-1.5 rounded-full bg-[var(--hot)]" />
            </div>
          </div>
        </Tile>

        <Tile className="lg:col-span-2" title="AI tools, when you want them" copy="Pick emphasis words, write hook lines, place B-roll, draft post descriptions and proofread, using Gemini or Claude. Sinhala-script English words get fixed back to Latin.">
          <div className="flex h-full min-h-36 flex-wrap content-center gap-2">
            {['emphasis', 'hook lines', 'b-roll', 'descriptions', 'proofread', 'සිංහල → English words'].map((t, i) => (
              <span key={t} lang={i === 5 ? 'si' : undefined} className={`mono rounded-full border px-3.5 py-2 text-xs ${i === 0 ? 'border-[var(--signal)]/50 bg-[var(--signal)]/10 text-[var(--signal)]' : 'border-white/10 bg-white/[0.03] text-white/65'} ${i === 5 ? 'font-sinhala' : ''}`}>{t}</span>
            ))}
          </div>
        </Tile>
      </div>
    </section>
  );
}

/* ---------- caption styles ---------- */

const LOOKS = [
  { name: 'Word highlight', note: 'each word lights as it is spoken', from: '#5b1d3a', hot: 'වැඩේ', line: ['අද', 'වැඩේ', 'පටන්', 'ගමු'] },
  { name: 'Bold punch', note: 'big, centred, built for a thumb scroll', from: '#103a52', hot: 'should', line: ['This', 'is', 'how', 'it', 'should', 'look'] },
  { name: 'Clean subtitle', note: 'quiet lower third for talking heads', from: '#3a2a10', hot: '', line: ['ඔයාට', 'මේක', 'පුළුවන්', 'නේද?'] },
];

function Looks() {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-28">
      <SectionHead index="02" label="Styles" title="Same words, different energy.">
        Templates give you a starting point. Every style is per-word editable, with stroke, shadow, glow, plates and gradients.
      </SectionHead>
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {LOOKS.map((l, k) => (
          <figure key={l.name} className="reveal hud-panel overflow-hidden rounded-2xl p-3">
            <div className="relative flex aspect-square items-end justify-center overflow-hidden rounded-lg p-5"
              style={{ background: `radial-gradient(110% 80% at 30% 0%, ${l.from}, #07080d 72%)` }}>
              <div className="hud-corners pointer-events-none absolute inset-2" />
              <span className="mono absolute top-3 left-3 text-[10px] text-white/40">STYLE/0{k + 1}</span>
              <p lang="si" className={`font-sinhala text-center leading-snug text-white ${k === 1 ? 'text-3xl font-black uppercase' : k === 0 ? 'text-xl font-bold' : 'rounded bg-black/55 px-3 py-1.5 text-base font-medium'}`}>
                {l.line.map((w, i) => (
                  <span key={i}>{w === l.hot ? <span className="rounded bg-[var(--hot)] px-1.5">{w}</span> : w}{' '}</span>
                ))}
              </p>
            </div>
            <figcaption className="px-2 pt-4 pb-2">
              <span className="block text-sm font-medium">{l.name}</span>
              <span className="mono mt-1 block text-[11px] text-white/40">{l.note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* ---------- privacy ---------- */

function Node({ title, items, tone }: { title: string; items: string[]; tone: 'local' | 'remote' }) {
  return (
    <div className={`hud-panel rounded-2xl p-6 ${tone === 'local' ? 'border-[var(--signal)]/30' : ''}`}>
      <p className={`mono text-[11px] tracking-wider uppercase ${tone === 'local' ? 'text-[var(--signal)]' : 'text-white/45'}`}>{title}</p>
      <ul className="mt-5 space-y-2.5">
        {items.map((t) => <li key={t} className="flex items-center gap-2.5 text-sm text-white/75"><span className={`size-1.5 rounded-full ${tone === 'local' ? 'bg-[var(--signal)]' : 'bg-white/30'}`} />{t}</li>)}
      </ul>
    </div>
  );
}

function Privacy() {
  return (
    <section id="privacy" className="mx-auto max-w-7xl px-5 pb-28">
      <SectionHead index="03" label="Privacy" title="Your video never leaves your computer.">
        Rendering runs in your browser with WebCodecs. Transcription needs a speech model, so only the extracted audio goes out, to a provider you picked, with your own key.
      </SectionHead>
      <div className="reveal mt-14 grid items-center gap-4 md:grid-cols-[1fr_minmax(9rem,14rem)_1fr]">
        <Node tone="local" title="Your device" items={['Video file stays on disk', 'Preview and export render here', 'Projects saved in the browser', 'Your API keys, saved locally and never sent to the browser']} />
        <div className="flex flex-col items-center gap-2 py-2" aria-hidden>
          <span className="mono text-[11px] text-white/50">audio only</span>
          <svg viewBox="0 0 160 12" className="hidden w-full md:block"><line x1="0" y1="6" x2="160" y2="6" stroke="var(--signal)" strokeWidth="1.5" strokeDasharray="6 6" className="demo-flow" /></svg>
          <svg viewBox="0 0 12 56" className="h-14 md:hidden"><line x1="6" y1="0" x2="6" y2="56" stroke="var(--signal)" strokeWidth="1.5" strokeDasharray="6 6" className="demo-flow" /></svg>
          <span className="mono text-[11px] text-white/30">no video</span>
        </div>
        <Node tone="remote" title="Provider you choose" items={['ElevenLabs Scribe', 'Gemini', 'OpenAI Whisper', 'Optional AI tools: caption text, and any images you add for B-roll (Gemini or Claude)']} />
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
    <section id="specs" className="mx-auto max-w-7xl px-5 pb-28">
      <SectionHead index="04" label="Specs" title="The datasheet." />
      <dl className="reveal mono mt-14 divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.015] text-sm">
        {SPECS.map(([k, v]) => (
          <div key={k} className="grid gap-2 px-5 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
            <dt className="text-xs tracking-wider text-white/40 uppercase">{k}</dt>
            <dd className="flex flex-wrap gap-x-5 gap-y-1.5 text-white/85">
              {v.map((x) => <span key={x} className="before:mr-2 before:text-[var(--signal)] before:content-['▸']">{x}</span>)}
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
    <section id="install" className="mx-auto max-w-7xl px-5 pb-28">
      <SectionHead index="05" label="Install" title="Run it in four commands.">
        You need Node, Python with uv, and one speech provider key. The README walks through the rest.
      </SectionHead>
      <div className="mt-14 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="reveal hud-panel overflow-hidden rounded-2xl">
          <div className="mono flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5 text-[11px] text-white/45">
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-white/15" /><i className="size-2 rounded-full bg-white/15" /><i className="size-2 rounded-full bg-white/15" /><span className="ml-2">~/keyframe</span></span>
            <CopyButton text={INSTALL} />
          </div>
          <pre className="mono overflow-x-auto p-5 text-[13px] leading-7 text-white/85">
            {INSTALL.split('\n').map((l) => <span key={l} className="block whitespace-pre"><span className="mr-3 select-none text-[var(--signal)]">$</span>{l}</span>)}
            <span className="mt-2 block text-white/35"># add a key to server/.env, then open http://localhost:5180</span>
          </pre>
        </div>
        <div className="reveal hud-panel flex flex-col justify-between gap-6 rounded-2xl p-6">
          <div>
            <p className="text-xl font-medium tracking-[-0.02em]">Prefer an app?</p>
            <p className="mt-2 text-sm leading-relaxed text-white/50">A macOS build is on the releases page. Same editor, packaged with Electron.</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <Button href={RELEASES} external>Download for macOS</Button>
            <Button href={REPO} kind="ghost" external><GitHubMark />Star on GitHub</Button>
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
    <section id="faq" className="mx-auto max-w-7xl px-5 pb-28">
      <SectionHead index="06" label="FAQ" title="Questions, answered." />
      <div className="reveal mt-14 divide-y divide-white/[0.08] border-y border-white/[0.08]">
        {FAQ.map(([q, a], i) => (
          <details key={q} open={i === 0} className="group py-5">
            <summary className="flex cursor-pointer items-center justify-between gap-6 text-lg font-medium tracking-[-0.01em]">
              {q}
              <span aria-hidden className="faq-plus mono grid size-7 shrink-0 place-items-center rounded-md border border-white/15 text-base leading-none text-white/70 transition-transform">+</span>
            </summary>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ---------- cta + footer ---------- */

function Cta() {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-20">
      <div className="reveal relative isolate overflow-hidden rounded-3xl border border-white/10 px-6 py-20 text-center sm:py-28">
        <div aria-hidden className="hud-grid absolute inset-0 -z-10 opacity-60" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(255,45,90,.22),transparent)]" />
        <h2 className="mx-auto max-w-3xl text-4xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-6xl">Your next reel, captioned before the kettle boils.</h2>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button href={START}>Open the editor</Button>
          <Button href="#install" kind="ghost">Run it locally</Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.08]">
      <div className="mono mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-white/45">
        <span>© 2026 <a href="https://elix.lk" target="_blank" rel="noreferrer" className="text-white/70 hover:text-white">Elix Innovations</a> · Keyframe.lk</span>
        <span>Source available under PolyForm Noncommercial 1.0.0</span>
        <nav aria-label="Footer" className="flex gap-5">
          <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-white">GitHub</a>
          <a href={`${REPO}/blob/main/README.md`} target="_blank" rel="noreferrer" className="hover:text-white">Docs</a>
          <a href={RELEASES} target="_blank" rel="noreferrer" className="hover:text-white">Releases</a>
        </nav>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="landing dark min-h-screen bg-[#05060a] text-white antialiased">
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
