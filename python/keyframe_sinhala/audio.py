"""Audio analysis for the editor's music lane: tempo/beats, loudness, waveform.

`analyze(path)` decodes any container/codec ffmpeg understands and returns the
`AudioAnalyzeResponse` shape from web/src/types.ts:

    {duration, sampleRate, bpm, beats, lufs, peak, waveform}

* loudness: ITU-R BS.1770 integrated loudness (pyloudnorm) on the original
  channels at 48 kHz; None for silence or clips shorter than 0.4 s.
* peak: max |sample| (linear, all channels).
* waveform: 50 peak values per second of audio, normalized so the max is 1.
* beats/bpm: librosa onset envelope + dynamic-programming beat tracker at
  22050 Hz. bpm is None (and beats empty) when there is no reliable pulse,
  e.g. speech, ambience or noise.
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

LOUDNESS_SR = 48_000
BEAT_SR = 22_050
HOP = 512
WAVEFORM_RATE = 50  # values per second
MIN_LOUDNESS_SECONDS = 0.4
MAX_SECONDS = 60 * 60  # decode at most one hour of audio
SILENCE_PEAK = 1e-4  # ~ -80 dBFS
# Pulse-clarity threshold: normalized autocorrelation of the onset envelope at
# the detected beat period. Click tracks/music sit well above ~0.3; speech,
# ambience and noise sit below.
MIN_PULSE_CLARITY = 0.2
MIN_BEAT_SECONDS = 4.0


class DecodeError(RuntimeError):
    """ffmpeg could not decode an audio stream from the input."""


def _ffmpeg() -> str:
    # FFMPEG_PATH first: the desktop apps ship or locate ffmpeg themselves, and GUI apps don't inherit the shell PATH.
    env = os.environ.get("FFMPEG_PATH")
    if env and os.path.isfile(env):
        return env
    exe = shutil.which("ffmpeg")
    if not exe:
        raise DecodeError("ffmpeg not found (install it, or set FFMPEG_PATH)")
    return exe


def ffmpeg_available() -> bool:
    try:
        _ffmpeg()
        return True
    except DecodeError:
        return False


def decode(path: str | os.PathLike[str], sr: int = LOUDNESS_SR) -> np.ndarray:
    """Decode the first audio stream to float32, shape (frames, channels)."""
    fd, tmp = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        cmd = [_ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
               # Only plain files: an uploaded playlist (HLS / concat) must not make ffmpeg read other files or URLs.
               "-protocol_whitelist", "file,pipe",
               "-i", str(path), "-map", "0:a:0", "-vn", "-sn", "-dn",
               "-t", str(MAX_SECONDS), "-ar", str(sr), "-c:a", "pcm_f32le", tmp]
        proc = subprocess.run(cmd, capture_output=True, timeout=600)
        if proc.returncode != 0 or os.path.getsize(tmp) <= 44:
            msg = proc.stderr.decode("utf-8", "replace").strip().splitlines()
            raise DecodeError(msg[-1] if msg else "no audio stream")
        data, _ = sf.read(tmp, dtype="float32", always_2d=True)
        return data
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def _loudness(data: np.ndarray, sr: int, peak: float) -> float | None:
    if data.shape[0] < MIN_LOUDNESS_SECONDS * sr or peak < SILENCE_PEAK:
        return None
    import pyloudnorm as pyln

    if data.shape[1] > 5:  # pyloudnorm weights up to 5 channels
        data = data.mean(axis=1, keepdims=True)
    try:
        lufs = pyln.Meter(sr).integrated_loudness(data if data.shape[1] > 1 else data[:, 0])
    except Exception:  # noqa: BLE001
        return None
    if not math.isfinite(lufs) or lufs < -70:
        return None
    return round(float(lufs), 2)


def _waveform(mono: np.ndarray, sr: int) -> list[float]:
    n = int(math.ceil(len(mono) * WAVEFORM_RATE / sr)) if len(mono) else 0
    if n == 0:
        return []
    edges = (np.arange(n + 1) * sr / WAVEFORM_RATE).astype(np.int64)
    edges[-1] = len(mono)
    absd = np.abs(mono)
    starts = np.minimum(edges[:-1], len(mono) - 1)
    peaks = np.maximum.reduceat(absd, starts)
    top = float(peaks.max())
    if top <= 0:
        return [0.0] * n
    return [round(float(v), 4) for v in peaks / top]


def _beats(mono: np.ndarray, sr: int) -> tuple[float | None, list[float]]:
    import librosa

    if len(mono) < MIN_BEAT_SECONDS * sr or float(np.max(np.abs(mono))) < SILENCE_PEAK:
        return None, []
    y = librosa.resample(mono, orig_sr=sr, target_sr=BEAT_SR, res_type="soxr_hq") if sr != BEAT_SR else mono
    env = librosa.onset.onset_strength(y=y, sr=BEAT_SR, hop_length=HOP, aggregate=np.median)
    if not np.any(env > 0):
        return None, []
    tempo, frames = librosa.beat.beat_track(onset_envelope=env, sr=BEAT_SR, hop_length=HOP,
                                            start_bpm=120.0, tightness=100, units="frames")
    bpm = float(np.atleast_1d(tempo)[0])
    if not (30 <= bpm <= 300) or len(frames) < 4:
        return None, []
    # Fold into 60..180 BPM (the usual editing range); keep the beat grid consistent.
    while bpm < 60:
        bpm *= 2
        frames = np.sort(np.concatenate([frames, (frames[:-1] + frames[1:]) // 2]))
    while bpm > 180:
        bpm /= 2
        frames = frames[::2]

    # Pulse clarity: normalized autocorrelation of the (mean-removed) onset
    # envelope around the beat period.
    e = env - env.mean()
    denom = float(np.dot(e, e))
    if denom <= 0:
        return None, []
    lag = 60.0 * BEAT_SR / HOP / bpm
    ac = np.correlate(e, e, mode="full")[len(e) - 1:] / denom
    lo, hi = max(1, int(math.floor(lag * 0.95))), int(math.ceil(lag * 1.05)) + 1
    if hi >= len(ac):
        return None, []
    clarity = float(ac[lo:hi].max())
    if clarity < MIN_PULSE_CLARITY:
        return None, []

    times = librosa.frames_to_time(frames, sr=BEAT_SR, hop_length=HOP)
    # The tracker's tempo is quantized to whole-frame lags (~2% at 120 BPM);
    # a least-squares line through the beat times over a steady stretch is
    # far more precise.
    ibi = np.diff(times)
    med = float(np.median(ibi))
    steady = np.abs(ibi - med) < 0.1 * med
    if steady.sum() >= 3:
        idx = np.concatenate([[0], np.cumsum(np.rint(ibi / med))])
        slope = float(np.polyfit(idx, times, 1)[0])
        if slope > 0 and abs(60.0 / slope - bpm) < 0.08 * bpm:
            bpm = 60.0 / slope
    return round(bpm, 1), [round(float(t), 3) for t in times]


def analyze(path: str | os.PathLike[str]) -> dict:
    """Analyze an audio (or video) file. Raises DecodeError if undecodable."""
    path = Path(path)
    data = decode(path, LOUDNESS_SR)
    sr = LOUDNESS_SR
    mono = data.mean(axis=1) if data.shape[1] > 1 else data[:, 0]
    duration = len(mono) / sr
    peak = float(np.max(np.abs(data))) if data.size else 0.0
    lufs = _loudness(data, sr, peak)
    waveform = _waveform(mono, sr)
    bpm, beats = _beats(mono, sr)
    return {
        "duration": round(duration, 3),
        "sampleRate": sr,
        "bpm": bpm,
        "beats": beats,
        "lufs": lufs,
        "peak": round(peak, 6),
        "waveform": waveform,
    }
