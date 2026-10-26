import { memo, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { AudioLines, Bold, ChevronDown, FileUp, Languages, Play, Plus, Replace, RotateCcw, Sparkles, Trash2, WandSparkles, X } from '@/components/icons';
import { Minus } from '@/components/icons-audio';
import { Toggle as UiToggle } from '@/components/ui/toggle';
import type { Caption, CaptionStyle, DeepPartial, HealthResponse, TextCase, Word } from '@/types';
import { merge } from '@/lib/style';
import { FontPicker } from '../FontPicker';
import { cssFamily, getFont } from '@/lib/fonts';
import { englishFor } from '@/lib/english-words';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useEditor } from '@/store';
import { ai, health, transcribe } from '@/lib/api';
import { getBlob } from '@/lib/db';
import { segmentWords, retimeWordsWithBreaks, wordsToText } from '@/lib/segment';
import { cuesToCaptions, formatClock, parseSubtitles } from '@/lib/srt';
import { currentTime, playRange, seek } from '@/lib/player';
import { isSimple } from '@/lib/clips';
import { renderVoiceWav } from '@/audio/voice';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ColorInput, Progress, Row, Section, Segmented, Slider, Spinner } from '../controls';
import { ApiKeys } from '../ApiKeys';
import { copyCaptionStyle, pasteCaptionStyle } from '@/lib/clipboard';
import { InputModeToggle, SinhalaInput } from '../SinhalaInput';

type Provider = 'auto' | 'elevenlabs' | 'gemini' | 'openai';
const ENGINES: { value: Provider; label: string; key?: keyof HealthResponse['transcription'] }[] = [
  { value: 'auto', label: 'Best available' },
  { value: 'elevenlabs', label: 'ElevenLabs Scribe', key: 'elevenlabs' },
  { value: 'gemini', label: 'Google Gemini', key: 'gemini' },
  { value: 'openai', label: 'OpenAI Whisper', key: 'openai' },
];

