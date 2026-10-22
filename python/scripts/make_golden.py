"""Regenerate tests/golden.json from the Python implementation.

Review the diff by eye before committing: golden.json is what both the Python
tests and the TypeScript parity script (scripts/ts_parity.ts) assert."""

from __future__ import annotations

from pathlib import Path

from keyframe_sinhala.fm import fm_to_unicode, unicode_to_fm
from keyframe_sinhala.table import _fmt
from keyframe_sinhala.wijesekara import type_keys

CORPUS = [
    "මේක තමයි අපි කරන අන්තිම එක", "ශ්‍රී ලංකාව", "ප්‍රශ්නය", "කෝප්පය", "පොත", "කෞතුක", "රූපය",
    "කුරුල්ලා", "සූර්යයා", "සූර්‍යයා", "ක්‍රියාව", "විද්‍යාව", "ගෘහ", "දෛවය", "රැකියාව", "ගුරුතුමා",
    "ප්‍රෝඩා", "ධර්මය", "ධර්‍මය", "ශුභ", "ශූන්‍ය", "ළුණු", "ළූ", "රෑ", "දුඃඛ", "සිංහල", "ආයුබෝවන්",
    "ඇත", "ඈත", "ඉර", "ඊයේ", "උඩ", "ඌන", "ඍෂි", "එක", "ඒක", "ඓතිහාසික", "ඔබ", "ඕනෑ", "ඖෂධ", "ඟ",
    "අඬ", "සඳ", "අඹ", "ක්‍ෂේත්‍රය", "ක්‍රේ", "ශ්‍රේණිය", "ද්‍රව්‍ය", "කෘෂිකර්මය", "තෘප්තිය",
    "ආ, ඒ. (හරි) ?",
]
FM_SAMPLES = ["fla%", "Ë", "fè", "ø", "›", "®", ";=", "l+", "¿E", "Y=", "re", "/", "fldamamh", "'",
              "wd\" ta'", "l¾", "A", "ÿ"]
KEY_SEQS = ["lsh", "fld", "flda", "fl!", "ffl", "lfl", "wd", "we", "wE", "ta", "Ta", "T!", "W!", "RD",
            "ft", "l%", "l%s", "fl%", "fl%a", "la", "re", "rE", "l%e", "CO", "CI", "/", "?", "lH", "l_",
            "lH_", "fl_", "ffo", "lDD", "oq#L", "Y%S", ",xldj", "m%Yakh", "l=re,a,d", "fcHd",
            "mqia;l 1 2", "wdhqfndajka"]


def main() -> None:
    g = {
        "note": "Golden pairs checked by python/tests (Python) and python/scripts/ts_parity.ts (TypeScript). "
                "Regenerate with scripts/make_golden.py and review the diff by eye.",
        "unicodeToFM": [[w, unicode_to_fm(w)] for w in CORPUS],
        "fmToUnicode": [[f, fm_to_unicode(f)] for f in FM_SAMPLES],
        "wijesekara": [[k, type_keys(k)] for k in KEY_SEQS],
    }
    out = Path(__file__).resolve().parents[1] / "tests" / "golden.json"
    out.write_text(_fmt(g) + "\n", "utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
