"""Forced alignment: exact word timings for a known transcript.

Gemini writes good Sinhala text, but its word timestamps are guesses that drift by
seconds inside a clip (captions run ahead, then stall). This module keeps the text
and re-times every word from the audio itself, the same idea WhisperX uses:

1. Romanize each word with uroman (Sinhala, English and code-mixed text all work).
2. Run Meta's MMS-300m forced-alignment model (1130 languages) to get per-frame
   character probabilities (CTC emissions, one frame per 20 ms).
3. Find the most likely path that spells the transcript in order (CTC Viterbi),
   and read each word's first and last frame off that path.

The model (~1.2 GB) is downloaded once into the Hugging Face cache. Run
`npm run align:fetch` to fetch it ahead of time; until it is present, `align()`
raises `ModelUnavailable` and callers keep the transcriber's own timings.
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass

import numpy as np

# Xet transfers stalled indefinitely in testing; plain HTTP downloads reliably.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

MODEL_ID = os.environ.get("ALIGN_MODEL", "MahmoudAshraf/mms-300m-1130-forced-aligner")
# Pinned commit of the default model, so every install gets the same, reviewed weights. A custom ALIGN_MODEL uses its main branch.
MODEL_REVISION = os.environ.get("ALIGN_MODEL_REVISION") or (
    "49402e9577b1158620820667c218cd494cc44486" if MODEL_ID == "MahmoudAshraf/mms-300m-1130-forced-aligner" else None)
MODEL_FILES = ["*.json", "model.safetensors"]
SR = 16_000
WINDOW_S = 30  # emissions are computed in 30 s windows ...
CONTEXT_S = 2  # ... with 2 s of extra audio either side, then trimmed
# Mean per-frame log-prob of the forced path relative to the unconstrained best path.
# Correct transcripts scored -0.17 to -0.49 in testing; wrong or shuffled text scored
# -1.0 or lower. Below this the text doesn't match the audio, so the timings are rejected.
MIN_SCORE = -0.8
# Word ends from CTC are early (characters are "peaky"), so a short gap before the
# next word is treated as part of the word; longer gaps stay as real pauses.
CLOSE_GAP_S = 0.25


class ModelUnavailable(RuntimeError):
    """The alignment model or its Python packages are not installed yet."""


class AlignmentRejected(RuntimeError):
    """The transcript does not match the audio well enough to trust the timings."""


@dataclass
class _Model:
    model: object
    vocab: dict[str, int]
    uroman: object


_lock = threading.Lock()
_loaded: _Model | None = None
_download: threading.Thread | None = None


def _deps():
    try:
        import torch  # noqa: F401
        import uroman  # noqa: F401
        from huggingface_hub import snapshot_download  # noqa: F401
        from transformers import AutoTokenizer, Wav2Vec2ForCTC  # noqa: F401
    except ImportError as e:  # pragma: no cover - depends on the environment
        raise ModelUnavailable(f"alignment packages are not installed ({e.name}); run `uv sync --project python`") from e


def _local_path() -> str | None:
    from huggingface_hub import snapshot_download
    try:
        return snapshot_download(MODEL_ID, revision=MODEL_REVISION, allow_patterns=MODEL_FILES, local_files_only=True)
    except Exception:  # noqa: BLE001 - any cache miss means "not downloaded"
        return None


def fetch() -> str:
    """Download the model into the Hugging Face cache (blocking). Returns its path."""
    _deps()
    from huggingface_hub import snapshot_download
    return snapshot_download(MODEL_ID, revision=MODEL_REVISION, allow_patterns=MODEL_FILES)


def status() -> str:
    """'ready' (loaded), 'available' (downloaded), 'downloading', 'missing' or 'unavailable'."""
    if _loaded is not None:
        return "ready"
    try:
        _deps()
    except ModelUnavailable:
        return "unavailable"
    if _download is not None and _download.is_alive():
        return "downloading"
    return "available" if _local_path() else "missing"


def _start_download() -> None:
    global _download
    if _download is not None and _download.is_alive():
        return
    _download = threading.Thread(target=fetch, name="align-model-download", daemon=True)
    _download.start()


def _load() -> _Model:
    global _loaded
    if _loaded is not None:
        return _loaded
    _deps()
    path = _local_path()
    if path is None:
        _start_download()
        raise ModelUnavailable("the alignment model is downloading (~1.2 GB, one time); captions use the transcriber's timings until it is ready")
    import torch
    import uroman
    from transformers import AutoTokenizer, Wav2Vec2ForCTC

    torch.set_grad_enabled(False)
    model = Wav2Vec2ForCTC.from_pretrained(path).eval()
    vocab = AutoTokenizer.from_pretrained(path).get_vocab()
    _loaded = _Model(model=model, vocab=vocab, uroman=uroman.Uroman())
    return _loaded


def _emissions(m: _Model, audio: np.ndarray) -> np.ndarray:
    """Log-probabilities, shape (frames, vocab), in windows so memory stays flat."""
    import torch

    step, ctx = WINDOW_S * SR, CONTEXT_S * SR
    parts = []
    with torch.inference_mode():
        for s in range(0, len(audio), step):
            a, b = max(0, s - ctx), min(len(audio), s + step + ctx)
            x = torch.from_numpy(np.ascontiguousarray(audio[a:b]))[None]
            x = (x - x.mean()) / (x.std() + 1e-7)
            lp = torch.log_softmax(m.model(x).logits[0], -1).numpy()  # type: ignore[attr-defined]
            fps = lp.shape[0] / ((b - a) / SR)
            lo = int(round((s - a) / SR * fps))
            hi = lo + int(round(min(step, len(audio) - s) / SR * fps))
            parts.append(lp[lo:hi])
    return np.concatenate(parts)


def _tokens(m: _Model, text: str, lcode: str | None) -> list[int]:
    roman = m.uroman.romanize_string(text, lcode=lcode).lower()  # type: ignore[attr-defined]
    return [m.vocab[c] for c in roman if m.vocab.get(c, 0) > 3]  # skip <blank>/<pad>/</s>/<unk>


def _viterbi(em: np.ndarray, seq: list[int]) -> tuple[np.ndarray, float]:
    """Best CTC path through the blank-interleaved `seq`. Returns (state per frame, score)."""
    T = em.shape[0]
    S = 2 * len(seq) + 1
    lab = np.zeros(S, dtype=np.int64)
    lab[1::2] = seq
    seq_arr = np.asarray(seq)
    skip = np.zeros(S, dtype=bool)
    skip[3::2] = seq_arr[1:] != seq_arr[:-1]  # may jump over a blank between different letters
    neg = -1e30
    dp = np.full(S, neg)
    dp[0], dp[1] = em[0, 0], em[0, lab[1]]
    back = np.zeros((T, S), dtype=np.int8)
    cols = np.arange(S)
    for t in range(1, T):
        cand = np.stack([dp, np.concatenate(([neg], dp[:-1])), np.where(skip, np.concatenate(([neg, neg], dp[:-2])), neg)])
        arg = cand.argmax(0)
        dp = cand[arg, cols] + em[t, lab]
        back[t] = arg
    s = S - 1 if dp[-1] >= dp[-2] else S - 2
    score = float(max(dp[-1], dp[-2]) - em.max(1).sum()) / T
    path = np.empty(T, dtype=np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= int(back[t, s])
    return path, score


def align(audio: np.ndarray, words: list[str], language: str = "si") -> tuple[list[tuple[float, float]], float]:
    """Time each of `words` in mono 16 kHz float32 `audio`.

    Returns ([(start, end)] per word, score). Words with nothing to align (digits,
    symbols) are placed in the gap between their neighbours.
    """
    duration = len(audio) / SR
    if not words:
        return [], 0.0
    with _lock:  # one alignment at a time: the model is large and already multithreaded
        m = _load()
        lcode = "sin" if language != "en" else "eng"
        per_word = [_tokens(m, w, lcode) for w in words]
        seq = [t for toks in per_word for t in toks]
        if not seq:
            raise AlignmentRejected("no alignable letters in the transcript")
        em = _emissions(m, audio)
    if em.shape[0] < len(seq):
        raise AlignmentRejected("the transcript is longer than the audio can hold")
    path, score = _viterbi(em, seq)
    if score < MIN_SCORE:
        raise AlignmentRejected(f"transcript does not match the audio (score {score:.2f})")

    frame = duration / em.shape[0]
    owner = np.repeat(np.arange(len(words)), [len(t) for t in per_word])
    first: dict[int, int] = {}
    last: dict[int, int] = {}
    for t, s in enumerate(path):
        if s % 2:
            i = int(owner[s // 2])
            first.setdefault(i, t)
            last[i] = t
    times: list[tuple[float, float] | None] = [
        (first[i] * frame, (last[i] + 1) * frame) if i in first else None for i in range(len(words))
    ]
    return _finish(times, duration), score


def _finish(times: list[tuple[float, float] | None], duration: float) -> list[tuple[float, float]]:
    """Fill words that had nothing to align, then close short gaps between words."""
    out: list[tuple[float, float]] = []
    i = 0
    while i < len(times):
        if times[i] is not None:
            out.append(times[i])  # type: ignore[arg-type]
            i += 1
            continue
        j = i
        while j < len(times) and times[j] is None:
            j += 1
        lo = out[-1][1] if out else 0.0
        hi = times[j][0] if j < len(times) else duration  # type: ignore[index]
        n = j - i
        step = max(hi - lo, 0.0) / n
        out.extend((lo + k * step, lo + (k + 1) * step) for k in range(n))
        i = j
    for k in range(len(out) - 1):
        start, end = out[k]
        nxt = out[k + 1][0]
        if 0 <= nxt - end < CLOSE_GAP_S:
            out[k] = (start, nxt)
    return [(round(s, 3), round(max(e, s + 0.02), 3)) for s, e in out]
