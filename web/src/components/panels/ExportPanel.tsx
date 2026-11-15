import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@/store';
import { exportExtension, type AlphaFormat, type ExportOptions, type ScreenColor } from '@/lib/exporter';
import { DEFAULT_SAVE_PREFS, canPickFolder, formatName, loadSavePrefs, pickFolder, saveFile, storeSavePrefs, type SavePrefs } from '@/lib/savePrefs';
import { outputSize } from '@/render/compose';
import { captionsToASS, captionsToCapCutASS, captionsToCapCutSRT, captionsToSRT, captionsToVTT, wordsToPlainText } from '@/lib/srt';
import { getFont } from '@/lib/fonts';
import { pause } from '@/lib/player';
import { Captions, Clapperboard, FileText, X } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { needsMix, sfxEvents } from '@/audio/mix';
import { Progress, Row, Section, Segmented, Toggle } from '../controls';

export function ExportPanel() {
  const project = useEditor((s) => s.project)!;
  const notify = useEditor((s) => s.notify);
  const [longSide, setLongSide] = useState<ExportOptions['longSide']>(1920);
  const [quality, setQuality] = useState<ExportOptions['quality']>('high');
  const [background, setBackground] = useState<ScreenColor>('transparent');
  const [screenAudio, setScreenAudio] = useState(true);
  const [alphaFormat, setAlphaFormat] = useState<AlphaFormat>('mov');
  const transparent = background === 'transparent';
  const prores = transparent && alphaFormat === 'mov';
  const capExt = exportExtension(background, alphaFormat);
  const [progress, setProgress] = useState<number | null>(null);
  // Video export encodes with WebCodecs; Firefox and older Safari lack VideoEncoder.
  const canEncode = typeof VideoEncoder !== 'undefined';
  const [mode, setMode] = useState<'video' | 'captions'>('video');
  const [startedAt, setStartedAt] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const [prefs, setPrefs] = useState<SavePrefs>(DEFAULT_SAVE_PREFS);
  useEffect(() => { loadSavePrefs().then(setPrefs); }, []);
  const changePrefs = (patch: Partial<SavePrefs>) => setPrefs((p) => { const n = { ...p, ...patch }; void storeSavePrefs(n); return n; });
  const chooseFolder = async () => {
    try { const folder = await pickFolder(); if (folder) changePrefs({ folder, mode: 'folder' }); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const save = async (blob: Blob, name: string) => {
    try { return await saveFile(blob, name, prefs); }
    catch (e) { if ((e as Error).name === 'AbortError') return null; throw e; }
  };
  const size = outputSize(project, longSide);
  const src = Math.max(project.videoWidth, project.videoHeight);

  const run = async (captionsOnly: boolean) => {
    const screen = captionsOnly ? background : undefined;
    const ext = exportExtension(screen, alphaFormat);
    pause();
    abort.current = new AbortController();
    setMode(captionsOnly ? 'captions' : 'video');
    setProgress(0);
    setStartedAt(performance.now());
    try {
      const { exportVideo } = await import('../../lib/exporter'); // loads the encoder only when needed
      const blob = await exportVideo(project, { longSide, quality, screen, screenAudio, alphaFormat, onProgress: setProgress, signal: abort.current.signal });
      const kind = !screen ? 'captioned' : transparent ? 'captions-transparent' : `${screen}screen`;
      const where = await save(blob, `${formatName(prefs.videoName, { project: project.name, kind, res: `${size.width}x${size.height}` })}.${ext}`);
      if (where) notify(`Exported ${(blob.size / 1024 / 1024).toFixed(1)} MB → ${where}`, 'success');
    } catch (e) {
      if (!abort.current.signal.aborted) notify((e as Error).message, 'error');
    } finally {
      setProgress(null);
    }
  };

  const eta = progress && progress > 0.02 ? ((performance.now() - startedAt) / progress) * (1 - progress) / 1000 : null;
  const text = async (s: string, ext: string, type = 'text/plain') => {
    try {
      const where = await save(new Blob(['﻿' + s], { type: `${type};charset=utf-8` }), `${formatName(prefs.textName, { project: project.name, kind: ext })}.${ext}`);
      if (where) notify(`Saved ${where}`, 'success');
    } catch (e) { notify((e as Error).message, 'error'); }
  };

  const RenderBar = () => (
    <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
      <div className="flex justify-between text-xs"><span>Rendering {Math.round((progress ?? 0) * 100)}%</span><span className="text-muted-foreground">{eta !== null ? `~${Math.ceil(eta)}s left` : ''}</span></div>
      <Progress value={progress ?? 0} />
      <Button variant="outline" size="sm" className="self-start" onClick={() => abort.current?.abort()}><X />Cancel</Button>
    </div>
  );

  return (
    <div>
      <Section title="Save location & names">
        <Row label="Save to">
          <Segmented size="sm" value={prefs.mode} onChange={(mode) => changePrefs({ mode })} options={[
            { value: 'downloads', label: 'Downloads' },
            ...(canPickFolder() ? [{ value: 'folder' as const, label: 'Folder' }, { value: 'ask' as const, label: 'Ask each time' }] : []),
          ]} />
        </Row>
        {prefs.mode === 'folder' && (
          <div className="flex items-center gap-2 text-xs">
            <Button variant="outline" size="sm" onClick={chooseFolder}>{prefs.folder ? 'Change folder' : 'Choose folder'}</Button>
            <span className="truncate text-muted-foreground">{prefs.folder ? prefs.folder.name : 'No folder chosen — saves to Downloads'}</span>
          </div>
        )}
        {!canPickFolder() && <p className="text-xs text-muted-foreground">Your browser saves to its Downloads folder. Use Chrome or Edge to pick another folder.</p>}
        <Row label="Video name" hint="Tokens: {project} {kind} {date} {time} {res}. The extension is added for you.">
          <Input className="h-8 text-xs" value={prefs.videoName} onChange={(e) => changePrefs({ videoName: e.target.value })} />
        </Row>
        <Row label="Subtitle name" hint="Same tokens. {kind} is the file type, e.g. srt.">
          <Input className="h-8 text-xs" value={prefs.textName} onChange={(e) => changePrefs({ textName: e.target.value })} />
        </Row>
        <div className="text-xs text-muted-foreground">Example: {formatName(prefs.videoName, { project: project.name, kind: 'captioned', res: `${size.width}x${size.height}` })}.mp4</div>
      </Section>
      <Section title="Video with captions">
        {!canEncode && <div role="status" className="rounded-md border border-warn/40 p-2 text-xs text-warn">This browser can't export video (no WebCodecs). Use Chrome or Edge to export MP4. Subtitle files below still work.</div>}
        <Row label="Resolution">
          <Segmented size="sm" value={longSide} onChange={setLongSide} options={[
            { value: 1280, label: '720p' },
            { value: 1920, label: '1080p' },
            { value: 2560, label: '1440p' },
            { value: 3840, label: '4K' },
          ]} />
        </Row>
        <Row label="Quality">
          <Segmented size="sm" value={quality} onChange={setQuality} options={[{ value: 'high', label: 'High' }, { value: 'very-high', label: 'Very high' }]} />
        </Row>
        <div className="text-xs text-muted-foreground">
          Output {size.width}×{size.height} MP4 (H.264, original audio).
          {longSide > src && src > 0 && <span className="text-warn"> Larger than the source ({project.videoWidth}×{project.videoHeight}) — text will be sharper but video won't gain detail.</span>}
        </div>
        {progress === null || mode !== 'video' ? (
          <Button size="sm" className="h-8" disabled={!canEncode || !project.videoAssetId || progress !== null} onClick={() => run(false)}><Clapperboard />Export MP4</Button>
        ) : <RenderBar />}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Audio:</span>
          {!needsMix(project) && <Badge variant="secondary">Original (untouched)</Badge>}
          {project.audio.tracks.length > 0 && <Badge variant="secondary">{project.audio.tracks.length} music track{project.audio.tracks.length > 1 ? 's' : ''}</Badge>}
          {project.audio.tracks.length > 0 && project.audio.ducking.enabled && <Badge variant="secondary">Auto-ducking</Badge>}
          {sfxEvents(project).length > 0 && <Badge variant="secondary">{sfxEvents(project).length} sound effects</Badge>}
          {project.audio.original.enhance && <Badge variant="secondary">Voice enhanced</Badge>}
          {project.audio.original.muted && <Badge variant="secondary">Original muted</Badge>}
          {project.audio.normalize.enabled && <Badge variant="secondary">{project.audio.normalize.targetLufs} LUFS master</Badge>}
        </div>
        {project.audio.tracks.some((t) => t.attribution) && (
          <div className="flex flex-col gap-1.5 rounded-xl border bg-muted/30 p-3">
            <div className="text-xs font-medium">Music credits (paste into your post description)</div>
            <p className="whitespace-pre-line text-[11px] text-muted-foreground">{project.audio.tracks.filter((t) => t.attribution).map((t) => t.attribution).join('\n')}</p>
            <Button variant="outline" size="xs" className="self-start" onClick={() => navigator.clipboard.writeText(project.audio.tracks.filter((t) => t.attribution).map((t) => t.attribution).join('\n')).then(() => notify('Credits copied.', 'success'))}>Copy credits</Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Rendered on your device with the same engine as the preview — what you see is exactly what you get. No upload, no credits.</p>
      </Section>
      <Section title="Captions only video">
        <p className="text-xs text-muted-foreground">Exports just the captions as a video with no footage behind them, to lay over your clip in CapCut, Premiere, DaVinci or After Effects. Uses the resolution above.</p>
        <Row label="Background" hint="Transparent has a real alpha channel: drop it on a track above your footage, no keying needed. Green or blue can be keyed out in any editor.">
          <Segmented size="sm" value={background} onChange={setBackground} options={[
            { value: 'transparent', label: <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[repeating-conic-gradient(#bbb_0_25%,#fff_0_50%)] bg-[length:5px_5px] ring-1 ring-black/20" />Transparent</span> },
            { value: 'green', label: <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#00FF00] ring-1 ring-black/20" />Green</span> },
            { value: 'blue', label: <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#0000FF] ring-1 ring-black/20" />Blue</span> },
          ]} />
        </Row>
        {transparent && (
          <Row label="Format" hint="MOV is Apple ProRes 4444 with premultiplied alpha, the standard transparent format for After Effects, Premiere, Final Cut and DaVinci Resolve. It's encoded by ffmpeg in your local Keyframe.lk server. WebM (VP9 alpha) is much smaller and renders in the browser, but fewer editors read its transparency.">
            <Segmented size="sm" value={alphaFormat} onChange={setAlphaFormat} options={[{ value: 'mov', label: 'MOV · ProRes 4444' }, { value: 'webm', label: 'WebM' }]} />
          </Row>
        )}
        <Row label="Audio" hint="Keep the sound so the overlay is easy to line up with your footage. Mute that track in your editor.">
          <Toggle checked={screenAudio} onChange={setScreenAudio} label="Include audio" />
        </Row>
        <div className="text-xs text-muted-foreground">
          Output {size.width}×{size.height} {prores ? 'MOV (ProRes 4444 + alpha)' : transparent ? 'WebM (VP9 + alpha)' : 'MP4'}, captions only on {transparent ? 'a transparent background' : `${background} screen`}{screenAudio ? (prores ? ', with PCM audio' : ', with audio') : ', silent'}. Same length and timing as your video; B-roll is left out.
        </div>
        {progress === null || mode !== 'captions' ? (
          <Button size="sm" className="h-8" disabled={!canEncode || !project.videoAssetId || progress !== null || !project.captions.length} onClick={() => run(true)}><Clapperboard />Export captions only {{ mov: 'MOV', webm: 'WebM', mp4: 'MP4' }[capExt]}</Button>
        ) : <RenderBar />}
        {!project.captions.length && <p className="text-xs text-muted-foreground">Add captions first.</p>}
        <p className="text-xs text-muted-foreground">{prores
          ? 'Frames are rendered here with the same engine as the preview, then encoded to ProRes by ffmpeg in your local Keyframe.lk server. Nothing leaves your computer.'
          : 'Rendered on your device with the same engine as the preview. No upload, no credits.'}</p>
      </Section>
      <Section title="Subtitle files">
        <div className="text-xs font-medium text-muted-foreground">Without style (text and timing only)</div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" disabled={!project.captions.length} onClick={() => text(captionsToSRT(project.captions), 'srt')}><Captions />SRT (Unicode)</Button>
          <Button variant="outline" size="sm" disabled={!project.captions.length} onClick={() => text(captionsToSRT(project.captions, { legacyFM: true }), 'fm.srt')}><Captions />SRT (Legacy FM)</Button>
          <Button variant="outline" size="sm" disabled={!project.captions.length} onClick={() => text(captionsToVTT(project.captions), 'vtt', 'text/vtt')}>WebVTT</Button>
          <Button variant="outline" size="sm" disabled={!project.captions.length} onClick={() => text(captionsToCapCutSRT(project.captions), 'capcut.srt', 'application/x-subrip')}><Captions />CapCut SRT</Button>
          <Button variant="outline" size="sm" className="col-span-2" disabled={!project.captions.length} onClick={() => text(wordsToPlainText(project.captions), 'txt')}><FileText />Plain transcript (.txt)</Button>
        </div>
        <div className="mt-1 text-xs font-medium text-muted-foreground">With style (colours, font, highlight, position)</div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" disabled={!project.captions.length}
            onClick={() => text(captionsToASS(project.captions, project.style, outputSize(project), { fontFamily: getFont(project.style.text.sinhalaFont).family }), 'ass')}>ASS (styled)</Button>
          <Button variant="outline" size="sm" disabled={!project.captions.length}
            onClick={() => text(captionsToCapCutASS(project.captions, project.style, outputSize(project), { fontFamily: getFont(project.style.text.sinhalaFont).family }), 'capcut.ass')}>CapCut ASS</Button>
        </div>
        <p className="text-xs text-muted-foreground">ASS keeps colors, highlight and position for Premiere, DaVinci and VLC. For CapCut use the CapCut files: in CapCut choose Captions → Local captions (or Import captions) and pick the .srt. CapCut ASS is one plain line per caption.</p>
      </Section>
    </div>
  );
}