function Generate() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const notify = useEditor((s) => s.notify);
  const [h, setH] = useState<HealthResponse | null | undefined>(undefined);
  const [lang, setLang] = useState<'si' | 'en' | 'auto'>(project.language === 'en' ? 'en' : 'si');
  const [provider, setProvider] = useState<Provider>('auto');
  const [stage, setStage] = useState<null | { label: string; progress?: number }>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { health().then(setH); }, []);
  const anyProvider = h && (h.transcription.elevenlabs || h.transcription.gemini || h.transcription.openai);

  async function run() {
    if (!project.videoAssetId) return;
    // An edited timeline is transcribed from its own audio so caption times match the cuts.
    const blob = isSimple(project) ? await getBlob(project.videoAssetId) : await renderVoiceWav(project).catch(() => undefined);
    if (!blob) { notify('Could not read the timeline audio.', 'error'); return; }
    abort.current = new AbortController();
    setStage({ label: 'Uploading', progress: 0 });
    try {
      const res = await transcribe(blob, {
        language: lang, provider, signal: abort.current.signal,
        onUpload: (p) => setStage(p < 1 ? { label: 'Uploading', progress: p } : { label: 'Listening & transcribing' }),
      });
      const words: Word[] = res.words.map((w) => ({ id: nanoid(8), text: w.text, start: w.start, end: w.end }));
      if (words.length === 0) { notify('No speech was detected in this video.', 'error'); return; }
      update((p) => ({ ...p, words, language: lang === 'en' ? 'en' : 'si', duration: p.duration || res.duration, captions: segmentWords(words, p.segmentation) }));
      notify(`Generated ${words.length} words with ${res.provider}.`, 'success');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') notify((e as Error).message, 'error');
    } finally {
      setStage(null);
    }
  }

  return (
    <Section title="Auto-generate" right={h !== undefined && (
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className={cn('size-1.5 rounded-full', anyProvider ? 'bg-ok' : 'bg-warn')} />{h === null ? 'Offline' : anyProvider ? 'Ready' : 'No engine key'}
      </span>
    )}>
      <Row label="Language">
        <Segmented fill value={lang} onChange={setLang} options={[{ value: 'si', label: <span className="sinhala">සිංහල</span> }, { value: 'en', label: 'English' }, { value: 'auto', label: 'Auto' }]} />
      </Row>
      <Row label="Engine" hint="ElevenLabs Scribe and Gemini both handle Sinhala well. Whisper is weaker on Sinhala.">
        <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
          <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ENGINES.map((e) => (
              <SelectItem key={e.value} value={e.value} disabled={!!(e.key && h && !h.transcription[e.key])}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      {stage ? (
        <div className="mt-1 flex flex-col gap-2 rounded-md bg-muted p-2.5">
          <div className="flex items-center gap-2 text-sm"><Spinner className="text-primary" />{stage.label}{stage.progress !== undefined ? ` · ${Math.round(stage.progress * 100)}%` : '…'}</div>
          {stage.progress !== undefined ? <Progress value={stage.progress} /> : <p className="text-xs text-muted-foreground">Usually takes about a third of the video length.</p>}
          <Button variant="outline" size="sm" className="self-start" onClick={() => abort.current?.abort()}><X />Cancel</Button>
        </div>
      ) : (
        <Button size="sm" className="mt-1 h-8" disabled={!project.videoAssetId || h === null || (h !== undefined && !anyProvider)} onClick={run}>
          <AudioLines />{project.captions.length ? 'Regenerate captions' : 'Generate captions'}
        </Button>
      )}
      {h === null && <p className="text-xs text-warn">The caption server is offline. Start it with <code>npm run dev</code>. You can still import subtitle files.</p>}
      {h && !anyProvider && <p className="text-xs text-warn">Add a Gemini, ElevenLabs or OpenAI key below to turn on auto-generate.</p>}
      {h !== null && (
        <details className="group mt-1 rounded-md border" open={!!h && !anyProvider}>
          <summary className="flex cursor-pointer select-none items-center justify-between px-2.5 py-2 text-xs font-medium">API keys<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /></summary>
          <div className="border-t p-2.5"><ApiKeys only={['GEMINI_API_KEY', 'ELEVENLABS_API_KEY', 'OPENAI_API_KEY']} onChange={() => health().then(setH)} /></div>
        </details>
      )}
    </Section>
  );
}

function Import() {
  const update = useEditor((s) => s.update);
  const notify = useEditor((s) => s.notify);
  const [legacy, setLegacy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function onFile(f: File) {
    const cues = parseSubtitles(await f.text());
    if (!cues.length) { notify('No subtitles found in that file.', 'error'); return; }
    const { words, captions } = cuesToCaptions(cues, { legacyFM: legacy });
    update((p) => ({ ...p, words, captions }));
    notify(`Imported ${captions.length} captions.`, 'success');
  }
  return (
    <Section title="Import subtitles">
      <button type="button" onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        className={cn('group flex items-center gap-2.5 rounded-md border border-dashed px-2.5 py-2 text-left transition-colors',
          over ? 'border-primary bg-primary/10' : 'border-border hover:border-foreground/25 hover:bg-sidebar-accent/60')}>
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground"><FileUp className="size-3.5" /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium">{over ? 'Drop to import' : 'Drop a subtitle file'}</span>
          <span className="text-[11px] text-muted-foreground">SRT · VTT · ASS</span>
        </span>
        <span className="text-[11px] font-medium text-primary">Browse</span>
      </button>
      <Row label="Encoding" hint="Choose Legacy FM for SRTs typed in FM fonts. They're converted to Unicode.">
        <Segmented size="sm" fill value={legacy ? 'fm' : 'unicode'} onChange={(v) => setLegacy(v === 'fm')} options={[{ value: 'unicode', label: 'Unicode' }, { value: 'fm', label: 'Legacy FM' }]} />
      </Row>
      <input ref={input} type="file" accept=".srt,.vtt,.ass,.ssa,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </Section>
  );
}

function Segmentation() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const seg = project.segmentation;
  const set = (patch: Partial<typeof seg>) =>
    update((p) => {
      const segmentation = { ...p.segmentation, ...patch };
      return { ...p, segmentation, captions: segmentWords(p.captions.flatMap((c) => c.words), segmentation) };
    }, 'segmentation');
  return (
    <Section title="Caption length">
      <Row label="Max words"><Slider value={seg.maxWords} min={1} max={15} onChange={(maxWords) => set({ maxWords })} /></Row>
      <Row label="Max characters"><Slider value={seg.maxChars} min={8} max={80} onChange={(maxChars) => set({ maxChars })} /></Row>
      <Row label="Max duration"><Slider value={seg.maxDuration} min={1} max={8} step={0.5} onChange={(maxDuration) => set({ maxDuration })} format={(v) => `${v}s`} /></Row>
      <Row label="Break on pause"><Slider value={seg.splitOnPause} min={0.2} max={2} step={0.1} onChange={(splitOnPause) => set({ splitOnPause })} format={(v) => `${v}s`} /></Row>
    </Section>
  );
}

/** Word indices covered by a text selection inside the caption textarea. */
function wordsInSelection(text: string, a: number, b: number): number[] {
  if (a === b) return [];
  const out: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    const s = m.index, e = s + m[0].length;
    if (e > Math.min(a, b) && s < Math.max(a, b)) out.push(i);
    i++;
  }
  return out;
}

