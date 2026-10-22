/** Read duration, display size and a thumbnail from a video file. */
export function probeVideo(file: Blob): Promise<{ duration: number; width: number; height: number; thumbnail: string | null }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    const done = (thumb: string | null) => {
      resolve({ duration: v.duration || 0, width: v.videoWidth, height: v.videoHeight, thumbnail: thumb });
      URL.revokeObjectURL(url);
    };
    v.onloadedmetadata = () => {
      if (!v.videoWidth) { done(null); return; }
      v.currentTime = Math.min(1, (v.duration || 2) / 2);
    };
    v.onseeked = () => {
      const w = 240, h = Math.round((v.videoHeight / v.videoWidth) * w);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(v, 0, 0, w, h);
      done(c.toDataURL('image/jpeg', 0.7));
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file could not be read as a video.')); };
    setTimeout(() => { URL.revokeObjectURL(url); reject(new Error('Timed out reading the video. Keep this tab in the foreground and try again.')); }, 20000);
  });
}

/** Downsampled peak envelope for the timeline waveform (~100 peaks per second). */
export async function computePeaks(file: Blob, perSecond = 100): Promise<Float32Array | null> {
  if (file.size > 400 * 1024 * 1024) return null; // decoding whole files this large is too memory hungry
  try {
    const buf = await file.arrayBuffer();
    const ac = new OfflineAudioContext(1, 1, 8000);
    const audio = await ac.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const n = Math.ceil(audio.duration * perSecond);
    const step = data.length / n;
    const peaks = new Float32Array(n);
    let max = 0;
    for (let i = 0; i < n; i++) {
      let m = 0;
      const s = Math.floor(i * step), e = Math.min(data.length, Math.floor((i + 1) * step));
      for (let j = s; j < e; j += 4) { const a = Math.abs(data[j]); if (a > m) m = a; }
      peaks[i] = m;
      if (m > max) max = m;
    }
    if (max > 0) for (let i = 0; i < n; i++) peaks[i] /= max;
    return peaks;
  } catch {
    return null;
  }
}

export async function imageThumb(blob: Blob, max = 384): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.75);
}
