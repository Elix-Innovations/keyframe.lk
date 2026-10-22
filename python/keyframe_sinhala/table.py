"""Canonical Sinhala Unicode <-> FM (legacy ASCII font) mapping table.

This module is the single source of truth. `python -m keyframe_sinhala.table --write`
serialises it (stable key order) to web/src/lib/fm-table.json, which both the
TypeScript converter (web/src/lib/fm.ts, wijesekara.ts) and the Python
converter (fm.py, wijesekara.py) load, so the two can never disagree.

FM fonts draw Sinhala glyphs at ASCII / Latin-1 code points, and the FM font
encoding *is* the Wijesekara typewriter layout, so the keyboard table is
derived from the same data.

Every entry has been checked against the real FM fonts with
`python -m keyframe_sinhala.verify` (glyph presence + rendered-shape comparison
with Noto Sans Sinhala); see python/reports/fm-verify.html.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HAL = "්"  # ් al-lakuna / virama
ZWJ = "‍"
ZWNJ = "‌"

VERSION = 2

# ---------------------------------------------------------------------------
# Encoding tables (used in both directions). [unicode, fm]
# ---------------------------------------------------------------------------

CONSONANTS: list[list[str]] = [
    ["ක", "l"], ["ඛ", "L"], ["ග", "."], ["ඝ", ">"], ["ඞ", "X"],
    # Verified: "Õ" is ඟ in every FM font. The old table used "¹", which is a
    # Latin "v" (roman numeral) glyph in the fonts.
    ["ඟ", "Õ"],
    ["ච", "p"], ["ඡ", "P"], ["ජ", "c"], ["ඣ", "CO"], ["ඤ", "["], ["ඥ", "{"],
    ["ඦ", "`P"],
    ["ට", "g"], ["ඨ", "G"], ["ඩ", "v"], ["ඪ", "V"], ["ණ", "K"], ["ඬ", "~"],
    ["ත", ";"], ["ථ", ":"], ["ද", "o"], ["ධ", "O"], ["න", "k"], ["ඳ", "|"],
    ["ප", "m"], ["ඵ", "M"], ["බ", "n"], ["භ", "N"], ["ම", "u"], ["ඹ", "U"],
    ["ය", "h"], ["ර", "r"], ["ල", ","], ["ව", "j"], ["ශ", "Y"], ["ෂ", "I"],
    ["ස", "i"], ["හ", "y"], ["ළ", "<"], ["ෆ", "*"],
]

# ඓ is drawn as the kombuva glyph + එ.
INDEPENDENT_VOWELS: list[list[str]] = [
    ["අ", "w"], ["ආ", "wd"], ["ඇ", "we"], ["ඈ", "wE"], ["ඉ", "b"], ["ඊ", "B"],
    ["උ", "W"], ["ඌ", "W!"], ["ඍ", "R"], ["ඎ", "RD"], ["ඏ", "Ì"], ["ඐ", "Ï"],
    ["එ", "t"], ["ඒ", "ta"], ["ඓ", "ft"], ["ඔ", "T"], ["ඕ", "´"], ["ඖ", "T!"],
]

# Post-base dependent vowel signs (and al-lakuna).
VOWEL_SIGNS: list[list[str]] = [
    ["ා", "d"], ["ැ", "e"], ["ෑ", "E"], ["ි", "s"], ["ී", "S"], ["ු", "q"],
    ["ූ", "Q"], ["ෘ", "D"], ["ෲ", "DD"], ["ෟ", "!"], [HAL, "a"],
]

# Split / pre-base vowel signs: [unicode, prefix, suffix].
# FM order is prefix + consonant cluster + suffix.
PRE_BASE: list[list[str]] = [
    ["ෙ", "f", ""], ["ේ", "f", "a"], ["ො", "f", "d"], ["ෝ", "f", "da"],
    ["ෞ", "f", "!"], ["ෛ", "ff", ""],
]

# Consonant + vowel sign pairs drawn with a dedicated glyph form instead of
# the generic sign. Only used on bare consonants (no rakar / yansa / repaya).
SPECIAL_SYLLABLES: list[list[str]] = [
    ["කු", "l="], ["කූ", "l+"], ["ගු", ".="], ["ගූ", ".+"], ["තු", ";="], ["තූ", ";+"],
    ["ශු", "Y="], ["ශූ", "Y+"],
    ["රු", "re"], ["රූ", "rE"], ["රැ", "/"], ["රෑ", "?"],
    ["ළු", "¿"],
    # Verified: ළූ is the ළු ligature + the long aeda tail "E" (matches Noto in
    # 19/20 fonts). The old "<Q" draws a plain ළ with a generic uu sign.
    ["ළූ", "¿E"],
]

# Touching conjuncts (C ් ZWJ C2) that FM draws with the "C" half-form of ක.
# Used as a consonant cluster base in both directions. [unicode, fm]
CONJUNCTS: list[list[str]] = [
    ["ක්‍ෂ", "CI"], ["ක්‍ව", "Cj"],
]

SIGNS: dict[str, str] = {
    "anusvara": "x",  # ං
    "visarga": "#",  # ඃ  (verified: two stacked rings; "H" is yansaya)
    "rakaransaya": "%",  # ්‍ර  written after the consonant
    "yansaya": "H",  # ්‍ය  written after the consonant
    # Verified: the repaya hook is "_" (written after the consonant cluster).
    # The old table used "¾", which is a ර-with-tail glyph, not the hook.
    "repaya": "_",
}

# ASCII punctuation lives on other code points in FM fonts (the ASCII slots
# are Sinhala letters). [unicode, fm] - used in both directions.
PUNCTUATION: list[list[str]] = [
    [",", '"'], [".", "'"], [":", "("], ["(", "^"], [")", "&"], ["/", "$"],
    ["%", "]"], ["?", "@"], ["=", "}"], [";", "¦"], ["!", "æ"], ["*", ")"],
    ["×", "«"], ["+", "¬"], ["÷", "\xad"],
]

# FM sequences that only occur in *legacy text* (pasted from old documents or
# other converters): precomposed ligature glyphs and duplicate glyph forms.
# Decode only (fm -> unicode). [fm, unicode]
DECODE_ALIASES: list[list[str]] = [
    ["®", "ඣ"], ["`.", "ඟ"], ["`v", "ඬ"], ["`o", "ඳ"],
    ["A", HAL], ["=", "ු"], ["+", "ූ"], ["¾", "ර්"],
    ["Ë", "ක්‍ෂ"], ["†", "ත්‍ථ"], ["…", "ත්‍ව"], ["‡", "න්‍ද"], ["„", "ද්‍ව"],
    ["Š", "ද්‍ධ"], ["ø", "ද්‍ර"], ["›", "ශ්‍රී"],
    ["¢", "ඳි"], ["£", "ඳී"], ["§", "දී"], ["¨", "ලු"], ["ª", "ඳූ"], ["Æ", "ලූ"],
    ["È", "දි"], ["Í", "රී"], ["ß", "රි"], ["Þ", "දා"], ["±", "දැ"], ["÷", "ඳු"],
    ["ÿ", "දු"], ["û", "ඤු"], ["ü", "ඤූ"],
    ["À", "ඨි"], ["Á", "ඨී"], ["Â", "ඡී"], ["Ä", "ඛ්"], ["Å", "ඛි"], ["Ç", "ඛී"],
    ["É", "ච්"], ["Ê", "ජ්"], ["Î", "ඪි"], ["Ð", "ඪී"], ["Ñ", "චි"], ["Ò", "ථී"],
    ["Ó", "ථි"], ["Ô", "ජී"], ["Ö", "චී"], ["×", "ඥ"], ["Ø", "ඤ"], ["Ù", "ඞ්"],
    ["Ú", "ඵී"], ["Ü", "ට්"], ["Ý", "ඵි"], ["à", "ටී"], ["á", "ටි"], ["â", "ඩ්"],
    ["ã", "ඞී"], ["ä", "ඩි"], ["å", "ඬ්"], ["ç", "ඬි"], ["è", "ධ්"], ["é", "ඬී"],
    ["ê", "ධි"], ["ë", "ධී"], ["ì", "බි"], ["í", "බ්"], ["î", "බී"], ["ï", "ම්"],
    ["ð", "ජි"], ["ñ", "මි"], ["ò", "ඹ්"], ["ó", "මී"], ["ô", "ඹි"], ["õ", "ව්"],
    ["ö", "ඹී"], ["ù", "වී"], ["ú", "වි"], ["ý", "ඡි"], ["þ", "ඡ්"],
    ["Œ", "ණී"], ["‚", "ණි"], ["ƒ", "ඳැ"],
]

# Entries that could not be settled with certainty, with the alternatives the
# verifier compares. `fm` is what the table currently uses.
UNSURE: list[dict] = [
    {"u": "ශු", "fm": "Y=", "alternatives": ["Yq"], "note": "special u-glyph form vs generic paa-pilla"},
    {"u": "ශූ", "fm": "Y+", "alternatives": ["YQ"], "note": "special uu-glyph form vs generic"},
    {"u": "රැ", "fm": "/", "alternatives": ["re"], "note": "single ligature glyph"},
    {"u": "රෑ", "fm": "?", "alternatives": ["rE"], "note": "single ligature glyph"},
    {"u": "ළු", "fm": "¿", "alternatives": ["<q", "<="], "note": "single ligature glyph"},
    {"u": "ළූ", "fm": "¿E", "alternatives": ["<Q", "¿Q", "<+"], "note": "ළු ligature + long aeda tail"},
    {"u": "කඃ", "fm": "l#", "alternatives": ["l·", "l½"], "note": "visarga: '#' is two stacked rings in every font; '·'/'½' are other glyphs"},
    {"u": "ර්‍ක", "fm": "l_", "alternatives": ["l¾", "¾l"], "note": "repaya hook"},
    {"u": "ක්‍ය", "fm": "lH", "alternatives": [], "note": "yansaya"},
    {"u": "ක්‍රේ", "fm": "fl%a", "alternatives": ["fla%"], "note": "al-lakuna / rakaransaya order"},
    {"u": "ඟ", "fm": "Õ", "alternatives": ["¹", "`."], "note": "sanyaka ga"},
    {"u": "ඦ", "fm": "`P", "alternatives": [], "note": "sanyaka ja (rare)"},
    {"u": "ඏ", "fm": "Ì", "alternatives": [], "note": "rare vowel"},
    {"u": "ඐ", "fm": "Ï", "alternatives": [], "note": "rare vowel"},
    {"u": "කු", "fm": "l=", "alternatives": ["lq"], "note": "special u-glyph form"},
    {"u": "කූ", "fm": "l+", "alternatives": ["lQ"], "note": "special uu-glyph form"},
    {"u": "ගු", "fm": ".=", "alternatives": [".q"], "note": "special u-glyph form"},
    {"u": "තු", "fm": ";=", "alternatives": [";q"], "note": "special u-glyph form"},
    {"u": "රු", "fm": "re", "alternatives": ["rq"], "note": "ra + u is drawn with the aeda glyph"},
    {"u": "රූ", "fm": "rE", "alternatives": ["rQ"], "note": "ra + uu is drawn with the aeda glyph"},
]

# ---------------------------------------------------------------------------
# Wijesekara keyboard (derived from the FM table)
# ---------------------------------------------------------------------------


def build_wijesekara() -> tuple[dict[str, dict[str, str]], list[list[str]]]:
    """Return (keys, compose).

    keys: single key -> {"type", "u"} where type is one of
      consonant | vowel | sign | prebase | mod | repaya | mark | special | punct
    compose: [after, key, result] - when the text before the caret ends with
      `after` and `key` is typed, replace `after` with `result`.
    """
    keys: dict[str, dict[str, str]] = {}

    def put(k: str, typ: str, u: str) -> None:
        if len(k) == 1 and k not in keys:
            keys[k] = {"type": typ, "u": u}

    for u, f in CONSONANTS:
        put(f, "consonant", u)
    for u, f in INDEPENDENT_VOWELS:
        put(f, "vowel", u)
    for u, f in VOWEL_SIGNS:
        put(f, "sign", u)
    put("f", "prebase", "ෙ")
    put(SIGNS["rakaransaya"], "mod", HAL + ZWJ + "ර")
    put(SIGNS["yansaya"], "mod", HAL + ZWJ + "ය")
    put(SIGNS["repaya"], "repaya", "ර" + HAL + ZWJ)
    put(SIGNS["anusvara"], "mark", "ං")
    put(SIGNS["visarga"], "mark", "ඃ")
    for u, f in SPECIAL_SYLLABLES:
        put(f, "special", u)
    # Keys whose FM glyph is a variant form of a sign.
    put("=", "sign", "ු")
    put("+", "sign", "ූ")
    put("A", "sign", HAL)
    # "C" is the ක් half-form glyph (FM builds ක්‍ෂ as "CI", ක්‍ව as "Cj" and
    # ඣ as "CO"), so the key types a touching ක්‍ and C+O composes to ඣ.
    put("C", "consonant", "ක" + HAL + ZWJ)

    cons_by_key = {f: u for u, f in CONSONANTS if len(f) == 1}
    iv_by_key = {f: u for u, f in INDEPENDENT_VOWELS if len(f) == 1}
    sign_by_key = {f: u for u, f in VOWEL_SIGNS if len(f) == 1}
    sign_by_key.update({"=": "ු", "+": "ූ", "A": HAL})

    compose: list[list[str]] = []
    # Two-key independent vowels: w+d -> ආ, t+a -> ඒ, T+! -> ඖ, W+! -> ඌ ...
    for u, f in INDEPENDENT_VOWELS:
        if len(f) == 2 and f[0] in iv_by_key:
            compose.append([iv_by_key[f[0]], f[1], u])
    compose.append(["ඔ", "a", "ඕ"])  # ඕ has its own glyph ("´"), typists use T+a
    # Repeated signs: D+D -> ෲ
    for u, f in VOWEL_SIGNS:
        if len(f) == 2 and f[0] in sign_by_key and f[1] in sign_by_key:
            compose.append([sign_by_key[f[0]], f[1], u])
    # Two-key special syllables whose second key is not already the right
    # sign: r+e -> රු, r+E -> රූ (FM draws ra+u with the aeda glyph).
    for u, f in SPECIAL_SYLLABLES:
        if len(f) == 2 and f[0] in cons_by_key:
            c = cons_by_key[f[0]]
            if c + sign_by_key.get(f[1], "\0") != u:
                compose.append([c, f[1], u])
    # Multi-key consonants built on the "C" half form: C+O -> ඣ
    for u, f in CONSONANTS:
        if len(f) == 2 and f[0] == "C" and f[1] in cons_by_key:
            compose.append(["ක" + HAL + ZWJ, f[1], u])
    compose.sort(key=lambda r: (-len(r[0]), r[0], r[1]))
    return dict(sorted(keys.items())), compose


# ---------------------------------------------------------------------------

REPO = Path(__file__).resolve().parents[2]
JSON_PATH = REPO / "web" / "src" / "lib" / "fm-table.json"
VERIFIED_PATH = Path(__file__).with_name("verified.json")


def load_verified() -> dict[str, str]:
    if VERIFIED_PATH.exists():
        return dict(sorted(json.loads(VERIFIED_PATH.read_text("utf-8")).items()))
    return {}


def build_table() -> dict:
    keys, compose = build_wijesekara()
    return {
        "version": VERSION,
        "consonants": CONSONANTS,
        "independentVowels": INDEPENDENT_VOWELS,
        "vowelSigns": VOWEL_SIGNS,
        "preBase": PRE_BASE,
        "specialSyllables": SPECIAL_SYLLABLES,
        "conjuncts": CONJUNCTS,
        "signs": SIGNS,
        "punctuation": PUNCTUATION,
        "decodeAliases": DECODE_ALIASES,
        "wijesekara": keys,
        "wijesekaraCompose": compose,
        "unsure": UNSURE,
        "verified": load_verified(),
    }


def _fmt(v: object, indent: int = 0) -> str:
    """JSON with one table row per line (stable, diff-friendly)."""
    pad = " " * indent
    if isinstance(v, dict):
        if not v:
            return "{}"
        inner = ",\n".join(
            f'{pad} {json.dumps(k, ensure_ascii=False)}: {_fmt(x, indent + 1)}' for k, x in v.items()
        )
        return "{\n" + inner + "\n" + pad + "}"
    if isinstance(v, list) and v and all(isinstance(x, (list, dict)) for x in v):
        inner = ",\n".join(pad + " " + json.dumps(x, ensure_ascii=False) for x in v)
        return "[\n" + inner + "\n" + pad + "]"
    return json.dumps(v, ensure_ascii=False)


def dumps(table: dict) -> str:
    return _fmt(table) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--write", action="store_true", help=f"write {JSON_PATH.relative_to(REPO)}")
    ap.add_argument("--check", action="store_true", help="exit 1 if the JSON file is out of date")
    args = ap.parse_args(argv)
    text = dumps(build_table())
    if args.write:
        JSON_PATH.write_text(text, "utf-8")
        print(f"wrote {JSON_PATH.relative_to(REPO)}")
    elif args.check:
        cur = JSON_PATH.read_text("utf-8") if JSON_PATH.exists() else ""
        if cur != text:
            print("fm-table.json is out of date: run python -m keyframe_sinhala.table --write", file=sys.stderr)
            return 1
        print("fm-table.json is up to date")
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
