import { useEffect, useMemo, useRef, useState } from 'react';
import type { MotionScene } from '@/types';
import { useEditor } from '@/store';
import { ai, ApiError, claudeStatus, type ClaudeStatus } from '@/lib/api';
import { BG_GROUPS, bgGroup, MOTION_LIBRARY } from '@/lib/motionLibrary';
import { makeOverlay } from '@/lib/overlays';
import { currentTime } from '@/lib/player';
import { clipEnd, trackOf, videoClips } from '@/lib/clips';
import { kvGet, kvSet } from '@/lib/db';
import { drawScene } from '@/render/scene';
import { outputSize } from '@/render/compose';
import { Download, Plus, Trash2 } from '@/components/icons';
import { downloadScene } from '@/lib/exportScene';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Row, Section, Segmented, Slider, Spinner } from '../controls';

type Role = MotionScene['role'];
const ROLE_LABEL: Record<Role, string> = { graphic: 'Graphic', transition: 'Transition', background: 'Background' };

/** The project frame in design units: 1080 wide, as tall as the aspect ratio needs. */
function useFrame() {
  const p = useEditor((s) => s.project)!;
  return useMemo(() => { const o = outputSize(p); return { w: 1080, h: Math.round((1080 * o.height) / o.width) }; }, [p]);
}

/** Add a scene as an overlay layer. Graphics and backgrounds start at the playhead; transitions centre on the nearest cut. */
export function addMotionLayer(scene: MotionScene, where: 'playhead' | 'cut' = 'playhead'): string | null {
  const st = useEditor.getState();
  const p = st.project;
  if (!p) return null;
  let start = currentTime();
  if (where === 'cut') {
    const cuts = videoClips(p.clips ?? []).filter((c) => trackOf(c) === 0 && !c.cutout).flatMap((c) => [c.start, clipEnd(c)]).filter((t) => t > 0.05 && t < p.duration - 0.05);
    if (!cuts.length) { st.notify('This timeline has no cut between clips yet. Added at the playhead instead.', 'info'); }
    else {
      const near = cuts.reduce((b, t) => (Math.abs(t - start) < Math.abs(b - start) ? t : b));
      start = Math.max(0, near - scene.duration / 2);
    }
  }
  const o = makeOverlay({ kind: 'motion', text: scene.name, start, duration: scene.duration, apply: { scene: JSON.parse(JSON.stringify(scene)), x: 50, y: 50, scale: 1, rotation: 0, opacity: 1, animIn: { id: 'none', duration: 0.01 }, animOut: { id: 'none', duration: 0.01 } } }, p.overlays ?? [], p);
  st.setOverlays((l) => [...l, o]);
  st.selectOverlay(o.id);
  st.notify(`Added “${scene.name}” at ${start.toFixed(1)}s.`, 'success');
  return o.id;
}

/** Render a scene to a transparent WebM and save it; `pct` is the progress while it renders (null when idle). */
function useSceneDownload(scene: MotionScene) {
  const project = useEditor((s) => s.project)!;
  const notify = useEditor((s) => s.notify);
  const [pct, setPct] = useState<number | null>(null);
  const run = async () => {
    if (pct !== null) return;
    setPct(0);
    try { await downloadScene(scene, project, (p) => setPct(Math.round(p * 100))); notify(`Saved “${scene.name}” as WebM with transparency.`, 'success'); }
    catch (e) { notify((e as Error).message || 'Could not export that scene.', 'error'); }
    finally { setPct(null); }
  };
  return { pct, run };
}

function DownloadButton({ scene, className }: { scene: MotionScene; className?: string }) {
  const { pct, run } = useSceneDownload(scene);
  return (
    <Button size="xs" variant="secondary" className={className} disabled={pct !== null} onClick={() => void run()} title="Download as transparent WebM">
      {pct === null ? <><Download />Download</> : <><Spinner className="size-3" />{pct}%</>}
    </Button>
  );
}

