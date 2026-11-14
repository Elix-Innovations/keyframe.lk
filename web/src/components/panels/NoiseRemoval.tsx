import { useRef, useState } from 'react';
import { useEditor } from '@/store';
import * as db from '@/lib/db';
import { decodeOriginal } from '@/audio/decode';
import { denoiseBuffer, encodeWav } from '@/audio/denoise';
import { rnnoiseBuffer } from '@/audio/rnnoise';
import { Button } from '@/components/ui/button';
import { Progress, Row, Section, Segmented, Slider } from '../controls';

/** One-click background-noise removal for the video's own audio (steady noise: fans, hiss, hum, room tone). */
export function NoiseRemoval({ assetId: target }: { assetId?: string } = {}) {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const notify = useEditor((s) => s.notify);
  const asset = target ?? project.videoAssetId;
  const o = project.audio.original;
  const applied = asset ? o.denoiseBy?.[asset] ?? (o.denoise && (o.denoise.sourceAssetId ?? project.videoAssetId) === asset ? o.denoise : undefined) : undefined;
  const [strength, setStrength] = useState(applied?.strength ?? 0.8);
  const [method, setMethod] = useState<'rnnoise' | 'spectral'>(applied?.method ?? 'rnnoise');
  const [progress, setProgress] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const run = async () => {
    if (!asset) { notify('Add a video first.', 'error'); return; }
    const ac = new AbortController();
    abort.current = ac;
    setProgress(0);
    try {
      const file = await db.getBlob(asset);
      if (!file) throw new Error('The video file is missing from local storage.');
      const original = await decodeOriginal(file);
      if (!original) throw new Error('This video has no audio track to clean.');
      let buffer: AudioBuffer, noiseFloorDb: number | null = null;
      if (method === 'rnnoise') buffer = await rnnoiseBuffer(original, strength, setProgress, ac.signal);
      else ({ buffer, noiseFloorDb } = await denoiseBuffer(original, strength, setProgress, ac.signal));
      const cleaned = await db.putBlob(encodeWav(buffer));
      update((p) => {
        const { denoise, ...rest } = p.audio.original;
        // The older single entry moves into the per-asset table so other clips keep their cleaned audio.
        const by = { ...(denoise ? { [denoise.sourceAssetId ?? p.videoAssetId ?? '']: { assetId: denoise.assetId, strength: denoise.strength, method: denoise.method } } : {}), ...rest.denoiseBy, [asset]: { assetId: cleaned, strength, method } };
        return { ...p, audio: { ...p.audio, original: { ...rest, denoiseBy: by } } };
      });
      notify(noiseFloorDb !== null ? `Noise removed. Estimated noise floor was ${noiseFloorDb.toFixed(0)} dB.` : 'Noise removed.', 'success');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') notify((e as Error).message || 'Noise removal failed.', 'error');
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  return (
    <Section title="Noise removal" right={applied && <span className="text-[11px] text-ok">Applied</span>}>
      <Segmented fill size="sm" value={method} onChange={setMethod} options={[{ value: 'rnnoise', label: 'AI voice (RNNoise)' }, { value: 'spectral', label: 'Steady noise' }]} />
      <p className="text-xs text-muted-foreground">
        {method === 'rnnoise'
          ? 'A neural network (RNNoise) keeps the voice and removes everything else: traffic, crowds, keyboard, wind, fans. Best for speech.'
          : 'Cuts steady background noise (fans, hiss, hum, room tone) only. Fast, and gentler on music.'} Your original file is not changed; revert any time.
      </p>
      <Row label="Strength"><Slider value={strength} min={0.1} max={1} step={0.05} onChange={setStrength} format={(v) => `${Math.round(v * 100)}%`} /></Row>
      {progress !== null && <Progress value={progress} />}
      <div className="flex justify-end gap-2">
        {applied && progress === null && (
          <Button variant="ghost" size="sm" onClick={() => update((p) => {
            const { denoise, denoiseBy, ...rest } = p.audio.original;
            const by = { ...(denoise ? { [denoise.sourceAssetId ?? p.videoAssetId ?? '']: { assetId: denoise.assetId, strength: denoise.strength, method: denoise.method } } : {}), ...denoiseBy };
            delete by[asset!];
            return { ...p, audio: { ...p.audio, original: { ...rest, denoiseBy: by } } };
          })}>Revert</Button>
        )}
        {progress !== null
          ? <Button variant="secondary" size="sm" onClick={() => abort.current?.abort()}>Cancel</Button>
          : <Button size="sm" onClick={() => void run()}>{applied ? 'Re-run' : 'Remove noise'}</Button>}
      </div>
    </Section>
  );
}
