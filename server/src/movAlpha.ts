/**
 * Make sure a ProRes 4444 .mov says it has an alpha channel.
 *
 * Editors (Premiere, After Effects, CapCut, QuickTime) decide whether to use a ProRes 4444 alpha plane from the
 * `depth` field of the video sample description: 32 means "has alpha", 24 means "ignore it". Some ffmpeg builds
 * (ffmpeg 6.0's prores_videotoolbox, which the desktop app bundles) encode the alpha plane but write depth 24,
 * so the export looks black. This rewrites that one field in place; the video data is untouched.
 */
import { open, type FileHandle } from 'node:fs/promises';

const ALPHA_CODECS = new Set(['ap4h', 'ap4x']);
// Offset of `depth` from the sample entry's 4CC: reserved(6) data-ref(2) version(2) revision(2) vendor(4)
// temporal(4) spatial(4) width(2) height(2) hres(4) vres(4) data-size(4) frame-count(2) compressor-name(32).
const DEPTH_OFFSET = 4 + 6 + 2 + 2 + 2 + 4 + 4 + 4 + 2 + 2 + 4 + 4 + 4 + 2 + 32; // = 78

async function readAt(f: FileHandle, pos: number, len: number) {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await f.read(buf, 0, len, pos);
  return buf.subarray(0, bytesRead);
}

/** Top-level atoms: returns the [start, size] of the `moov` atom, or null. */
async function findMoov(f: FileHandle, fileSize: number): Promise<[number, number] | null> {
  let pos = 0;
  while (pos + 8 <= fileSize) {
    const head = await readAt(f, pos, 16);
    let size = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    if (size === 1) size = Number(head.readBigUInt64BE(8));
    else if (size === 0) size = fileSize - pos;
    if (size < 8) return null;
    if (type === 'moov') return [pos, size];
    pos += size;
  }
  return null;
}

/** Patch depth 24 -> 32 on every ProRes 4444 sample entry. Returns how many entries were changed. */
export async function ensureAlphaDepth(file: string): Promise<number> {
  const f = await open(file, 'r+');
  try {
    const { size } = await f.stat();
    const moov = await findMoov(f, size);
    if (!moov || moov[1] > 512 * 1024 * 1024) return 0;
    const buf = await readAt(f, moov[0], moov[1]);
    let changed = 0;
    for (let i = buf.indexOf('stsd'); i !== -1; i = buf.indexOf('stsd', i + 4)) {
      // stsd: size(4) 'stsd' version/flags(4) entry-count(4), then entries of size(4) + 4CC.
      const count = buf.readUInt32BE(i + 8);
      let entry = i + 12;
      for (let n = 0; n < count && entry + 8 <= buf.length; n++) {
        const entrySize = buf.readUInt32BE(entry);
        const fourcc = buf.toString('latin1', entry + 4, entry + 8);
        const depthAt = entry + 4 + DEPTH_OFFSET;
        if (ALPHA_CODECS.has(fourcc) && depthAt + 2 <= buf.length && buf.readUInt16BE(depthAt) !== 32) {
          const patch = Buffer.alloc(2);
          patch.writeUInt16BE(32);
          await f.write(patch, 0, 2, moov[0] + depthAt);
          changed++;
        }
        if (entrySize < 8) break;
        entry += entrySize;
      }
    }
    return changed;
  } finally {
    await f.close();
  }
}
