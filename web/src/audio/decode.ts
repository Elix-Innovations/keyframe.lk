import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';

/** Decode the source video's audio into one AudioBuffer (null if it has no audio). */
export async function decodeOriginal(file: Blob): Promise<AudioBuffer | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track || !(await track.canDecode())) return null;
  const duration = await track.computeDuration();
  const sr = track.sampleRate, ch = Math.min(2, track.numberOfChannels);
  const out = new AudioBuffer({ length: Math.max(1, Math.ceil(duration * sr) + sr), numberOfChannels: ch, sampleRate: sr });
  const sink = new AudioBufferSink(track);
  for await (const { buffer, timestamp } of sink.buffers()) {
    const at = Math.round(Math.max(0, timestamp) * sr);
    for (let c = 0; c < ch; c++) {
      const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
      const room = out.length - at;
      if (room <= 0) break;
      out.copyToChannel(room >= src.length ? src : src.subarray(0, room), c, at);
    }
  }
  return out;
}


/** Does the file have a decodable audio track? */
export async function hasAudio(file: Blob): Promise<boolean> {
  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const t = await input.getPrimaryAudioTrack();
    return !!t && (await t.canDecode());
  } catch { return false; }
}
