"""Shared font helpers: locate/download the Noto Sans Sinhala reference font,
render text to bitmaps and score how similar two renderings look."""

from __future__ import annotations

import hashlib
import urllib.request
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, features

PYTHON_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = PYTHON_DIR.parent
CACHE_DIR = PYTHON_DIR / ".cache"
FM_FONT_DIR = REPO_DIR / "web" / "public" / "fonts" / "fm"
MANIFEST_PATH = FM_FONT_DIR / "manifest.json"

# Pinned google/fonts commit so the reference rendering is reproducible (OFL).
NOTO_URL = (
    "https://raw.githubusercontent.com/google/fonts/"
    "b5efa9c32e8f9b63005f5cdb1ad5527a77d2cd04/ofl/notosanssinhala/"
    "NotoSansSinhala%5Bwdth%2Cwght%5D.ttf"
)
NOTO_PATH = CACHE_DIR / "NotoSansSinhala.ttf"

HAS_RAQM = bool(features.check("raqm"))


def ensure_noto() -> Path:
    if not NOTO_PATH.exists():
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(NOTO_URL, headers={"User-Agent": "keyframe-sinhala"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        NOTO_PATH.write_bytes(data)
    return NOTO_PATH


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@lru_cache(maxsize=128)
def _font(path: str, size: int, basic: bool = False) -> ImageFont.FreeTypeFont:
    if basic:
        return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.BASIC)
    return ImageFont.truetype(path, size)


def render(text: str, font_path: str | Path, size: int = 96, shaped: bool = True) -> Image.Image:
    """Render text black-on-white (mode L), cropped to its ink box with a margin.

    `shaped` uses libraqm (needed for Unicode Sinhala). FM fonts are plain
    ASCII fonts, so they are rendered with the basic layout engine."""
    font = _font(str(font_path), size, not shaped)
    w = size * max(2, len(text) + 2)
    img = Image.new("L", (w, size * 3), 255)
    d = ImageDraw.Draw(img)
    d.text((size // 2, size), text, font=font, fill=0)
    inv = ImageChops.invert(img)
    box = inv.getbbox()
    if not box:
        return Image.new("L", (8, 8), 255)
    m = 4
    box = (max(0, box[0] - m), max(0, box[1] - m), min(w, box[2] + m), min(size * 3, box[3] + m))
    return img.crop(box)


def similarity(a: Image.Image, b: Image.Image, n: int = 48) -> float:
    """Visual similarity in [0,1] of two ink renderings (shape only).

    Both images are scaled to the same height; widths are averaged so the
    comparison is a soft-IoU on a common grid. Aspect ratio differences are
    penalized by the stretch."""
    wa = a.width * n / a.height
    wb = b.width * n / b.height
    wdt = max(1, round((wa + wb) / 2))
    ra = a.resize((wdt, n), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.5))
    rb = b.resize((wdt, n), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.5))
    pa = [(255 - p) / 255 for p in ra.getdata()]
    pb = [(255 - p) / 255 for p in rb.getdata()]
    inter = sum(min(x, y) for x, y in zip(pa, pb))
    union = sum(max(x, y) for x, y in zip(pa, pb))
    iou = inter / union if union else 0.0
    ratio = min(wa, wb) / max(wa, wb) if max(wa, wb) else 0.0
    return iou * (0.5 + 0.5 * ratio)


def side_by_side(a: Image.Image, b: Image.Image, height: int = 72) -> Image.Image:
    def fit(im: Image.Image) -> Image.Image:
        w = max(1, round(im.width * height / im.height))
        return im.resize((w, height), Image.LANCZOS)

    fa, fb = fit(a), fit(b)
    out = Image.new("L", (fa.width + fb.width + 24, height), 255)
    out.paste(fa, (0, 0))
    ImageDraw.Draw(out).line([(fa.width + 12, 0), (fa.width + 12, height)], fill=180)
    out.paste(fb, (fa.width + 24, 0))
    return out