type CaseChoice = TextCase | 'inherit';
const CASES: { value: CaseChoice; label: string; title: string }[] = [
  { value: 'none', label: 'Aa', title: 'As typed' },
  { value: 'upper', label: 'ABC', title: 'CAPITALS' },
  { value: 'lower', label: 'abc', title: 'simple' },
  { value: 'title', label: 'Abc', title: 'Title Case' },
];

/** English letter case picker. With `inherit`, an extra option follows the caption/project style. */
function CasePicker({ value, onChange, inherit }: { value: CaseChoice; onChange: (v: CaseChoice) => void; inherit?: string }) {
  const opts = inherit ? [{ value: 'inherit' as CaseChoice, label: inherit, title: 'Use the caption style' }, ...CASES] : CASES;
  return (
    <Segmented size="sm" value={value} onChange={onChange}
      options={opts.map((o) => ({ value: o.value, label: <span title={o.title}>{o.label}</span> }))} />
  );
}

const IS_SI = /[\u0D80-\u0DFF]/;

/**
 * Rewrite English words that speech recognition wrote in Sinhala script (සොෆ්ට්වෙයාර් → software).
 * The free built-in word list runs first; with `useAi`, captions that still contain Sinhala-script words
 * go to the AI. `captionIds` limits which captions are touched; `only` limits which words may change.
 */
async function convertToEnglish(opts: { captionIds?: string[]; only?: Set<string>; useAi?: boolean } = {}) {
  const { update, notify } = useEditor.getState();
  const inScope = (c: Caption) => (opts.captionIds ? opts.captionIds.includes(c.id) : true);
  const may = (w: Word) => IS_SI.test(w.text) && (!opts.only || opts.only.has(w.id));

  const undoKey = `english-${Date.now()}`; // both passes undo as one step
  // 1) Free word list.
  let free = 0;
  update((p) => ({
    ...p,
    captions: p.captions.map((c) => (!inScope(c) ? c : {
      ...c,
      words: c.words.map((w) => {
        const en = may(w) ? englishFor(w.text) : null;
        if (!en) return w;
        free++;
        return { ...w, text: en };
      }),
    })),
  }), undoKey);
  const plural = (n: number) => `${n} word${n === 1 ? '' : 's'}`;
  if (!opts.useAi) {
    notify(free ? `Converted ${plural(free)} to English (free word list).` : 'No words from the built-in list found. Try "Word list + AI".', free ? 'success' : 'info');
    return;
  }

  // 2) AI for whatever is left.
  const caps = useEditor.getState().project!.captions.filter((c) => inScope(c) && c.words.some(may));
  const words = caps.flatMap((c) => c.words);
  if (!words.length) { notify(free ? `Converted ${plural(free)} to English (free word list, no AI needed).` : 'No Sinhala-script words to convert.', free ? 'success' : 'info'); return; }
  try {
    const res = await ai.proofread({ words: words.map((w) => w.text), language: 'mixed', mode: 'english' });
    const byId = new Map(words.map((w, i) => [w.id, res.words[i] ?? w.text]));
    let changed = 0;
    update((p) => ({
      ...p,
      captions: p.captions.map((c) => ({
        ...c,
        words: c.words.map((w) => {
          const t = byId.get(w.id);
          if (t === undefined || t === w.text || !may(w)) return w;
          changed++;
          return { ...w, text: t };
        }),
      })),
    }), undoKey);
    const total = free + changed;
    notify(total ? `Converted ${plural(total)} to English (${free} free, ${changed} by AI).${res.warning ? ` ${res.warning}` : ''}` : 'No English words found in Sinhala script.', total ? 'success' : 'info');
  } catch (e) {
    notify(`${free ? `Converted ${plural(free)} from the word list. ` : ''}AI step failed: ${(e as Error).message}`, 'error');
  }
}

