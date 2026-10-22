"""Check the FM table against the real FM font files.

For every font in web/public/fonts/fm/manifest.json:
  1. fontTools: every FM code point used by the table must be in the cmap and
     point at a real glyph (not .notdef, not an empty outline).
  2. Pillow: render each test item twice - the Unicode text in Noto Sans
     Sinhala (shaped with libraqm) and the FM encoding in the FM font - and
     score how alike they look. For `unsure` entries every alternative FM
     encoding is scored too, so the report shows which one the fonts agree on.

Writes python/reports/fm-verify.json and fm-verify.html (side-by-side PNGs
embedded, unsure entries first, then the lowest-scoring rows).

    uv run python -m keyframe_sinhala.verify [--fonts fm-abhaya,fm-malithi] [--record]

--record stores today's date for every font that passes the glyph check in
keyframe_sinhala/verified.json and regenerates fm-table.json ("verified").
If libraqm is missing, Unicode Sinhala cannot be shaped, so only the glyph
checks run (the report says so).
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import html
import io
import json
import statistics
from dataclasses import dataclass, field
from pathlib import Path

from fontTools.ttLib import TTFont

from . import table as T
from .fm import HAL, ZWJ, fm_to_unicode, load_table, unicode_to_fm
from .fontutil import (
    FM_FONT_DIR,
    HAS_RAQM,
    MANIFEST_PATH,
    PYTHON_DIR,
    ensure_noto,
    render,
    side_by_side,
    similarity,
)

REPORT_DIR = PYTHON_DIR / "reports"
CARRIER = ("ක", "l")  # consonant used to show dependent signs

CORPUS = [
    "මේක තමයි අපි කරන අන්තිම එක", "ශ්‍රී ලංකාව", "ප්‍රශ්නය", "කෝප්පය", "පොත", "කෞතුක",
    "රූපය", "කුරුල්ලා", "සූර්යයා", "ක්‍රියාව", "විද්‍යාව", "ගෘහ", "දෛවය", "රැකියාව",
    "ගුරුතුමා", "ප්‍රෝඩා", "ධර්‍මය", "කාර්‍යය", "ක්‍ෂේත්‍රය", "ශුභ", "ශූන්‍ය", "ළුණු", "රෑ", "දුඃඛ",
]


@dataclass
class Item:
    group: str
    u: str
    fm: str
    alternatives: list[str] = field(default_factory=list)
    note: str = ""


def build_items(t: dict) -> list[Item]:
    items: list[Item] = []
    for u in t["unsure"]:
        items.append(Item("unsure", u["u"], u["fm"], list(u["alternatives"]), u.get("note", "")))
    for u, f in t["consonants"]:
        items.append(Item("consonant", u, f))
    for u, f in t["independentVowels"]:
        items.append(Item("vowel", u, f))
    c, cf = CARRIER
    for u, f in t["vowelSigns"]:
        items.append(Item("sign", c + u, cf + f))
    for u, p, s in t["preBase"]:
        items.append(Item("prebase", c + u, p + cf + s))
    for u, f in t["specialSyllables"]:
        items.append(Item("special", u, f))
    for u, f in t["conjuncts"]:
        items.append(Item("conjunct", u, f))
    sg = t["signs"]
    items += [
        Item("sign", c + "ං", cf + sg["anusvara"]),
        Item("sign", c + "ඃ", cf + sg["visarga"]),
        Item("sign", c + HAL + ZWJ + "ර", cf + sg["rakaransaya"]),
        Item("sign", c + HAL + ZWJ + "ය", cf + sg["yansaya"]),
        Item("sign", "ර" + HAL + ZWJ + c, cf + sg["repaya"]),
    ]
    for u, f in t["punctuation"]:
        items.append(Item("punct", u, f))
    for f, u in t["decodeAliases"]:
        items.append(Item("alias", u, f))
    for w in CORPUS:
        items.append(Item("word", w, unicode_to_fm(w)))
    return items


def load_fonts(only: set[str] | None) -> list[dict]:
    if not MANIFEST_PATH.exists():
        raise SystemExit("no manifest - run `npm run fonts:fetch` first")
    fonts = json.loads(MANIFEST_PATH.read_text("utf-8"))["fonts"]
    fonts = [f for f in fonts if (FM_FONT_DIR / f["file"]).exists()]
    if only:
        fonts = [f for f in fonts if f["id"] in only]
    return fonts


def glyph_check(path: Path, chars: set[str]) -> dict[str, str]:
    """Return {char: problem} for FM code points without a usable glyph."""
    font = TTFont(path, fontNumber=0)
    cmap = font.getBestCmap() or {}
    gs = font.getGlyphSet()
    glyf = font["glyf"] if "glyf" in font else None
    problems: dict[str, str] = {}
    for ch in sorted(chars):
        if ch.isspace():
            continue
        name = cmap.get(ord(ch))
        if name is None:
            problems[ch] = "not in cmap"
        elif name == ".notdef":
            problems[ch] = "maps to .notdef"
        elif glyf is not None and name in glyf and glyf[name].numberOfContours == 0 and not glyf[name].isComposite():
            problems[ch] = f"empty glyph ({name})"
        elif name not in gs:
            problems[ch] = f"missing glyph {name}"
    return problems


def png_b64(img) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def run(only: set[str] | None, record: bool, sample_fonts: int) -> dict:
    t = load_table()
    items = build_items(t)
    fonts = load_fonts(only)
    noto = ensure_noto()

    # Glyph check covers every code point unicode_to_fm() can emit. Decode-only
    # aliases (legacy ligatures) do not need to exist in every font.
    fm_chars: set[str] = set()
    for it in items:
        if it.group not in ("word", "alias", "unsure"):
            fm_chars.update(it.fm)

    font_results = []
    for f in fonts:
        probs = glyph_check(FM_FONT_DIR / f["file"], fm_chars)
        font_results.append({"id": f["id"], "label": f["label"], "glyphProblems": probs, "glyphOk": not probs})

    rows = []
    for it in items:
        row: dict = {
            "group": it.group, "u": it.u, "fm": it.fm, "note": it.note,
            "roundTrip": fm_to_unicode(it.fm) == it.u if it.group not in ("punct",) else True,
            "missingIn": [fr["label"] for fr in font_results if any(ch in fr["glyphProblems"] for ch in it.fm)],
        }
        if HAS_RAQM:
            ref = render(it.u, noto, shaped=True)
            cands = [it.fm] + it.alternatives
            scores: dict[str, list[float]] = {c: [] for c in cands}
            images = []
            for n, f in enumerate(fonts):
                path = FM_FONT_DIR / f["file"]
                for c in cands:
                    img = render(c, path, shaped=False)
                    scores[c].append(similarity(ref, img))
                    if n < sample_fonts:
                        images.append((f["label"], c, img))
            mean = {c: round(statistics.fmean(v), 3) if v else 0.0 for c, v in scores.items()}
            wins = {c: 0 for c in cands}
            for n in range(len(fonts)):
                best = max(cands, key=lambda c: scores[c][n])
                wins[best] += 1
            row["score"] = mean[it.fm]
            row["alternativeScores"] = {c: mean[c] for c in it.alternatives}
            row["wins"] = wins
            row["best"] = max(cands, key=lambda c: (wins[c], mean[c]))
            row["_ref"] = ref
            row["_images"] = images
        rows.append(row)

    today = dt.date.today().isoformat()
    if record:
        verified = {}
        if T.VERIFIED_PATH.exists():
            verified = json.loads(T.VERIFIED_PATH.read_text("utf-8"))
        for fr in font_results:
            if fr["glyphOk"]:
                verified[fr["label"]] = today
        T.VERIFIED_PATH.write_text(json.dumps(dict(sorted(verified.items())), ensure_ascii=False, indent=1) + "\n", "utf-8")
        T.main(["--write"])

    return {"date": today, "raqm": HAS_RAQM, "fonts": font_results, "rows": rows}


def order(rows: list[dict]) -> list[dict]:
    def key(r: dict):
        unsure = r["group"] == "unsure"
        disagrees = r.get("best", r["fm"]) != r["fm"]
        return (not unsure, not disagrees, not r["missingIn"], r.get("score", 1.0))

    return sorted(rows, key=key)


def write_reports(res: dict) -> tuple[Path, Path]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    rows = order(res["rows"])
    clean = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]
    jpath = REPORT_DIR / "fm-verify.json"
    jpath.write_text(json.dumps({**res, "rows": clean}, ensure_ascii=False, indent=1) + "\n", "utf-8")

    esc = html.escape
    parts = [
        "<!doctype html><meta charset=utf-8><title>FM table verification</title>",
        "<style>body{font:14px system-ui,sans-serif;margin:24px;background:#fafafa;color:#111}"
        "table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}"
        "th{background:#eee}.bad{background:#fde8e8}.warn{background:#fff6dc}.ok{background:#eef9ee}"
        "code{font-size:13px;background:#f0f0f0;padding:1px 4px}img{display:block;margin:2px 0;max-height:60px}"
        ".u{font-size:22px}</style>",
        f"<h1>FM table verification</h1><p>{esc(res['date'])} &middot; fonts: {len(res['fonts'])} &middot; "
        f"libraqm: <b>{'yes' if res['raqm'] else 'NO - glyph checks only, no render comparison'}</b></p>",
        "<p>Score = shape similarity (0-1) between the Unicode text in Noto Sans Sinhala and the FM encoding in each FM font, "
        "averaged over fonts. Fonts differ in design, so compare scores <i>within a row</i> (current vs alternatives) rather than across rows. "
        "Images: Noto reference | FM rendering.</p>",
        "<h2>Fonts</h2><table><tr><th>Font</th><th>Glyph check</th></tr>",
    ]
    for f in res["fonts"]:
        cls = "ok" if f["glyphOk"] else "bad"
        probs = ", ".join(f"<code>{esc(k)}</code> {esc(v)}" for k, v in f["glyphProblems"].items()) or "all table code points present"
        parts.append(f"<tr class={cls}><td>{esc(f['label'])}</td><td>{probs}</td></tr>")
    parts.append("</table><h2>Entries</h2><table><tr><th>Group</th><th>Unicode</th><th>FM</th><th>Score</th>"
                 "<th>Alternatives</th><th>Wins (fonts)</th><th>Round trip</th><th>Renders</th></tr>")
    for r in rows:
        best = r.get("best", r["fm"])
        cls = "bad" if (best != r["fm"] or r["missingIn"] or not r["roundTrip"]) else ("warn" if r["group"] == "unsure" else "")
        alts = ", ".join(f"<code>{esc(a)}</code> {s}" for a, s in r.get("alternativeScores", {}).items())
        wins = ", ".join(f"<code>{esc(a)}</code>:{n}" for a, n in r.get("wins", {}).items())
        imgs = ""
        if "_ref" in r:
            for label, cand, img in r["_images"]:
                imgs += (f"<div>{esc(label)} <code>{esc(cand)}</code>"
                         f"<img src='data:image/png;base64,{png_b64(side_by_side(r['_ref'], img))}'></div>")
        missing = f"<br>missing in: {esc(', '.join(r['missingIn']))}" if r["missingIn"] else ""
        parts.append(
            f"<tr class='{cls}'><td>{esc(r['group'])}<br><small>{esc(r['note'])}</small></td><td class=u>{esc(r['u'])}</td>"
            f"<td><code>{esc(r['fm'])}</code>{missing}</td><td>{r.get('score', '')}</td><td>{alts}</td><td>{wins}</td>"
            f"<td>{'ok' if r['roundTrip'] else 'FAIL'}</td><td>{imgs}</td></tr>"
        )
    parts.append("</table>")
    hpath = REPORT_DIR / "fm-verify.html"
    hpath.write_text("\n".join(parts), "utf-8")
    return jpath, hpath


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Verify the FM table against real FM fonts")
    ap.add_argument("--fonts", help="comma-separated manifest ids (default: all)")
    ap.add_argument("--record", action="store_true", help="record passing fonts in the table's `verified`")
    ap.add_argument("--sample-fonts", type=int, default=3, help="fonts to show images for in the HTML")
    args = ap.parse_args(argv)
    only = set(args.fonts.split(",")) if args.fonts else None
    res = run(only, args.record, args.sample_fonts)
    jpath, hpath = write_reports(res)

    print(f"libraqm: {'yes' if res['raqm'] else 'NO (glyph checks only)'}")
    for f in res["fonts"]:
        print(f"  {f['label']:30s} {'ok' if f['glyphOk'] else 'problems: ' + ', '.join(f['glyphProblems'])}")
    disagree = [r for r in res["rows"] if r.get("best", r["fm"]) != r["fm"]]
    rt = [r for r in res["rows"] if not r["roundTrip"]]
    print(f"{len(res['rows'])} rows; {len(disagree)} where an alternative looks better; {len(rt)} round-trip failures")
    for r in disagree:
        print(f"  {r['u']}: table {r['fm']!r} ({r.get('score')}) vs best {r['best']!r} wins={r['wins']}")
    for r in rt:
        print(f"  round-trip: {r['u']!r} fm={r['fm']!r} -> {fm_to_unicode(r['fm'])!r}")
    print(f"wrote {jpath.relative_to(PYTHON_DIR.parent)} and {hpath.relative_to(PYTHON_DIR.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
