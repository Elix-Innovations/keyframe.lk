import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as app_module  # noqa: E402
from app import app  # noqa: E402
from keyframe_sinhala.audio import analyze  # noqa: E402

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not on PATH")

SR = 44_100
client = TestClient(app)


def click_track(path: Path, bpm: float = 120.0, seconds: float = 20.0, first: float = 0.25) -> Path:
    y = np.zeros(int(SR * seconds), np.float32)
    n = int(0.01 * SR)
    t = np.arange(n) / SR
    click = (0.8 * np.sin(2 * np.pi * 1000 * t) * np.exp(-t * 400)).astype(np.float32)
    for at in np.arange(first, seconds - 0.02, 60.0 / bpm):
        i = int(at * SR)
        seg = y[i:i + n]
        seg += click[: len(seg)]
    sf.write(path, y, SR)
    return path


def sine(path: Path, dbfs: float = -20.0, seconds: float = 5.0, freq: float = 1000.0) -> Path:
    t = np.arange(int(SR * seconds)) / SR
    sf.write(path, (10 ** (dbfs / 20) * np.sin(2 * np.pi * freq * t)).astype(np.float32), SR)
    return path


def test_click_track_120_bpm(tmp_path: Path) -> None:
    r = analyze(click_track(tmp_path / "click.wav"))
    assert r["bpm"] is not None and abs(r["bpm"] - 120) <= 2
    beats = np.array(r["beats"])
    assert len(beats) >= 30
    assert abs(float(np.median(np.diff(beats))) - 0.5) < 0.03
    # beats land on clicks (0.25 + k*0.5), within ~2 analysis frames
    phase = (beats - 0.25) % 0.5
    assert np.all(np.minimum(phase, 0.5 - phase) < 0.05)
    assert all(round(b, 3) == b for b in r["beats"])


@pytest.mark.parametrize("bpm", [90.0, 128.0, 150.0])
def test_click_track_other_tempi(tmp_path: Path, bpm: float) -> None:
    r = analyze(click_track(tmp_path / "click.wav", bpm=bpm))
    assert r["bpm"] is not None and abs(r["bpm"] - bpm) <= 2


def test_sine_loudness_and_peak(tmp_path: Path) -> None:
    # BS.1770 is calibrated so a 0 dBFS (peak) 1 kHz sine reads -3.01 LUFS:
    # a -20 dBFS-peak sine is ~-23 LUFS, a -20 dBFS-RMS sine is ~-20 LUFS.
    r = analyze(sine(tmp_path / "sine.wav", dbfs=-20))
    assert r["lufs"] is not None and abs(r["lufs"] - -23) <= 1
    assert abs(r["peak"] - 0.1) < 0.005
    assert r["bpm"] is None and r["beats"] == []
    assert r["sampleRate"] == 48000
    assert abs(r["duration"] - 5.0) < 0.01
    rms = analyze(sine(tmp_path / "rms.wav", dbfs=-20 + 3.0103))
    assert abs(rms["lufs"] - -20) <= 1.5


def test_sine_loudness_relative(tmp_path: Path) -> None:
    a = analyze(sine(tmp_path / "a.wav", dbfs=-20))["lufs"]
    b = analyze(sine(tmp_path / "b.wav", dbfs=-26))["lufs"]
    assert abs((a - b) - 6) < 0.1


def test_silence(tmp_path: Path) -> None:
    p = tmp_path / "silence.wav"
    sf.write(p, np.zeros(SR * 5, np.float32), SR)
    r = analyze(p)
    assert r["lufs"] is None and r["bpm"] is None and r["beats"] == []
    assert r["peak"] == 0
    assert len(r["waveform"]) == 250 and max(r["waveform"]) == 0


def test_too_short_has_no_loudness(tmp_path: Path) -> None:
    r = analyze(sine(tmp_path / "short.wav", seconds=0.2))
    assert r["lufs"] is None and r["peak"] > 0


def test_noise_has_no_tempo(tmp_path: Path) -> None:
    rng = np.random.default_rng(1)
    p = tmp_path / "noise.wav"
    sf.write(p, (0.2 * rng.standard_normal(SR * 15)).astype(np.float32), SR)
    r = analyze(p)
    assert r["bpm"] is None and r["beats"] == []


def test_waveform_shape(tmp_path: Path) -> None:
    r = analyze(click_track(tmp_path / "click.wav", seconds=7.3))
    wf = r["waveform"]
    assert abs(len(wf) - r["duration"] * 50) <= 1
    assert max(wf) == 1.0 and min(wf) >= 0
    # a click every 0.5 s: 20 ms bins alternate between loud and silent
    assert sum(v > 0.5 for v in wf) >= 14


def test_mp3_decoding(tmp_path: Path) -> None:
    wav = click_track(tmp_path / "click.wav")
    mp3 = tmp_path / "click.mp3"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-ac", "2", "-b:a", "128k", str(mp3)],
                   check=True)
    r = analyze(mp3)
    assert abs(r["duration"] - 20) < 0.1
    assert r["bpm"] is not None and abs(r["bpm"] - 120) <= 2
    assert r["lufs"] is not None


def test_api_analyze(tmp_path: Path) -> None:
    wav = click_track(tmp_path / "click.wav", seconds=10)
    with wav.open("rb") as f:
        r = client.post("/api/sinhala/audio/analyze", files={"file": ("click.wav", f, "audio/wav")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"duration", "sampleRate", "bpm", "beats", "lufs", "peak", "waveform"}
    assert abs(body["bpm"] - 120) <= 2
    assert abs(len(body["waveform"]) - 500) <= 1


def test_api_undecodable_is_415() -> None:
    r = client.post("/api/sinhala/audio/analyze", files={"file": ("x.mp3", b"not audio at all" * 100, "audio/mpeg")})
    assert r.status_code == 415


def test_api_missing_file_is_422() -> None:
    r = client.post("/api/sinhala/audio/analyze", data={"nope": "1"})
    assert r.status_code == 422


def test_api_too_large_is_413(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app_module, "AUDIO_MAX_BYTES", 1000)
    r = client.post("/api/sinhala/audio/analyze", files={"file": ("big.wav", b"\0" * 5000, "audio/wav")})
    assert r.status_code == 413