/** "To English" button: free word list, or word list + AI for the rest. */
function EnglishButton({ label = 'To English', ...opts }: { label?: string; captionIds?: string[]; only?: Set<string> }) {
  const [busy, setBusy] = useState(false);
  const go = async (useAi: boolean) => { setBusy(true); await convertToEnglish({ ...opts, useAi }); setBusy(false); };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" disabled={busy} title="Rewrite English words written in Sinhala letters (සොෆ්ට්වෙයාර් → software)">
          {busy ? <Spinner /> : <Languages />}{label}<ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => go(false)}>
          <div className="flex flex-col"><span>Word list only</span><span className="text-[11px] text-muted-foreground">Free · common words</span></div>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go(true)}>
          <div className="flex flex-col"><span>Word list + AI</span><span className="text-[11px] text-muted-foreground">Catches every word · about $0.0001 per caption</span></div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Toolbar for the selected words: size, color, bold, emphasis, font, case. */
function WordToolbar({ c, sel, onChange, onClear }: { c: Caption; sel: Set<string>; onChange: (c: Caption) => void; onClear: () => void }) {
  const words = c.words.filter((w) => sel.has(w.id));
  const scale = words[0]?.style?.scale ?? 1;
  const color = words.find((w) => w.style?.color)?.style?.color ?? '#FFFFFF';
  const bold = words.every((w) => w.style?.bold);
  const emph = words.every((w) => w.emphasize);
  const apply = (fn: (w: Word) => Word) => onChange({ ...c, words: c.words.map((w) => (sel.has(w.id) ? fn(w) : w)) });
  const setStyle = (patch: NonNullable<Word['style']>) => apply((w) => ({ ...w, style: { ...w.style, ...patch } }));
  const step = (d: number) => setStyle({ scale: Math.round(Math.min(3, Math.max(0.4, scale + d)) * 100) / 100 });
  const font = words.find((w) => w.style?.font)?.style?.font ?? null;
  const script = words.some((w) => IS_SI.test(w.text)) ? 'sinhala' : 'english';
  const hasEnglish = words.some((w) => /[A-Za-z]/.test(w.text));
  const wcase: CaseChoice = words[0]?.style?.textCase ?? 'inherit';
  return (
    <div onClick={(e) => e.stopPropagation()} className="mt-2 flex flex-wrap items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 p-1.5">
      <span className="px-1 text-[11px] text-muted-foreground">{words.length} word{words.length === 1 ? '' : 's'}</span>
      <Button variant="ghost" size="icon-xs" onClick={() => step(-0.1)} aria-label="Smaller"><Minus /></Button>
      <button className="min-w-11 rounded px-1 text-center font-mono text-[11px] tabular-nums hover:bg-muted" title="Reset size" onClick={() => setStyle({ scale: 1 })}>{Math.round(scale * 100)}%</button>
      <Button variant="ghost" size="icon-xs" onClick={() => step(0.1)} aria-label="Bigger"><Plus /></Button>
      <ColorInput value={color} onChange={(v) => setStyle({ color: v })} />
      <UiToggle size="sm" variant="outline" className="h-7" pressed={bold} onPressedChange={(b) => setStyle({ bold: b })} aria-label="Bold"><Bold /></UiToggle>
      <UiToggle size="sm" variant="outline" className="h-7 text-xs" pressed={emph} onPressedChange={(v) => apply((w) => ({ ...w, emphasize: v }))} aria-label="Emphasize"><Sparkles />Emphasis</UiToggle>
      <Button variant="ghost" size="xs" onClick={() => apply((w) => ({ ...w, style: undefined }))}><RotateCcw />Reset</Button>
      {words.some((w) => IS_SI.test(w.text)) && <EnglishButton captionIds={[c.id]} only={sel} />}
      <Button variant="ghost" size="icon-xs" className="ml-auto" onClick={onClear} aria-label="Done"><X /></Button>
      <div className="flex w-full items-center gap-2 pt-1">
        <span className="w-10 shrink-0 px-1 text-[11px] text-muted-foreground">Font</span>
        <FontPicker className="h-7 flex-1 text-xs" value={font} script={script} allowInherit="Caption font"
          onChange={(id) => setStyle({ font: id ?? undefined })} />
      </div>
      {hasEnglish && (
        <div className="flex w-full items-center gap-2">
          <span className="w-10 shrink-0 px-1 text-[11px] text-muted-foreground">Case</span>
          <CasePicker value={wcase} inherit="Auto" onChange={(v) => setStyle({ textCase: v === 'inherit' ? undefined : v })} />
        </div>
      )}
    </div>
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** When each word is spoken (and so lit / shown): change the speed of the whole caption or type exact times per word. */
function TimingBox({ c, onChange }: { c: Caption; onChange: (c: Caption) => void }) {
  const ws = c.words;
  const setWord = (i: number, patch: Partial<Pick<Word, 'start' | 'end'>>) => {
    const w = { ...ws[i], ...patch };
    const lo = i === 0 ? c.start : ws[i - 1].start, hi = c.end;
    w.start = r2(Math.min(Math.max(w.start, lo), hi - 0.05));
    w.end = r2(Math.min(Math.max(w.end, w.start + 0.05), hi));
    onChange({ ...c, words: ws.map((x, j) => (j === i ? w : x)) });
  };
  /** Scale word times around the caption start; `k` > 1 = faster speech, so words land earlier. */
  const speed = (k: number) => onChange({ ...c, words: ws.map((w) => ({ ...w, start: r2(c.start + (w.start - c.start) / k), end: r2(Math.min(c.end, c.start + (w.end - c.start) / k)) })) });
  const even = () => {
    const step = (c.end - c.start) / ws.length;
    onChange({ ...c, words: ws.map((w, i) => ({ ...w, start: r2(c.start + i * step), end: r2(c.start + (i + 1) * step) })) });
  };
  const num = 'h-7 w-[4.5rem] rounded-md border bg-background px-1.5 text-center font-mono text-xs tabular-nums';
  return (
    <div onClick={(e) => e.stopPropagation()} className="mt-2 rounded-xl border bg-muted/20 p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <span className="mr-auto font-medium">Word timing</span>
        <Button variant="outline" size="xs" onClick={() => speed(0.8)}>Slower ×0.8</Button>
        <Button variant="outline" size="xs" onClick={() => speed(1.25)}>Faster ×1.25</Button>
        <Button variant="outline" size="xs" onClick={even}>Even out</Button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1">
        <span className="text-[11px] text-muted-foreground">Word</span><span className="text-center text-[11px] text-muted-foreground">Shows at (s)</span><span className="text-center text-[11px] text-muted-foreground">Until (s)</span>
        {ws.map((w, i) => (
          <div key={w.id} className="contents">
            <span className="sinhala truncate text-xs">{w.text}</span>
            <input type="number" step={0.05} className={num} value={r2(w.start)} onChange={(e) => setWord(i, { start: Number(e.target.value) })} />
            <input type="number" step={0.05} className={num} value={r2(w.end)} onChange={(e) => setWord(i, { end: Number(e.target.value) })} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Per-caption overrides: position, fonts, size, letter case. Stored in caption.styleOverride. */
function CaptionStyleBox({ c, onChange }: { c: Caption; onChange: (c: Caption) => void }) {
  const base = useEditor((s) => s.project!.style);
  const o = c.styleOverride ?? {};
  const eff: CaptionStyle = merge(base, o);
  const set = (patch: DeepPartial<CaptionStyle>) => onChange({ ...c, styleOverride: merge(o, patch) });
  const drop = (section: 'layout' | 'text', key: string) => {
    const sec = { ...(o[section] as Record<string, unknown> | undefined) };
    delete sec[key];
    const next: DeepPartial<CaptionStyle> = { ...o, [section]: Object.keys(sec).length ? sec : undefined };
    if (!next.layout) delete next.layout;
    if (!next.text) delete next.text;
    onChange({ ...c, styleOverride: Object.keys(next).length ? next : undefined });
  };
  const hasEnglish = c.words.some((w) => /[A-Za-z]/.test(w.text));
  const oCase: CaseChoice = o.text?.textCase ?? 'inherit';
  const custom = !!(o.layout || o.text);
  return (
    <div onClick={(e) => e.stopPropagation()} className="mt-2 flex flex-col gap-1 rounded-lg border bg-muted/30 p-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">This caption</span>
        <div className="flex gap-1">
          {c.words.some((w) => IS_SI.test(w.text)) && <EnglishButton captionIds={[c.id]} />}
          <Button variant="ghost" size="xs" onClick={() => copyCaptionStyle(c.id)}>Copy style</Button>
          <Button variant="ghost" size="xs" onClick={() => pasteCaptionStyle([c.id])}>Paste style</Button>
          {custom && <Button variant="ghost" size="xs" onClick={() => onChange({ ...c, styleOverride: undefined })}><RotateCcw />Use project style</Button>}
        </div>
      </div>
      <Row label="Position">
        <Segmented size="sm" value={o.layout?.y === undefined ? -1 : o.layout.y <= 25 ? 18 : o.layout.y >= 65 ? 72 : 50}
          onChange={(y) => (y === -1 ? drop('layout', 'y') : set({ layout: { y } }))}
          options={[{ value: -1, label: 'Auto' }, { value: 18, label: 'Top' }, { value: 50, label: 'Middle' }, { value: 72, label: 'Bottom' }]} />
      </Row>
      <Row label="Horizontal"><Slider value={eff.layout.x} min={0} max={100} step={0.5} onChange={(x) => set({ layout: { x } })} format={(v) => `${Math.round(v)}%`} /></Row>
      <Row label="Vertical"><Slider value={eff.layout.y} min={0} max={100} step={0.5} onChange={(y) => set({ layout: { y } })} format={(v) => `${Math.round(v)}%`} /></Row>
      <Row label="Size"><Slider value={eff.text.fontSize} min={20} max={160} onChange={(fontSize) => set({ text: { fontSize } })} /></Row>
      <Row label="Animation speed" hint="Speed of this caption's enter / exit animation">
        <Slider value={eff.animationSpeed} min={0.25} max={3} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(animationSpeed) => set({ animationSpeed })} />
      </Row>
      {eff.creative?.loop && eff.creative.loop !== 'none' && (
        <Row label="Idle speed" hint="Speed of the hover / float / wave loop">
          <Slider value={eff.creative.loopSpeed ?? 1} min={0.2} max={4} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(loopSpeed) => set({ creative: { loopSpeed } as never })} />
        </Row>
      )}
      <Row label="Sinhala size" hint="Size of the Sinhala letters only">
        <Slider value={Math.round((eff.text.sinhala.fontSize ?? eff.text.fontSize) * (eff.text.sinhala.sizeScale ?? 1))} min={20} max={200}
          onChange={(fontSize) => set({ text: { sinhala: { fontSize, sizeScale: 1 } } })} />
      </Row>
      <Row label="English size" hint="Size of the English letters only">
        <Slider value={Math.round((eff.text.english.fontSize ?? eff.text.fontSize) * (eff.text.english.sizeScale ?? 1))} min={20} max={200}
          onChange={(fontSize) => set({ text: { english: { fontSize, sizeScale: 1 } } })} />
      </Row>
      <Row label="Sinhala font">
        <FontPicker className="h-8 w-40 text-xs" value={o.text?.sinhalaFont ?? null} script="sinhala" allowInherit="Project font"
          onChange={(id) => (id ? set({ text: { sinhalaFont: id } }) : drop('text', 'sinhalaFont'))} />
      </Row>
      <Row label="English font">
        <FontPicker className="h-8 w-40 text-xs" value={o.text?.englishFont ?? null} script="english" allowInherit="Project font"
          onChange={(id) => (id ? set({ text: { englishFont: id } }) : drop('text', 'englishFont'))} />
      </Row>
      {hasEnglish && (
        <Row label="English case">
          <CasePicker value={oCase} inherit="Auto" onChange={(v) => (v === 'inherit' ? drop('text', 'textCase') : set({ text: { textCase: v } }))} />
        </Row>
      )}
      <p className="text-[11px] text-muted-foreground">Tip: drag this caption in the preview to move only it.</p>
    </div>
  );
}

const CaptionRow = memo(function CaptionRow({ c, index, active, selected, onChange, onDelete }: {
  c: Caption; index: number; active: boolean; selected: boolean; onChange: (c: Caption) => void; onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const text = wordsToText(c.words);
  const [draft, setDraft] = useState(text);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const anchor = useRef<number | null>(null);
  useEffect(() => setDraft(text), [text]);
  useEffect(() => { if (active) ref.current?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const commit = () => {
    const t = draft.trim();
    if (t === text) return;
    if (!t) { onDelete(); return; }
    onChange({ ...c, words: retimeWordsWithBreaks(c.words, t, c.start, c.end) });
  };
  const clickChip = (e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    const id = c.words[i].id;
    if (e.shiftKey && anchor.current !== null) {
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
      setSel(new Set(c.words.slice(a, b + 1).map((w) => w.id)));
    } else if (e.metaKey || e.ctrlKey) {
      const n = new Set(sel);
      if (n.has(id)) n.delete(id); else n.add(id);
      setSel(n);
      anchor.current = i;
    } else {
      setSel(sel.size === 1 && sel.has(id) ? new Set() : new Set([id]));
      anchor.current = i;
    }
  };
  return (
    <div ref={ref} onClick={() => useEditor.getState().select(c.id)}
      className={cn('group relative border-b px-3 py-2.5 transition-colors', selected ? 'bg-primary/10 shadow-[inset_2px_0_0_var(--primary)]' : active ? 'bg-sidebar-accent/70' : 'hover:bg-sidebar-accent/40')}>
      {(active || selected) && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="w-6 font-mono text-[10px] opacity-60">#{index + 1}</span>
        <button className="font-mono tabular-nums hover:text-foreground" onClick={() => seek(c.start)}>{formatClock(c.start, true)} → {formatClock(c.end, true)}</button>
        <div className="ml-auto flex items-center opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon-xs" onClick={() => playRange(c.start, c.end)} aria-label="Play caption"><Play /></Button>
          <Button variant="ghost" size="icon-xs" className="hover:text-destructive" onClick={onDelete} aria-label="Delete caption"><Trash2 /></Button>
        </div>
      </div>
      <SinhalaInput rows={Math.max(1, draft.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 34)), 0))} value={draft} onChange={setDraft} onBlur={commit}
        onSelect={(e) => {
          if (draft !== text) return; // selection maps to words only when the text is unchanged
          const el = e.currentTarget;
          const idx = wordsInSelection(draft, el.selectionStart, el.selectionEnd);
          if (idx.length) { setSel(new Set(idx.map((i) => c.words[i]?.id).filter(Boolean) as string[])); anchor.current = idx[0]; }
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />
      <div className="mt-2 flex flex-wrap items-end gap-1">
        {c.words.map((w, i) => (
          <button key={w.id} title="Click to select · Shift-click for a range · ⌘-click to add"
            onClick={(e) => clickChip(e, i)}
            className={cn('sinhala rounded-md border px-1.5 py-0.5 text-xs transition-colors',
              sel.has(w.id) ? 'border-primary bg-primary text-primary-foreground'
                : w.emphasize ? 'border-warn/50 bg-warn/15 text-warn' : 'border-transparent bg-muted text-muted-foreground hover:text-foreground')}
            style={{
              fontSize: w.style?.scale ? `${Math.min(1.6, Math.max(0.7, w.style.scale)) * 12}px` : undefined,
              fontWeight: w.style?.bold ? 700 : undefined,
              fontFamily: w.style?.font ? cssFamily(getFont(w.style.font)) : undefined,
              color: !sel.has(w.id) && w.style?.color ? w.style.color : undefined,
            }}>
            {w.text}
            {w.style?.scale && w.style.scale !== 1 && <sup className="ml-0.5 text-[9px] opacity-70">{Math.round(w.style.scale * 100)}</sup>}
          </button>
        ))}
      </div>
      {sel.size > 0 && <WordToolbar c={c} sel={sel} onChange={onChange} onClear={() => setSel(new Set())} />}
      {selected && <TimingBox c={c} onChange={onChange} />}
      {selected && <CaptionStyleBox c={c} onChange={onChange} />}
    </div>
  );
});

function FindReplace() {
  const project = useEditor((s) => s.project)!;
  const setCaptions = useEditor((s) => s.setCaptions);
  const notify = useEditor((s) => s.notify);
  const [find, setFind] = useState('');
  const [repl, setRepl] = useState('');
  const run = () => {
    if (!find) return;
    let n = 0;
    const next = project.captions.map((c) => ({
      ...c,
      words: c.words.map((w) => { if (!w.text.includes(find)) return w; n++; return { ...w, text: w.text.split(find).join(repl) }; }).filter((w) => w.text.trim()),
    })).filter((c) => c.words.length);
    setCaptions(next);
    notify(n ? `Replaced in ${n} words.` : 'No matches.', n ? 'success' : 'info');
  };
  return (
    <div className="flex gap-1.5 border-b px-3 pb-3">
      <Input className="sinhala h-7 text-xs" placeholder="Find" value={find} onChange={(e) => setFind(e.target.value)} />
      <Input className="sinhala h-7 text-xs" placeholder="Replace with" value={repl} onChange={(e) => setRepl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
      <Button variant="ghost" size="icon-sm" onClick={run} aria-label="Replace all" title="Replace all"><Replace /></Button>
    </div>
  );
}

export function CaptionsPanel() {
  const project = useEditor((s) => s.project)!;
  const time = useEditor((s) => s.time);
  const selected = useEditor((s) => s.selectedCaptionId);
  const setCaptions = useEditor((s) => s.setCaptions);
  const update = useEditor((s) => s.update);
  const notify = useEditor((s) => s.notify);
  const [proofing, setProofing] = useState(false);
  const has = project.captions.length > 0;

  const addAtPlayhead = () => {
    const t = currentTime();
    const start = t, end = Math.min(t + 1.5, project.duration || t + 1.5);
    const c: Caption = { id: nanoid(8), start, end, words: [{ id: nanoid(8), text: 'නව caption', start, end }] };
    setCaptions([...project.captions, c]);
    useEditor.getState().select(c.id);
  };

  const proofread = async () => {
    setProofing(true);
    try {
      const words = project.captions.flatMap((c) => c.words);
      const res = await ai.proofread({ words: words.map((w) => w.text), language: project.language });
      let changed = 0;
      const byId = new Map(words.map((w, i) => [w.id, res.words[i] ?? w.text]));
      const captions = project.captions.map((c) => ({
        ...c, words: c.words.map((w) => { const t = byId.get(w.id)!; if (t !== w.text) changed++; return { ...w, text: t }; }),
      }));
      update((p) => ({ ...p, captions }));
      notify(res.warning ? `Fixed ${changed} words. ${res.warning}` : `Fixed ${changed} words.`, 'success');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setProofing(false);
    }
  };

  return (
    <div className="pb-6">
      <Generate />
      {!has ? (
        <>
          <Import />
          <Section title="Manual">
            <button type="button" onClick={addAtPlayhead}
              className="flex h-7 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
              <Plus className="size-3.5" />Add caption at playhead
              <span className="ml-auto font-mono text-[11px] tabular-nums">{formatClock(time)}</span>
            </button>
          </Section>
        </>
      ) : (
        <>
          <Segmentation />
          <Section title="Transcript" className="border-b-0" right={
            <div className="flex gap-0.5">
              <Button variant="ghost" size="xs" onClick={proofread} disabled={proofing}>{proofing ? <Spinner /> : <WandSparkles />}Proofread</Button>
              <EnglishButton label="English words" />
              <Button variant="ghost" size="xs" onClick={addAtPlayhead}><Plus />Add</Button>
            </div>
          }>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Typing mode</span>
              <InputModeToggle />
            </div>
          </Section>
          <FindReplace />
          <div>
            {project.captions.map((c, i) => (
              <CaptionRow key={c.id} c={c} index={i} active={time >= c.start && time < c.end} selected={selected === c.id}
                onChange={(nc) => setCaptions(project.captions.map((x) => (x.id === nc.id ? nc : x)))}
                onDelete={() => setCaptions(project.captions.filter((x) => x.id !== c.id))} />
            ))}
          </div>
          <Import />
          <div className="px-3 pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive"><Trash2 />Remove all captions</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove all captions?</AlertDialogTitle>
                  <AlertDialogDescription>You can undo this with ⌘Z.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => update((p) => ({ ...p, captions: [] }))}>Remove all</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </div>
  );
}
