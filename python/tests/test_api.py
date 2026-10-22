import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app  # noqa: E402

client = TestClient(app)

SRT = "1\n00:00:01,000 --> 00:00:02,500\nශ්‍රී ලංකාව\n\n2\n00:00:03,000 --> 00:00:04,000\nපොත, 2026\nකෝප්පය\n"


def test_health() -> None:
    r = client.get("/api/sinhala/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_convert_both_ways() -> None:
    r = client.post("/api/sinhala/convert", json={"text": "ශ්‍රී ලංකාව", "direction": "u2fm"})
    assert r.json() == {"text": "Y%S ,xldj", "direction": "u2fm"}
    r = client.post("/api/sinhala/convert", json={"text": "Y%S ,xldj", "direction": "fm2u"})
    assert r.json()["text"] == "ශ්‍රී ලංකාව"


def test_convert_rejects_bad_direction() -> None:
    assert client.post("/api/sinhala/convert", json={"text": "x", "direction": "nope"}).status_code == 422


def test_srt_json_keeps_timings() -> None:
    r = client.post("/api/sinhala/srt", json={"srt": SRT, "direction": "u2fm"})
    body = r.json()
    assert body["cues"] == 2
    lines = body["srt"].split("\n")
    assert lines[0] == "1" and lines[1] == "00:00:01,000 --> 00:00:02,500"
    assert lines[2] == "Y%S ,xldj"
    assert lines[6] == "fmd;\" 2026"
    back = client.post("/api/sinhala/srt", json={"srt": body["srt"], "direction": "fm2u"}).json()
    assert back["srt"] == SRT


def test_srt_multipart() -> None:
    r = client.post(
        "/api/sinhala/srt",
        files={"file": ("a.srt", SRT.encode("utf-8"), "application/x-subrip")},
        data={"direction": "u2fm"},
    )
    assert r.status_code == 200 and r.json()["cues"] == 2


def test_srt_crlf() -> None:
    crlf = SRT.replace("\n", "\r\n")
    r = client.post("/api/sinhala/srt", json={"srt": crlf, "direction": "u2fm"}).json()
    assert "\r\n" in r["srt"] and r["srt"].split("\r\n")[1] == "00:00:01,000 --> 00:00:02,500"


def test_fonts() -> None:
    r = client.get("/api/sinhala/fonts")
    assert r.status_code == 200 and "fonts" in r.json()


def test_wijesekara() -> None:
    r = client.post("/api/sinhala/wijesekara", json={"keys": "fld"})
    assert r.json() == {"text": "කො"}
