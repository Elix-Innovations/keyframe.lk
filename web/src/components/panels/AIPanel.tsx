import { useEffect, useRef, useState } from 'react';
import type { HookTemplateId } from '@/types';
import { brollOverlay } from '@/lib/overlays';
import { useEditor } from '@/store';
import { ai, claudeStatus, type ClaudeStatus } from '@/lib/api';
import { heuristicEmphasis } from '@/lib/emphasis';
import { HOOK_TEMPLATES } from '@/render/captions';
import * as db from '@/lib/db';
import { imageThumb } from '@/lib/media';
import { currentTime } from '@/lib/player';
import { Copy, ImagePlus, Sparkles, WandSparkles } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiKeys } from '../ApiKeys';
import { Row, Section, Segmented, Slider, Spinner, Toggle } from '../controls';

type Tab = 'emphasis' | 'hook' | 'broll' | 'description';

function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const notify = useEditor((s) => s.notify);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { notify((e as Error).message, 'error'); } finally { setBusy(null); }
  };
  return { busy, run };
}

function transcriptOf(captions: { words: { text: string }[] }[]) {
  return captions.map((c) => c.words.map((w) => w.text).join(' ')).join('\n');
}

function Emphasis() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const notify = useEditor((s) => s.notify);
  const { busy, run } = useBusy();
  const words = project.captions.flatMap((c) => c.words);
  const count = words.filter((w) => w.emphasize).length;
  const applyIdx = (idx: number[]) => {
    const ids = new Set(idx.map((i) => words[i]?.id));
    update((p) => ({ ...p, captions: p.captions.map((c) => ({ ...c, words: c.words.map((w) => ({ ...w, emphasize: ids.has(w.id) })) })) }));
    notify(`Emphasized ${ids.size} words.`, 'success');
  };
  return (
    <Section title="Emphasis">
      <div className="text-muted-foreground">{count} of {words.length} words emphasized</div>
      <Button disabled={!words.length || !!busy}
        onClick={() => run('ai', async () => { const r = await ai.emphasis({ words: words.map((w) => w.text), language: project.language }); applyIdx(r.indices); })}>
        {busy === 'ai' ? <Spinner /> : <Sparkles />} Detect key words with AI
      </Button>
      <Button variant="outline" size="sm" disabled={!words.length} onClick={() => applyIdx(heuristicEmphasis(words))}><WandSparkles />Quick detect (offline)</Button>
      <Button variant="ghost" size="xs" className="self-start text-muted-foreground hover:text-destructive" disabled={!count} onClick={() => update((p) => ({ ...p, captions: p.captions.map((c) => ({ ...c, words: c.words.map((w) => ({ ...w, emphasize: false })) })) }))}>Clear emphasis</Button>
      <p className="text-xs text-muted-foreground">Emphasis style (color, size, font) lives in the Display tab.</p>
    </Section>
  );
}

