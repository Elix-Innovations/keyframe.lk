"""Keyframe.lk Sinhala/FM service (FastAPI, port 8788).

    uv run --project python uvicorn app:app --app-dir python --port 8788 --reload

Live conversion in the editor runs in TypeScript (web/src/lib/fm.ts); this
service offers the same conversions for batch jobs (whole SRT files), the
font manifest and a health check. Next.js rewrites /api/sinhala here.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from keyframe_sinhala import __version__, align as aligner
from keyframe_sinhala.audio import DecodeError, analyze as analyze_audio, decode as decode_audio
from keyframe_sinhala.fm import fm_to_unicode, load_table, unicode_to_fm
from keyframe_sinhala.fontutil import MANIFEST_PATH
from keyframe_sinhala.wijesekara import type_keys

Direction = Literal["u2fm", "fm2u"]

app = FastAPI(title="Keyframe.lk Sinhala service", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


def convert(text: str, direction: Direction) -> str:
    return unicode_to_fm(text) if direction == "u2fm" else fm_to_unicode(text)


class ConvertIn(BaseModel):
    text: str = Field(max_length=1_000_000)
    direction: Direction = "u2fm"


class ConvertOut(BaseModel):
    text: str
    direction: Direction


class SrtIn(BaseModel):
    srt: str = Field(max_length=5_000_000)
    direction: Direction = "u2fm"


class SrtOut(BaseModel):
    srt: str
    direction: Direction
    cues: int


class WijesekaraIn(BaseModel):
    keys: str = Field(max_length=100_000)


class WijesekaraOut(BaseModel):
    text: str


_TIMING = re.compile(r"^\s*\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}\s*-->\s*\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}")


def convert_srt(srt: str, direction: Direction) -> tuple[str, int]:
    """Re-encode cue text only; indexes, timings, WEBVTT headers and blank
    lines are kept byte-for-byte."""
    text = srt.lstrip("﻿")
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(nl)
    out: list[str] = []
    cues = 0
    in_cue = False
    for line in lines:
        if _TIMING.match(line):
            in_cue = True
            cues += 1
            out.append(line)
        elif not line.strip():
            in_cue = False
            out.append(line)
        elif in_cue:
            out.append(convert(line, direction))
        else:
            out.append(line)  # cue number, WEBVTT header, NOTE blocks
    return nl.join(out), cues


@app.get("/api/sinhala/health")
def health() -> dict:
    t = load_table()
    return {"ok": True, "service": "keyframe-sinhala", "version": __version__, "table": t["version"],
            "verifiedFonts": len(t.get("verified", {})), "align": aligner.status()}


@app.post("/api/sinhala/convert", response_model=ConvertOut)
def convert_text(body: ConvertIn) -> ConvertOut:
    return ConvertOut(text=convert(body.text, body.direction), direction=body.direction)


@app.post("/api/sinhala/srt", response_model=SrtOut)
async def convert_srt_route(request: Request) -> SrtOut:
    """JSON {srt, direction} or multipart form with `file` (+ optional `direction`)."""
    ctype = request.headers.get("content-type", "")
    if ctype.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        direction = str(form.get("direction") or "u2fm")
        if upload is None or isinstance(upload, str):
            raise HTTPException(422, "multipart body needs a `file` field")
        raw = await upload.read()
        try:
            srt = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            srt = raw.decode("cp1252", errors="replace")  # legacy FM subtitle files
    else:
        try:
            body = SrtIn.model_validate(await request.json())
        except Exception as e:  # noqa: BLE001
            raise HTTPException(422, f"invalid body: {e}") from e
        srt, direction = body.srt, body.direction
    if direction not in ("u2fm", "fm2u"):
        raise HTTPException(422, "direction must be 'u2fm' or 'fm2u'")
    out, cues = convert_srt(srt, direction)  # type: ignore[arg-type]
    return SrtOut(srt=out, direction=direction, cues=cues)  # type: ignore[arg-type]


@app.get("/api/sinhala/fonts")
def fonts() -> dict:
    if not MANIFEST_PATH.exists():
        return {"version": 1, "fonts": []}
    data = json.loads(MANIFEST_PATH.read_text("utf-8"))
    verified = load_table().get("verified", {})
    for f in data.get("fonts", []):
        f["verified"] = verified.get(f["label"])
        f["url"] = f"/fonts/fm/{f['file']}"
    return data


@app.post("/api/sinhala/wijesekara", response_model=WijesekaraOut)
def wijesekara(body: WijesekaraIn) -> WijesekaraOut:
    return WijesekaraOut(text=type_keys(body.keys))


AUDIO_MAX_BYTES = 200 * 1024 * 1024


async def _save_upload(request: Request, max_bytes: int):
    """Stream the multipart `file` field to a temp file. Returns (path, form); caller deletes the path."""
    clen = request.headers.get("content-length")
    limit = f"file too large (max {max_bytes // (1024 * 1024)} MB)"
    if clen and clen.isdigit() and int(clen) > max_bytes + 64 * 1024:
        raise HTTPException(413, limit)
    if not request.headers.get("content-type", "").startswith("multipart/form-data"):
        raise HTTPException(422, "expected multipart/form-data with a `file` field")
    form = await request.form()
    upload = form.get("file")
    if upload is None or isinstance(upload, str):
        raise HTTPException(422, "multipart body needs a `file` field")
    suffix = os.path.splitext(upload.filename or "")[1][:10]
    fd, tmp = tempfile.mkstemp(prefix="keyframe-audio-", suffix=suffix)
    try:
        size = 0
        with os.fdopen(fd, "wb") as out:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(413, limit)
                out.write(chunk)
        if size == 0:
            raise HTTPException(422, "empty file")
    except BaseException:
        _unlink(tmp)
        raise
    finally:
        await upload.close()
    return tmp, form


def _unlink(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


@app.post("/api/sinhala/audio/analyze")
async def audio_analyze(request: Request) -> dict:
    """Multipart `file` (any audio/video ffmpeg decodes) -> AudioAnalyzeResponse
    {duration, sampleRate, bpm, beats, lufs, peak, waveform}."""
    tmp, _ = await _save_upload(request, AUDIO_MAX_BYTES)
    try:
        return await run_in_threadpool(analyze_audio, tmp)
    except DecodeError as e:
        raise HTTPException(415, f"could not decode audio: {e}") from e
    finally:
        _unlink(tmp)


def _align_file(path: str, words: list[str], language: str) -> dict:
    audio = decode_audio(path, aligner.SR).mean(axis=1)
    times, score = aligner.align(audio, words, language)
    return {"words": [list(t) for t in times], "score": round(score, 3)}


@app.post("/api/sinhala/align")
async def align(request: Request) -> dict:
    """Multipart `file` (audio) + `words` (JSON array of word strings) + optional `language`
    -> {words: [[start, end], ...], score}. Times are seconds from the start of the file.

    503 while the alignment model is missing or downloading, 422 when the words don't
    match the audio; callers should keep their original timings in both cases."""
    tmp, form = await _save_upload(request, AUDIO_MAX_BYTES)
    try:
        try:
            words = json.loads(str(form.get("words") or "[]"))
        except json.JSONDecodeError as e:
            raise HTTPException(422, "`words` must be a JSON array of strings") from e
        if not isinstance(words, list) or not all(isinstance(w, str) for w in words):
            raise HTTPException(422, "`words` must be a JSON array of strings")
        language = str(form.get("language") or "si")
        try:
            return await run_in_threadpool(_align_file, tmp, words, language)
        except DecodeError as e:
            raise HTTPException(415, f"could not decode audio: {e}") from e
        except aligner.ModelUnavailable as e:
            raise HTTPException(503, str(e)) from e
        except aligner.AlignmentRejected as e:
            raise HTTPException(422, str(e)) from e
    finally:
        _unlink(tmp)
