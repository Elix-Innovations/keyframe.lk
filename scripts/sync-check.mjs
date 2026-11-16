#!/usr/bin/env node
/**
 * Caption sync check: measures how far word timings land from the real word onsets.
 *
 * Builds a test clip from separately spoken words (macOS `say`) joined with known gaps, so every
 * word's true start is known, then times it and reports the onset error:
 *
 *   node scripts/sync-check.mjs                 # forced aligner only (python service on :8788)
 *   node scripts/sync-check.mjs --api gemini    # full /api/transcribe on :8787 with a provider
 *   node scripts/sync-check.mjs --indic         # non-Latin script (Hindi voice), checks romanised alignment
 *
 * Variants: plain WAV, 64 kbps MP3 (encoder delay), and an MP4 whose audio starts 150 ms after the
 * video (audio stream start offset). Target: mean |error| <= 30 ms, max <= 80 ms.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, openAsBlob, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const apiProvider = args.includes('--api') ? args[args.indexOf('--api') + 1] || 'auto' : null;
const ALIGN = process.env.SINHALA_SERVICE_URL || 'http://localhost:8788';
const API = process.env.API_URL || 'http://localhost:8787';
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';

const indic = args.includes('--indic');
const LANG = indic ? 'si' : 'en'; // anything but 'en' takes the non-English (uroman) path
const VOICE = indic ? ['-v', 'Lekha'] : [];
const SENTENCE = indic
  ? 'आज हम एक छोटा वीडियो बनाएंगे जिसमें हर शब्द के साथ कैप्शन चलेंगे ताकि देखने वाले आसानी से पढ़ सकें और समझ सकें'.split(' ')
  : ('today we are going to edit a short video with captions that follow every single word ' +
  'so the viewer can read along while the speaker talks about the new release and 25 small fixes').split(' ');
const SPOKEN = { 25: 'twenty five' };
const GAPS = [0.04, 0.12, 0.06, 0.3, 0.08, 0.5, 0.05, 0.15, 0.07, 0.9];

const dir = mkdtempSync(path.join(os.tmpdir(), 'sync-check-'));
const sh = (cmd, a) => execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const dur = (f) => parseFloat(sh(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));

function build() {
  const parts = [];
  const truth = [];
  let t = 0;
  const silence = (s, i) => {
    const f = path.join(dir, `s${i}.wav`);
    sh(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', s.toFixed(3), '-c:a', 'pcm_s16le', f]);
    parts.push(f);
    t += dur(f);
  };
  silence(0.7, 'lead');
  SENTENCE.forEach((word, i) => {
    const aiff = path.join(dir, `w${i}.aiff`);
    const wav = path.join(dir, `w${i}.wav`);
    sh('say', [...VOICE, '-o', aiff, SPOKEN[word] ?? word]);
    // Trim the synthesiser's own leading/trailing silence so the clip starts exactly at the onset.
    sh(ffmpeg, ['-y', '-i', aiff, '-ac', '1', '-ar', '16000', '-af',
      'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0,areverse',
      '-c:a', 'pcm_s16le', wav]);
    truth.push({ text: word, start: t });
    parts.push(wav);
    t += dur(wav);
    if (i < SENTENCE.length - 1) silence(GAPS[i % GAPS.length], i);
  });
  silence(0.6, 'tail');
  const list = path.join(dir, 'list.txt');
  writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  const wav = path.join(dir, 'clip.wav');
  sh(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'pcm_s16le', wav]);
  const mp3 = path.join(dir, 'clip.mp3');
  sh(ffmpeg, ['-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '64k', mp3]);
  // Audio stream starts 150 ms after the video: true onsets in the app's timeline move by +0.15.
  const mp4 = path.join(dir, 'clip.mp4');
  sh(ffmpeg, ['-y', '-f', 'lavfi', '-i', `color=c=black:s=320x240:r=30:d=${(t + 0.2).toFixed(2)}`, '-itsoffset', '0.15', '-i', wav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', mp4]);
  const a0 = parseFloat(sh(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=start_time', '-of', 'csv=p=0', mp4])) || 0;
  return { truth, variants: [{ name: 'wav', file: wav, shift: 0 }, { name: 'mp3', file: mp3, shift: 0 }, { name: 'mp4 +150ms audio', file: mp4, shift: a0 }] };
}

async function viaAligner(file) {
  const form = new FormData();
  form.append('file', await openAsBlob(file), path.basename(file));
  form.append('words', JSON.stringify(SENTENCE));
  form.append('language', LANG);
  const res = await fetch(`${ALIGN}/api/sinhala/align`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`aligner ${res.status}: ${await res.text()}`);
  const { words } = await res.json();
  return words.map(([start], i) => ({ text: SENTENCE[i], start }));
}

async function viaApi(file) {
  const form = new FormData();
  form.append('file', await openAsBlob(file), path.basename(file));
  const res = await fetch(`${API}/api/transcribe?language=${LANG}&provider=${apiProvider}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { words: data.words, note: `${data.provider}${data.alignment ? `, aligned ${data.alignment.aligned}/${data.alignment.total}` : ''}` };
}

const norm = (s) => s.toLowerCase().replace(/[\s.,!?'"“”‘’।-]/g, '');

/** Pair hypothesis words with truth words in order (greedy text match, skipping mismatches). */
function errors(truth, hyp, shift) {
  const out = [];
  let j = 0;
  for (const w of truth) {
    for (let k = j; k < Math.min(hyp.length, j + 4); k++) {
      if (norm(hyp[k].text) === norm(w.text) || (SPOKEN[w.text] && norm(hyp[k].text).startsWith('twenty'))) {
        out.push({ text: w.text, err: hyp[k].start - (w.start + shift) });
        j = k + 1;
        break;
      }
    }
  }
  return out;
}

const { truth, variants } = build();
console.log(`clip: ${truth.length} words, ${dir}`);
console.log(apiProvider ? `mode: /api/transcribe provider=${apiProvider}` : 'mode: forced aligner directly (no provider)');
let worst = 0;
for (const v of variants) {
  try {
    const r = apiProvider ? await viaApi(v.file) : { words: await viaAligner(v.file), note: '' };
    const e = errors(truth, r.words, v.shift);
    const abs = e.map((x) => Math.abs(x.err) * 1000);
    const mean = abs.reduce((a, b) => a + b, 0) / Math.max(1, abs.length);
    const bias = e.reduce((a, b) => a + b.err * 1000, 0) / Math.max(1, e.length);
    const max = Math.max(...abs);
    worst = Math.max(worst, max);
    const bad = e.filter((x) => Math.abs(x.err) > 0.08).map((x) => `${x.text}:${Math.round(x.err * 1000)}`).join(' ');
    console.log(`${v.name.padEnd(18)} matched ${String(e.length).padStart(2)}/${truth.length}  mean ${mean.toFixed(0).padStart(3)} ms  bias ${bias >= 0 ? '+' : ''}${bias.toFixed(0)} ms  max ${max.toFixed(0)} ms ${r.note}${bad ? `\n  > 80 ms: ${bad}` : ''}`);
  } catch (err) {
    console.log(`${v.name.padEnd(18)} failed: ${err.message}`);
    worst = Infinity;
  }
}
if (args.includes('--json')) console.log(JSON.stringify({ truth }, null, 2));
process.exitCode = worst <= 80 ? 0 : 1;