function Hook() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const { busy, run } = useBusy();
  const [ideas, setIdeas] = useState<string[]>([]);
  const hook = project.hook;
  const set = (patch: Partial<typeof hook>, key?: string) => update((p) => ({ ...p, hook: { ...p.hook, ...patch } }), key);
  return (
    <Section title="Text hook" right={<Toggle checked={hook.enabled} onChange={(enabled) => set({ enabled })} />}>
      <p className="text-xs text-muted-foreground">A bold line at the top for the first seconds — stops the scroll.</p>
      <Textarea className="sinhala resize-none" rows={2} placeholder="මේක අනිවාර්යයෙන් බලන්න!" value={hook.text}
        onChange={(e) => set({ text: e.target.value, enabled: true }, 'hook-text')} />
      <Button variant="outline" disabled={!project.captions.length || !!busy}
        onClick={() => run('hook', async () => { const r = await ai.hook({ transcript: transcriptOf(project.captions), language: project.language === 'en' ? 'en' : 'si' }); setIdeas(r.hooks); })}>
        {busy === 'hook' ? <Spinner /> : <Sparkles />} Suggest hooks with AI
      </Button>
      {ideas.length > 0 && (
        <div className="flex flex-col gap-1">
          {ideas.map((h) => (
            <button key={h} className="sinhala rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/10" onClick={() => set({ text: h, enabled: true })}>{h}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-5 gap-1">
        {HOOK_TEMPLATES.map((t) => (
          <Button key={t.id} variant="outline" size="sm" className={cn('px-1 text-xs', hook.template === t.id && 'border-primary bg-primary/15')} onClick={() => set({ template: t.id as HookTemplateId })}>{t.label}</Button>
        ))}
      </div>
      <Row label="Duration"><Slider value={hook.end - hook.start} min={1} max={10} step={0.5} onChange={(d) => set({ end: hook.start + d }, 'hook-dur')} format={(v) => `${v}s`} /></Row>
      <Row label="Vertical"><Slider value={hook.y} min={5} max={95} onChange={(y) => set({ y }, 'hook-y')} format={(v) => `${v}%`} /></Row>
    </Section>
  );
}

function Broll() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const notify = useEditor((s) => s.notify);
  const { busy, run } = useBusy();
  const input = useRef<HTMLInputElement>(null);
  const [pool, setPool] = useState<{ assetId: string; thumb: string }[]>([]);
  const addBroll = (items: { assetId: string; start: number; end: number; note?: string }[]) =>
    update((p) => {
      const list = [...(p.overlays ?? [])];
      for (const b of items) list.push(brollOverlay({ ...b, mode: 'fullscreen' }, list, { w: p.videoWidth || 1080, h: p.videoHeight || 1920 }));
      return { ...p, overlays: list };
    });

  const addFiles = async (files: FileList) => {
    const added: { assetId: string; thumb: string }[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      added.push({ assetId: await db.putBlob(f), thumb: await imageThumb(f) });
    }
    setPool((p) => [...p, ...added]);
  };
  const placeAtPlayhead = (assetId: string) => {
    const t = currentTime();
    addBroll([{ assetId, start: t, end: t + 2.5 }]);
  };
  const placeWithAI = () => run('broll', async () => {
    const segments = project.captions.map((c, index) => ({ index, start: c.start, end: c.end, text: c.words.map((w) => w.text).join(' ') }));
    const r = await ai.broll({ segments, images: pool.map((p) => ({ id: p.assetId, dataUrl: p.thumb })) });
    addBroll(r.placements.map((pl) => ({ assetId: pl.imageId, start: pl.start, end: pl.end, note: pl.reason })));
    notify(`Placed ${r.placements.length} images.`, 'success');
  });

  return (
    <Section title="B-roll images">
      <p className="text-xs text-muted-foreground">Add photos, then place them at the playhead or let AI match each one to the moment you talk about it.</p>
      <Button variant="outline" size="sm" onClick={() => input.current?.click()}><ImagePlus />Add images…</Button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
      {pool.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {pool.map((p) => (
              <button key={p.assetId} title="Place at playhead" onClick={() => placeAtPlayhead(p.assetId)} className="overflow-hidden rounded-md border border-border hover:border-primary">
                <img src={p.thumb} className="aspect-square w-full object-cover" alt="" />
              </button>
            ))}
          </div>
          <Button size="sm" className="h-8" disabled={!project.captions.length || !!busy} onClick={placeWithAI}>
            {busy === 'broll' ? <Spinner /> : <Sparkles />} Place with AI
          </Button>
        </>
      )}
      <p className="text-xs text-muted-foreground">Placed images are image layers on the timeline: drag, trim, resize and right-click them like any overlay.</p>
    </Section>
  );
}

function Description() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const notify = useEditor((s) => s.notify);
  const { busy, run } = useBusy();
  const [lang, setLang] = useState<'si' | 'en'>(project.description?.language ?? 'si');
  const d = project.description;
  const full = d ? `${d.title}\n\n${d.body}\n\n${d.hashtags.map((h) => `#${h}`).join(' ')}` : '';
  return (
    <Section title="Post description">
      <Row label="Language"><Segmented size="sm" value={lang} onChange={setLang} options={[{ value: 'si', label: 'සිංහල' }, { value: 'en', label: 'English' }]} /></Row>
      <Button disabled={!project.captions.length || !!busy}
        onClick={() => run('desc', async () => {
          const r = await ai.description({ transcript: transcriptOf(project.captions), language: lang });
          update((p) => ({ ...p, description: { ...r, language: lang } }));
        })}>
        {busy === 'desc' ? <Spinner /> : <Sparkles />} Write title, caption & hashtags
      </Button>
      {d && (
        <>
          <Textarea className="sinhala resize-y" rows={10} value={full} readOnly />
          <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(full).then(() => notify('Copied.', 'success'))}><Copy />Copy</Button>
        </>
      )}
    </Section>
  );
}

