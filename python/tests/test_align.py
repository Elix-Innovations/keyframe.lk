import io
import sys
import wave
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app  # noqa: E402
from keyframe_sinhala import align  # noqa: E402

client = TestClient(app)


def test_finish_places_unalignable_words_between_neighbours() -> None:
    # "2026" has no letters the model knows, so it is fitted into the gap it sits in.
    out = align._finish([(0.0, 0.5), None, (1.5, 2.0)], duration=3.0)
    assert out == [(0.0, 0.5), (0.5, 1.5), (1.5, 2.0)]


def test_finish_closes_short_gaps_only() -> None:
    out = align._finish([(0.0, 0.4), (0.5, 0.9), (2.0, 2.4)], duration=3.0)
    assert out[0] == (0.0, 0.5)  # 0.1 s gap: part of the word
    assert out[1] == (0.5, 0.9)  # 1.1 s gap: a real pause, kept


def test_finish_trailing_unaligned_words_run_to_the_end() -> None:
    assert align._finish([(0.0, 1.0), None, None], duration=2.0) == [(0.0, 1.0), (1.0, 1.5), (1.5, 2.0)]


def _wav(seconds: float) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16_000)
        w.writeframes(np.zeros(int(16_000 * seconds), dtype=np.int16).tobytes())
    return buf.getvalue()


def test_align_rejects_bad_words_field() -> None:
    r = client.post("/api/sinhala/align", files={"file": ("a.wav", _wav(1), "audio/wav")}, data={"words": "not json"})
    assert r.status_code == 422
    r = client.post("/api/sinhala/align", files={"file": ("a.wav", _wav(1), "audio/wav")}, data={"words": "[1, 2]"})
    assert r.status_code == 422


def test_health_reports_aligner_state() -> None:
    assert client.get("/api/sinhala/health").json()["align"] in {"ready", "available", "downloading", "missing", "unavailable"}


@pytest.mark.skipif(align.status() not in {"ready", "available"}, reason="alignment model not downloaded (npm run align:fetch)")
def test_align_times_follow_the_speech() -> None:
    # Synthetic "speech": two bursts of voiced noise with silence around them. Two words, two bursts.
    sr = 16_000
    rng = np.random.default_rng(0)
    audio = np.zeros(sr * 4, dtype=np.float32)
    t = np.arange(int(sr * 0.6)) / sr
    burst = (0.3 * np.sin(2 * np.pi * 180 * t) * (1 + 0.5 * rng.standard_normal(t.size))).astype(np.float32)
    audio[sr * 1 : sr * 1 + burst.size] = burst
    audio[int(sr * 2.5) : int(sr * 2.5) + burst.size] = burst
    try:
        times, _ = align.align(audio, ["aaa", "ooo"], "en")
    except align.AlignmentRejected:
        pytest.skip("model rejected synthetic audio")
    assert len(times) == 2
    assert times[0][0] < times[1][0]
    assert all(0 <= s < e <= 4.0 for s, e in times)