/** A small live canvas of a scene; it plays while hovered. */
function SceneThumb({ scene, className }: { scene: MotionScene; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  const frame = scene.frame ?? { w: 1080, h: 1920 };
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const H0 = Math.round(168 * dpr), W = Math.round((H0 * frame.w) / frame.h), H = H0;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    const still = scene.role === 'transition' ? scene.duration * 0.5 : scene.role === 'background' ? 1 : Math.min(scene.duration * 0.45, scene.duration - 0.3);
    let raf = 0;
    const start = performance.now();
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const t = hover ? ((performance.now() - start) / 1000) % (scene.duration + 0.4) : still;
      drawScene(ctx, W, H, scene, Math.min(t, scene.duration - 0.001));
      if (hover) raf = requestAnimationFrame(draw);
    };
    draw();
    const onFont = () => { if (!hover) draw(); }; // while hovering the running loop redraws; a second chain would never be cancelled
    document.fonts?.addEventListener?.('loadingdone', onFont);
    return () => { cancelAnimationFrame(raf); document.fonts?.removeEventListener?.('loadingdone', onFont); };
  }, [scene, hover, frame.h, frame.w]);
  return (
    <canvas ref={ref} className={cn('mx-auto block rounded-md', className)} style={{ aspectRatio: `${frame.w} / ${frame.h}`, height: 168, maxWidth: '100%', background: 'linear-gradient(135deg,#2a2f38,#13161b)' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />
  );
}

function SceneCard({ scene, onAdd, onAddCut, onDelete, sub }: { scene: MotionScene; onAdd: () => void; onAddCut?: () => void; onDelete?: () => void; sub?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-muted/40 p-1.5 transition-colors hover:border-foreground/25">
      <SceneThumb scene={scene} />
      <div className="mt-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <span className="truncate text-xs font-medium">{scene.name}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{sub ?? `${scene.duration.toFixed(1)}s`}</span>
      </div>
      <div className="mt-1.5 flex gap-1">
        <Button size="xs" variant="secondary" className="flex-1" onClick={onAdd}><Plus />Add</Button>
        {onAddCut && <Button size="xs" variant="secondary" className="flex-1" onClick={onAddCut}>At cut</Button>}
      </div>
      <DownloadButton scene={scene} className="mt-1 w-full" />
      {onDelete && <Button variant="secondary" size="icon-xs" onClick={onDelete} className="absolute top-2 right-2 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" aria-label="Delete scene"><Trash2 /></Button>}
    </div>
  );
}

const SAVED_KEY = 'motion-scenes';

export function MotionPanel() {
  const project = useEditor((s) => s.project)!;
  const setPanel = useEditor((s) => s.setPanel);
  const notify = useEditor((s) => s.notify);
  const frame = useFrame();
  const [role, setRole] = useState<Role>('graphic');
  const [tab, setTab] = useState<'library' | 'create'>('library');
  const [hue, setHue] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const [result, setResult] = useState<{ scene: MotionScene; via: string; ms: number } | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<MotionScene[]>([]);
  const [status, setStatus] = useState<ClaudeStatus | null | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []); // stop the Claude run (and its CLI process) when the panel closes
  useEffect(() => { void claudeStatus().then(setStatus); void kvGet<MotionScene[]>(SAVED_KEY).then((v) => setSaved(v ?? [])).catch(() => undefined); }, []);
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [busy]);

  const persist = (list: MotionScene[]) => { setSaved(list); void kvSet(SAVED_KEY, list).catch(() => undefined); };
  const library = useMemo(() => MOTION_LIBRARY.filter((e) => e.role === role).map((e) => { const sc = e.build(frame); return { e, scene: role === 'background' && hue ? { ...sc, adjust: { hue } } : sc }; }), [role, frame, hue]);
  const connected = status?.cli.found && status.cli.loggedIn;
  const palette = useMemo(() => [...new Set([project.style.text.fill.color, project.style.highlight.fill.color, project.style.highlight.boxColor, project.style.emphasis.fill.color])].filter(Boolean) as string[], [project.style]);

  const generate = async (base?: MotionScene) => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(''); setSecs(0);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const r = await ai.motion({ prompt: prompt.trim(), role: base?.role ?? role, duration: duration || undefined, frame, palette, fonts: { english: project.style.text.englishFont, sinhala: project.style.text.sinhalaFont }, base }, ctl.signal);
      setResult({ scene: r.scene, via: r.via, ms: r.ms });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally { setBusy(false); abort.current = null; }
  };

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-sidebar px-3 py-2.5">
        <Segmented fill size="sm" value={role} onChange={(r) => { setRole(r); if (r !== 'background') setDuration((d) => Math.min(d, 6)); }} options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
        <Segmented fill size="sm" value={tab} onChange={setTab} options={[{ value: 'library', label: 'Library' }, { value: 'create', label: 'Create with Claude' }]} />
      </div>

      {tab === 'library' && (
        <>
          <Section title={`${ROLE_LABEL[role]}s`}>
            <p className="text-[11px] text-muted-foreground">
              {role === 'transition' ? 'Plays over a cut between two clips. “At cut” centres it on the nearest cut.' : role === 'background' ? 'Animated backgrounds. Add one, then drag it below a cut-out layer on the timeline.' : 'Animated graphics that play over your video. Hover to preview; they are layers you can move, resize and trim.'}
            </p>
            {role === 'background' && <Row label="Hue"><Slider value={hue} min={-180} max={180} format={(v) => `${v}°`} onChange={setHue} /></Row>}
            {role === 'background' ? BG_GROUPS.map((g) => {
              const items = library.filter(({ e }) => bgGroup(e) === g);
              return items.length > 0 && (
                <div key={g} className="flex flex-col gap-1">
                  <div className="text-[11px] font-medium text-muted-foreground">{g}</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {items.map(({ e, scene }) => <SceneCard key={e.id} scene={scene} sub={e.note.length > 22 ? `${scene.duration.toFixed(1)}s` : e.note} onAdd={() => addMotionLayer(scene)} />)}
                  </div>
                </div>
              );
            }) : (
              <div className="grid grid-cols-4 gap-1.5">
                {library.map(({ e, scene }) => (
                  <SceneCard key={e.id} scene={scene} sub={e.note.length > 22 ? `${scene.duration.toFixed(1)}s` : e.note}
                    onAdd={() => addMotionLayer(scene)} onAddCut={role === 'transition' ? () => addMotionLayer(scene, 'cut') : undefined} />
                ))}
              </div>
            )}
          </Section>
          {saved.filter((s) => s.role === role).length > 0 && (
            <Section title="My scenes">
              <div className="grid grid-cols-4 gap-1.5">
                {saved.filter((s) => s.role === role).map((s, i) => (
                  <SceneCard key={`${i}-${s.name}-${s.duration}`} scene={s} onAdd={() => addMotionLayer(s)} onAddCut={role === 'transition' ? () => addMotionLayer(s, 'cut') : undefined}
                    onDelete={() => persist(saved.filter((x) => x !== s))} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {tab === 'create' && (
        <>
          <Section title="Claude">
            {status === undefined && <p className="text-[11px] text-muted-foreground">Checking your Claude connection…</p>}
            {status === null && <p className="text-[11px] text-destructive">The Keyframe.lk server is not running (cd server && npm run dev).</p>}
            {status && connected && <p className="text-[11px] text-muted-foreground">Connected through Claude Code{status.cli.account?.email ? ` as ${status.cli.account.email}` : ''}{status.cli.account?.plan ? ` (${status.cli.account.plan})` : ''}. Generations use your Claude account.</p>}
            {status && !connected && (
              <div className="flex flex-col gap-1.5 text-[11px]">
                <p className="text-muted-foreground">{status.cli.error ?? 'Claude is not connected.'}{status.api ? ' An API key is set, so Claude will be used through that.' : ''}</p>
                <Button size="xs" variant="secondary" className="self-start" onClick={() => setPanel('ai')}>Connect Claude</Button>
              </div>
            )}
          </Section>
          <Section title={`Describe the ${ROLE_LABEL[role].toLowerCase()}`}>
            <Textarea className="min-h-20 text-sm" value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder={role === 'transition' ? 'A fast whip transition with a teal swipe and a flash' : role === 'background' ? 'Slow drifting purple and blue light on dark' : 'A lower third for “Alex, Host” with a sliding plate and an accent line'} />
            <Row label="Length" hint="0 lets Claude choose."><Slider value={duration} min={0} max={role === 'background' ? 12 : 6} step={0.5} format={(v) => (v ? `${v}s` : 'Auto')} onChange={setDuration} /></Row>
            <p className="text-[11px] text-muted-foreground">Uses your project colours{palette.length ? ` (${palette.join(', ')})` : ''} and fonts.</p>
            <div className="flex gap-1.5">
              <Button size="sm" disabled={busy || !prompt.trim() || (!connected && !status?.api)} onClick={() => void generate()}>{busy ? <><Spinner className="size-3.5" />Writing… {secs}s</> : 'Generate'}</Button>
              {busy && <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>Cancel</Button>}
            </div>
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </Section>
          {result && (
            <Section title="Result" right={<span className="text-[11px] text-muted-foreground">{(result.ms / 1000).toFixed(0)}s · {result.via === 'claude-cli' ? 'your Claude account' : result.via}</span>}>
              <SceneThumb scene={result.scene} />
              <div className="flex items-baseline justify-between gap-2"><span className="truncate text-xs font-medium">{result.scene.name}</span><span className="text-[11px] text-muted-foreground">{result.scene.duration.toFixed(1)}s</span></div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="xs" onClick={() => addMotionLayer(result.scene)}><Plus />Add at playhead</Button>
                {result.scene.role === 'transition' && <Button size="xs" variant="secondary" onClick={() => addMotionLayer(result.scene, 'cut')}>Add at cut</Button>}
                <DownloadButton scene={result.scene} />
                <Button size="xs" variant="secondary" onClick={() => {
                  if (saved.some((x) => JSON.stringify(x) === JSON.stringify(result.scene))) { notify('Already in My scenes.', 'info'); return; }
                  persist([{ ...result.scene }, ...saved]); notify('Saved to My scenes.', 'success');
                }}>Save</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">To change it, describe the change above and press “Edit this result”.</p>
              <Button size="xs" variant="secondary" className="self-start" disabled={busy || !prompt.trim()} onClick={() => void generate(result.scene)}>Edit this result</Button>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