/** Is this computer signed in to Claude (Claude Code CLI), or is an API key set? Motion graphics use the signed-in account. */
function ClaudeConnection() {
  const [status, setStatus] = useState<ClaudeStatus | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const check = async (refresh = false) => { setChecking(true); setStatus(await claudeStatus(refresh)); setChecking(false); };
  useEffect(() => { void check(); }, []);
  const cli = status?.cli;
  const ok = !!cli?.found && !!cli.loggedIn;
  return (
    <Section title="Claude connection" right={<Button size="xs" variant="ghost" disabled={checking} onClick={() => void check(true)}>{checking ? <Spinner className="size-3" /> : 'Check'}</Button>}>
      {status === undefined && <p className="text-xs text-muted-foreground">Checking…</p>}
      {status === null && <p className="text-xs text-destructive">The Keyframe.lk server is not running. Start it with <code>cd server &amp;&amp; npm run dev</code>.</p>}
      {status && (
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 shrink-0 rounded-full', ok ? 'bg-ok' : 'bg-warn')} />
            <span className="font-medium">{ok ? 'Connected to your Claude account' : cli?.found ? 'Claude Code is not signed in' : 'Claude Code is not installed'}</span>
          </div>
          {ok && <p className="text-muted-foreground">{cli!.account?.email}{cli!.account?.plan ? ` · ${cli!.account.plan}` : ''} · {cli!.version}. Motion graphics and transitions are written with this account; nothing is stored in the app.</p>}
          {!ok && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-2 text-muted-foreground">
              {!cli?.found && <p>1. Install Claude Code, then restart the server:</p>}
              {!cli?.found && <code className="rounded bg-background px-1.5 py-1 text-[11px] text-foreground">npm install -g @anthropic-ai/claude-code</code>}
              <p>{cli?.found ? '1.' : '2.'} Sign in with your Claude account: open a terminal and run</p>
              <code className="rounded bg-background px-1.5 py-1 text-[11px] text-foreground">claude</code>
              <p>then press Check. Prefer an API key? Add an Anthropic key below.</p>
            </div>
          )}
          <p className="text-muted-foreground">{status.api ? 'An API key is also set (used for captions AI).' : 'Caption AI features (emphasis, hook, B-roll) use an Anthropic or Gemini key.'}</p>
          <ApiKeys only={['ANTHROPIC_API_KEY', 'GEMINI_API_KEY']} />
        </div>
      )}
    </Section>
  );
}

export function AIPanel() {
  const [tab, setTab] = useState<Tab>('emphasis');
  const project = useEditor((s) => s.project)!;
  return (
    <div>
      <ClaudeConnection />
      <div className="px-3 pt-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="emphasis">Emphasis</TabsTrigger>
            <TabsTrigger value="hook">Hook</TabsTrigger>
            <TabsTrigger value="broll">B-roll</TabsTrigger>
            <TabsTrigger value="description">Post</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {!project.captions.length && tab !== 'broll' && <p className="px-3 pt-3 text-xs text-warn">Generate or import captions first.</p>}
      {tab === 'emphasis' && <Emphasis />}
      {tab === 'hook' && <Hook />}
      {tab === 'broll' && <Broll />}
      {tab === 'description' && <Description />}
    </div>
  );
}
