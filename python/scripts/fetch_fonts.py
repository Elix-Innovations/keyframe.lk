"""Download freely downloadable legacy FM-layout Sinhala fonts into
web/public/fonts/fm/ and write manifest.json.

The source list is hand-curated and pinned to commits (no scraping). Every
download is checked:
  * fontTools must open it;
  * its cmap must put glyphs on the FM ASCII code points ('l', 'k', ';', ...)
    and must NOT map Unicode Sinhala (U+0D9A), so Unicode fonts are rejected;
  * '.' and ',' must be full-size letters (ග / ල in the FM layout), which
    rejects legacy fonts with a different, Latin-punctuation-preserving layout.

Existing files whose sha256 already matches are skipped. Font files are
gitignored (their licences are unclear); manifest.json is tracked.

Usage: uv run --project python python python/scripts/fetch_fonts.py [--force]
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / "web" / "public" / "fonts" / "fm"
MANIFEST = OUT_DIR / "manifest.json"

LEGACY = "https://raw.githubusercontent.com/Sinhala-Typing/fonts-legacy/34f22812e8992f5fafd8a818dfe1c8889fd01d52/Extracted/"
DINETH = "https://raw.githubusercontent.com/DinethPansiluW/Sinhala-Fonts/59852fceb3031ed33a641f1f3947c7a6a312c4f1/"

FM_LICENSE = (
    "Freeware by Pushpananda Ekanayaka (FM fonts, (c) 1998), widely distributed for free download; "
    "no explicit licence text in the font or source repo. Mirrored from github.com/Sinhala-Typing/fonts-legacy "
    "(repo states it does not own the copyright)."
)
THARU_LICENSE = (
    "Tharu Digi Creations fonts by Asanka Chamara Uyanege; font says 'All Rights Reserved' but is "
    "distributed as a free download. No explicit licence text. Mirrored from github.com/DinethPansiluW/Sinhala-Fonts."
)
CC_LICENSE = (
    "By Damith Welikala; distributed as a free download, no explicit licence text in the font. "
    "Mirrored from github.com/DinethPansiluW/Sinhala-Fonts."
)

# (id, label, filename-in-source, base url, licence note)
SOURCES: list[tuple[str, str, str, str, str]] = [
    ("fm-abhaya", "FM Abhaya", "FM-Abhaya.TTF", LEGACY, FM_LICENSE),
    ("fm-abhaya-bold", "FM Abhaya Bold", "FM-Aba-Bold.TTF", LEGACY, FM_LICENSE),
    ("fm-malithi", "FM Malithi", "FM-Malithi.TTF", LEGACY, FM_LICENSE),
    ("fm-bindumathi", "FM Bindumathi", "FM-Bindumathi.TTF", LEGACY, FM_LICENSE),
    ("fm-ganganee", "FM Ganganee", "FM-Ganganee.TTF", LEGACY, FM_LICENSE),
    ("fm-emanee", "FM Emanee", "FM-Emanee.TTF", LEGACY, FM_LICENSE),
    ("fm-samantha", "FM Samantha", "FM-Samantha.TTF", LEGACY, FM_LICENSE),
    ("fm-arjunn", "FM Arjunn", "FM-Arjunn.TTF", LEGACY, FM_LICENSE),
    ("fm-derana", "FM Derana", "FM-Derana.TTF", LEGACY, FM_LICENSE),
    ("fm-gemunu", "FM Gemunu", "FM-Gemunu.TTF", LEGACY, FM_LICENSE),
    ("fm-basuru", "FM Basuru", "FM-Basuru.TTF", LEGACY, FM_LICENSE),
    ("fm-rajantha", "FM Rajantha", "FM-Rajantha.TTF", LEGACY, FM_LICENSE),
    ("fm-econ-bold", "FM Econ Bold", "FM-eb.TTF", LEGACY, FM_LICENSE),
    ("tharu-dc-susum", "Tharu DC Susum", "tharu.ttf", DINETH, THARU_LICENSE),
    ("tharu-digital-mahee", "Tharu Digital Mahee", "tharu_digital_mahee.ttf", DINETH, THARU_LICENSE),
    ("tharu-digital-ran", "Tharu Digital Ran", "tharu_digital_run.ttf", DINETH, THARU_LICENSE),
    ("tharu-digital-sansala", "Tharu Digital Sansala", "tharu_digital_sansala.ttf", DINETH, THARU_LICENSE),
    ("tharu-digital-cooper", "Tharu Digital Sinhala Cooper", "TharuDigitalSinhalaCooper.ttf", DINETH, THARU_LICENSE),
    ("cc-oldpress", "CC Old Press", "cc_oldpress.ttf", DINETH, CC_LICENSE),
    ("cc-anupama", "CC Anupama", "ccanupama.ttf", DINETH, CC_LICENSE),
]

FM_PROBE = "lk;uihrmj"  # ක න ත ම ස ය ර ප ව in the FM layout


def ink_height(font_bytes: bytes, ch: str) -> int:
    font = ImageFont.truetype(io.BytesIO(font_bytes), 64, layout_engine=ImageFont.Layout.BASIC)
    img = Image.new("L", (160, 192), 255)
    ImageDraw.Draw(img).text((40, 64), ch, font=font, fill=0)
    box = ImageChops.invert(img).getbbox()
    return 0 if not box else box[3] - box[1]


def check_fm_font(data: bytes) -> tuple[bool, str, str]:
    """Return (ok, reason, family)."""
    try:
        font = TTFont(io.BytesIO(data), fontNumber=0)
    except Exception as e:  # noqa: BLE001
        return False, f"fontTools cannot open it: {e}", ""
    cmap = font.getBestCmap() or {}
    family = font["name"].getDebugName(1) or ""
    missing = [c for c in FM_PROBE if ord(c) not in cmap]
    if missing:
        return False, f"no glyphs at FM code points {missing!r}", family
    if 0x0D9A in cmap:
        return False, "maps Unicode Sinhala (U+0D9A) - a Unicode font, not FM", family
    base = ink_height(data, "l")
    for ch in ".,":
        if ink_height(data, ch) < base * 0.5:
            return False, f"{ch!r} is not a full-size letter - not the FM layout", family
    return True, "ok", family


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "keyframe-fetch-fonts"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-download even if the file exists")
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    old: dict[str, dict] = {}
    if MANIFEST.exists():
        old = {e["id"]: e for e in json.loads(MANIFEST.read_text("utf-8")).get("fonts", [])}

    entries: list[dict] = []
    seen_sha: set[str] = set()
    failures = 0
    for fid, label, src, base, lic in SOURCES:
        ext = Path(src).suffix.lower()
        file = f"{fid}{ext}"
        dest = OUT_DIR / file
        url = base + urllib.parse.quote(src)
        prev = old.get(fid)
        if (
            not args.force
            and prev
            and dest.exists()
            and hashlib.sha256(dest.read_bytes()).hexdigest() == prev.get("sha256")
        ):
            print(f"skip   {label:30s} (sha matches)")
            entries.append(prev)
            seen_sha.add(prev["sha256"])
            continue
        try:
            data = fetch(url)
        except Exception as e:  # noqa: BLE001
            print(f"FAIL   {label:30s} download: {e}", file=sys.stderr)
            failures += 1
            if prev:  # keep the tracked manifest entry instead of dropping the font
                entries.append(prev)
                seen_sha.add(prev["sha256"])
            continue
        ok, reason, family = check_fm_font(data)
        if not ok:
            print(f"REJECT {label:30s} {reason}", file=sys.stderr)
            failures += 1
            if prev:
                entries.append(prev)
                seen_sha.add(prev["sha256"])
            continue
        sha = hashlib.sha256(data).hexdigest()
        if sha in seen_sha:
            print(f"dup    {label:30s} identical to an earlier font, skipped")
            continue
        seen_sha.add(sha)
        dest.write_bytes(data)
        entries.append(
            {
                "id": fid,
                "label": label,
                "family": label,
                "internalFamily": family,
                "file": file,
                "sourceUrl": url,
                "license": lic,
                "licenseKnown": False,
                "sha256": sha,
            }
        )
        print(f"ok     {label:30s} {len(data):>7d} bytes  ({family})")

    MANIFEST.write_text(
        json.dumps(
            {
                "version": 1,
                "note": "Legacy FM-layout Sinhala fonts. Files are gitignored; run `npm run fonts:fetch`.",
                "fonts": entries,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "utf-8",
    )
    print(f"\n{len(entries)} fonts in {MANIFEST.relative_to(REPO)}; {failures} failed/rejected")
    return 0 if entries else 1


if __name__ == "__main__":
    raise SystemExit(main())
