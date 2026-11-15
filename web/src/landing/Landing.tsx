import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import {
  AudioLines, Captions, Clapperboard, Download, Languages, Play, Smartphone, Sparkles, Type,
} from '@/components/icons';

const EDITOR = '/editor';
const START = '/editor#/new'; // opens a blank project straight in the workspace

/* ---------- small pieces ---------- */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-medium tracking-wide text-white/80 uppercase">
      <Clapperboard className="size-3.5 text-rose-500" />{children}
    </span>
  );
}

function Heading({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-3xl leading-[1.02] font-semibold tracking-[-0.03em] uppercase text-balance sm:text-5xl ${className}`}>{children}</h2>;
}

function PillButton({ href, children, tone = 'rose' }: { href: string; children: ReactNode; tone?: 'rose' | 'light' | 'dark' }) {
  const tones = {
    rose: ['bg-rose-500 text-white', 'bg-white text-rose-500'],
    light: ['bg-white text-[#0b0b0f]', 'bg-[#0b0b0f] text-white'],
    dark: ['bg-white/10 text-white', 'bg-white text-[#0b0b0f]'],
  }[tone];
  return (
    <Link href={href} className={`group inline-flex h-11 items-center gap-3 rounded-full py-1 pr-1 pl-5 text-xs font-semibold tracking-wide uppercase transition-transform hover:scale-[1.03] ${tones[0]}`}>
      {children}
      <span className={`grid size-9 place-items-center rounded-full text-base leading-none ${tones[1]}`} aria-hidden>»</span>
    </Link>
  );
}

function FloatingTile({ children, className = '', tint = 'bg-rose-500' }: { children: ReactNode; className?: string; tint?: string }) {
  return (
    <span aria-hidden className={`absolute grid size-14 place-items-center rounded-2xl text-white shadow-[0_18px_40px_-12px_rgba(244,63,94,0.6)] ${tint} ${className}`}>
      {children}
    </span>
  );
}

/** A phone-shaped caption sample, standing in for footage. */
function Phone({ from, to, line, hot, tag, className = '' }: { from: string; to: string; line: string; hot?: string; tag?: string; className?: string }) {
  const parts = hot ? line.split(hot) : [line];
  return (
    <div className={`relative flex aspect-[4/5] w-[235px] shrink-0 flex-col justify-end overflow-hidden rounded-xl border border-white/10 p-4 ${className}`}
      style={{ background: `radial-gradient(120% 90% at 30% 15%, ${from} 0%, ${to} 70%)` }}>
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(0,0,0,0.55),transparent_65%)]" />
      {tag && <span className="absolute top-3 left-3 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white/90 backdrop-blur">{tag}</span>}
      <p lang="si" className="font-sinhala relative text-center text-lg leading-snug font-bold text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">
        {hot ? <>{parts[0]}<span className="rounded bg-rose-500 px-1.5 text-white">{hot}</span>{parts[1]}</> : line}
      </p>
    </div>
  );
}

const PHONES = [
  { from: '#e0533d', to: '#2a0d12', line: 'මම software engineering කරනවා', hot: 'software', tag: 'Reels' },
  { from: '#2b6cb0', to: '#06101f', line: 'අද වැඩේ පටන් ගමු', hot: 'වැඩේ', tag: 'Shorts' },
  { from: '#f59e0b', to: '#2b1403', line: 'This is how it should look', hot: 'should', tag: 'TikTok' },
  { from: '#a21caf', to: '#14061a', line: 'ඔයාට මේක පුළුවන් නේද?', hot: 'පුළුවන්', tag: 'Reels' },
  { from: '#0d9488', to: '#041a18', line: 'Captions that keep people watching', hot: 'keep', tag: 'YouTube' },
];

/* ---------- sections ---------- */

const NAV = [['Home', '#home'], ['About', '#about'], ['Features', '#features'], ['Styles', '#styles'], ['FAQ', '#faq']];

function Nav() {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <Link href="/" aria-label="Keyframe.lk home"><Logo size={28} withWordmark /></Link>
        <nav aria-label="Sections" className="hidden items-center gap-8 text-xs font-medium tracking-wide uppercase md:flex">
          {NAV.map(([label, href]) => <a key={href} href={href} className="text-white/90 transition-colors hover:text-rose-400">{label}</a>)}
        </nav>
        <Link href={EDITOR} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-xs font-medium backdrop-blur transition-colors hover:bg-white/10">
          <Sparkles className="size-3.5 text-rose-400" />Open editor
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="home" className="relative overflow-hidden pt-28">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_0%,rgba(143,28,58,0.75),transparent_70%),radial-gradient(40%_30%_at_90%_10%,rgba(255,255,255,0.07),transparent_70%)]" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pt-12 pb-16 md:grid-cols-[1.6fr_1fr] md:items-start">
        <div className="relative">
          <h1 className="text-[2.6rem] leading-[0.98] font-semibold tracking-[-0.04em] uppercase text-balance sm:text-6xl lg:text-7xl">
            Sinhala captions for videos people finish
          </h1>
          <FloatingTile className="-top-8 right-2 -rotate-12 !bg-[#3a0f1c] sm:right-10"><Sparkles className="size-6" /></FloatingTile>
          <FloatingTile className="right-[8%] bottom-10 rotate-6 sm:bottom-2"><Play className="size-6" /></FloatingTile>
          <div className="mt-10"><PillButton href={START}>Start a project</PillButton></div>
        </div>
        <div className="space-y-6 md:pt-8">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-rose-500"><Languages className="size-4" /></span>
            <p className="text-xs leading-tight font-semibold">Sinhala, English <span className="text-rose-400">&amp; code-mixed</span><br />speech, transcribed</p>
          </div>
          <p className="text-sm leading-relaxed text-white/60">
            Drop in a reel and get word-by-word captions. Style them, add music and export up to 4K. Your video never leaves your computer.
          </p>
          <ul className="flex flex-wrap gap-2 text-[11px] font-semibold tracking-wide uppercase">
            {['Unicode + FM fonts', 'On-device export', '4K MP4'].map((t) => <li key={t} className="rounded-full border border-white/15 px-3 py-1.5 text-white/80">{t}</li>)}
          </ul>
        </div>
      </div>

      <div aria-hidden className="marquee-wrap relative overflow-hidden pb-16 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="marquee flex w-max gap-2.5">
          {[...PHONES, ...PHONES, ...PHONES, ...PHONES].map((p, i) => <Phone key={i} {...p} />)}
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="relative mx-auto max-w-6xl px-5 py-24 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[radial-gradient(50%_55%_at_50%_100%,rgba(143,28,58,0.55),transparent_75%)]" />
      <div className="relative">
        <Eyebrow>About us</Eyebrow>
        <p className="mx-auto mt-6 max-w-3xl text-2xl leading-tight font-semibold tracking-[-0.02em] uppercase text-balance sm:text-4xl">
          Good captions are more than text on a screen. <span className="text-white/45">They are timing, emphasis and the right font for the language people actually speak.</span>
        </p>
        <div className="relative mx-auto mt-14 max-w-2xl">
          <div className="aspect-[16/9] overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(90%_100%_at_30%_20%,#3b1020,#0b0b0f_75%)] p-5 text-left">
            <div className="flex items-center gap-1.5" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="size-2.5 rounded-full bg-white/20" />)}</div>
            <div className="mt-6 grid grid-cols-[1fr_1.4fr] gap-4">
              <div className="space-y-2" aria-hidden>
                {[80, 60, 90, 50].map((w, i) => <div key={i} className="h-3 rounded bg-white/10" style={{ width: `${w}%` }} />)}
              </div>
              <div className="flex aspect-[9/10] items-end justify-center rounded-lg bg-[radial-gradient(100%_80%_at_50%_10%,#e0533d,#2a0d12)] p-3">
                <p lang="si" className="font-sinhala rounded bg-black/40 px-2 py-1 text-sm font-bold">අපි කතා කරමු</p>
              </div>
            </div>
            <div className="mt-5 flex gap-1" aria-hidden>
              {[12, 20, 9, 26, 14, 18, 8, 22, 16, 11, 24, 13].map((w, i) => <div key={i} className="h-6 rounded-sm bg-rose-500/60" style={{ width: `${w * 3}px` }} />)}
            </div>
          </div>
          <FloatingTile className="top-8 -left-6 -rotate-12"><Captions className="size-6" /></FloatingTile>
          <FloatingTile tint="bg-[#ff7a59]" className="right-[-1.5rem] bottom-10 rotate-6 !shadow-[0_18px_40px_-12px_rgba(255,122,89,0.6)]"><Clapperboard className="size-6" /></FloatingTile>
        </div>
      </div>
    </section>
  );
}

const WORKFLOW = ['Drop a video', 'Auto transcribe', 'Style & animate', 'Export'];

function Strip() {
  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 pb-20 text-xs font-semibold tracking-wide text-white/50 uppercase">
      <span className="max-w-[9rem] leading-tight text-white/80">From raw clip to burned-in captions</span>
      {WORKFLOW.map((w, i) => <span key={w} className="flex items-center gap-2"><span className="text-rose-500">0{i + 1}</span>{w}</span>)}
    </div>
  );
}

function Styles() {
  return (
    <section id="styles" className="relative px-5 py-24">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(50%_60%_at_50%_0%,rgba(143,28,58,0.6),transparent_75%)]" />
      <div className="relative mx-auto max-w-6xl text-center">
        <Eyebrow>Caption styles</Eyebrow>
        <Heading className="mt-5">Looks you can drop on any reel</Heading>
        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Word highlight', 'Each spoken word lights up as it is said.', PHONES[0]],
            ['Bold punch', 'Big, centred and easy to read on a phone.', PHONES[2]],
            ['Clean subtitle', 'Quiet lower-third for talking-head videos.', PHONES[1]],
          ].map(([title, copy, p], i) => (
            <figure key={title as string} className={`flex flex-col items-center gap-4 ${i === 1 ? 'lg:mt-16' : ''}`}>
              <Phone {...(p as (typeof PHONES)[number])} className="!w-full max-w-[19rem]" />
              <figcaption className="text-left">
                <span className="block text-sm font-semibold tracking-wide uppercase">{title as string}</span>
                <span className="mt-1 block text-xs text-white/50">{copy as string}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Captions, title: 'Auto captions', copy: 'Transcribe Sinhala, English or code-mixed speech with ElevenLabs, Gemini or OpenAI.' },
  { icon: Type, title: 'FM + Unicode fonts', copy: 'Live legacy FM font rendering, with a Unicode to FM converter built in.' },
  { icon: Sparkles, title: 'Animations', copy: 'Word-by-word highlights, emphasis and animated entrances for every caption.' },
  { icon: AudioLines, title: 'Music & audio', copy: 'Mix background music under your voice from a royalty-free library.' },
  { icon: Smartphone, title: 'Made for vertical', copy: 'Reels, TikTok and Shorts layouts with safe areas and live preview.' },
  { icon: Download, title: 'On-device export', copy: 'Render in your browser up to 4K. Nothing is uploaded anywhere.' },
];

function Features() {
  return (
    <section id="features" className="relative px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Eyebrow>Features</Eyebrow>
          <Heading className="mt-5">Everything you need to caption videos</Heading>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, copy }, i) => (
            <article key={title} className="flex min-h-72 flex-col justify-between rounded-xl border border-white/10 bg-[#0d0d12] p-5">
              <div className="flex items-start justify-between">
                <Icon className="size-6 text-rose-500" />
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium tracking-wide uppercase text-white/70">Feature 0{i + 1}</span>
              </div>
              <h3 className="text-center text-2xl font-semibold tracking-[-0.02em] uppercase">{title}</h3>
              <p className="text-xs leading-relaxed text-white/50">{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const FACTS = [['4K', 'Max export resolution'], ['0', 'Bytes of video uploaded'], ['3', 'Speech modes supported'], ['6', 'Export formats']];

function Facts() {
  return (
    <section className="relative px-5 py-24">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[radial-gradient(50%_55%_at_50%_0%,rgba(143,28,58,0.55),transparent_75%)]" />
      <div className="relative mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-center">
        <div>
          <Eyebrow>Fun fact</Eyebrow>
          <Heading className="mt-5">Built to stay on your computer</Heading>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {FACTS.map(([n, label]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
              <dt className="order-2 mt-6 text-[11px] font-medium tracking-wide text-white/60 uppercase">{label}</dt>
              <dd className="text-4xl font-semibold tracking-tight"><span className="text-rose-500">{n}</span></dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const FORMATS = ['MP4 up to 4K', 'MOV ProRes 4444 alpha', 'WebM (VP9 alpha)', 'SRT Unicode', 'SRT Legacy FM', 'VTT', 'ASS'];

function Formats() {
  return (
    <section className="px-5 py-24">
      <div className="mx-auto max-w-6xl text-center">
        <Eyebrow>Export toolkit</Eyebrow>
        <Heading className="mt-5">Hand off to any editor</Heading>
        <ul className="mt-12 flex flex-wrap justify-center gap-3">
          {FORMATS.map((f, i) => (
            <li key={f} className={`rounded-xl border px-5 py-4 text-sm font-semibold tracking-wide uppercase ${i === 0 ? 'border-white bg-white text-[#0b0b0f]' : 'border-white/10 bg-[#0d0d12] text-white/80'}`}>{f}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FAQ = [
  ['Does my video get uploaded?', 'No. Rendering and export run in your browser, so your videos stay on your computer. Only audio is sent to the transcription provider you configure.'],
  ['Which languages work?', 'Sinhala, English and code-mixed speech such as "මම software engineering කරනවා", in Unicode and legacy FM fonts.'],
  ['What do I need to run it?', 'Node and Python locally, plus an API key for transcription (ElevenLabs, Gemini or OpenAI). The setup steps are in the README.'],
  ['What can I export?', 'MP4 up to 4K, transparent MOV (ProRes 4444) or WebM for other editors, and SRT, VTT and ASS caption files.'],
  ['Can I use FM fonts?', 'Yes. Type Unicode and it renders in FM fonts live, or convert text with the built-in converter.'],
];

function Faq() {
  return (
    <section id="faq" className="relative px-5 py-24">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[radial-gradient(50%_50%_at_50%_0%,rgba(143,28,58,0.5),transparent_75%)]" />
      <div className="relative mx-auto grid max-w-6xl gap-10 md:grid-cols-[1fr_1.4fr]">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <Heading className="mt-5">Questions, answered</Heading>
          <div className="mt-8"><PillButton href={START}>Try it now</PillButton></div>
        </div>
        <div className="space-y-3">
          {FAQ.map(([q, a], i) => (
            <details key={q} open={i === 0} className="group rounded-lg border border-white/10 bg-[#0d0d12] p-4">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold tracking-wide uppercase">
                {q}
                <span aria-hidden className="faq-plus grid size-6 shrink-0 place-items-center rounded bg-white/10 text-base leading-none transition-transform group-open:bg-rose-500">+</span>
              </summary>
              <p className="mt-3 max-w-xl text-xs leading-relaxed text-white/50">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="px-5 pb-16">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(70%_120%_at_50%_0%,rgba(190,40,75,0.8),#12090d_75%)] px-6 py-20 text-center">
        <FloatingTile className="top-8 left-[8%] -rotate-12 !bg-[#3a0f1c]"><Sparkles className="size-6" /></FloatingTile>
        <FloatingTile className="right-[8%] bottom-8 rotate-6"><Play className="size-6" /></FloatingTile>
        <Eyebrow>Get started</Eyebrow>
        <Heading className="mx-auto mt-5 max-w-xl">Ready to caption your next reel?</Heading>
        <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-white/60">Drop in a video, get captions in minutes, and export a finished clip without it ever leaving your machine.</p>
        <div className="mt-8"><PillButton href={START} tone="light">Open the editor</PillButton></div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative overflow-hidden px-5 pt-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-8 text-xs font-medium tracking-wide uppercase">
        <div><span className="text-white/40">Built for</span><p className="mt-1 text-base font-semibold">Sinhala creators</p></div>
        <nav aria-label="Footer" className="flex gap-6 text-white/80">
          {NAV.slice(0, 4).map(([label, href]) => <a key={href} href={href} className="hover:text-rose-400">{label}</a>)}
        </nav>
      </div>
      <div className="mx-auto flex max-w-6xl justify-between py-6 text-[11px] font-medium tracking-wide text-white/60 uppercase">
        <span>© 2026 <span className="text-rose-500">Keyframe.lk</span></span>
        <span>All rights reserved</span>
      </div>
      <div aria-hidden className="select-none text-center leading-[0.8] font-semibold tracking-[-0.06em] whitespace-nowrap text-white" style={{ fontSize: 'clamp(3rem, 15.5vw, 15rem)' }}>
        KEYFRAME<span className="text-rose-500">.LK</span>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="landing dark min-h-screen bg-[#0b0b0f] text-white antialiased">
      <Nav />
      <main>
        <Hero />
        <About />
        <Strip />
        <Styles />
        <Features />
        <Facts />
        <Formats />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
