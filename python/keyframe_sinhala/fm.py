"""Sinhala Unicode <-> legacy FM font encoding (Python port of web/src/lib/fm.ts).

Both implementations read the same web/src/lib/fm-table.json and use the same
algorithm; tests/golden.json is checked against both.

FM text is stored in visual (glyph) order: pre-base vowel signs (ෙ, ෛ) come
before the consonant cluster; rakaransaya, yansaya and the repaya hook come
after the consonant.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

HAL = "්"
ZWJ = "‍"
ZWNJ = "‌"
TABLE_PATH = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "fm-table.json"

_SINHALA_RE = re.compile("[඀-෿]")


@lru_cache(maxsize=1)
def load_table() -> dict:
    return json.loads(TABLE_PATH.read_text("utf-8"))


@dataclass(frozen=True)
class Tok:
    kind: str  # cons | iv | sign | pre | mod | repaya | mark
    u: str


class _Maps:
    def __init__(self, t: dict) -> None:
        self.cons = {u: f for u, f in t["consonants"]}
        self.iv = {u: f for u, f in t["independentVowels"]}
        self.vs = {u: f for u, f in t["vowelSigns"]}
        self.pre = {u: (p, s) for u, p, s in t["preBase"]}
        self.special = {u: f for u, f in t["specialSyllables"]}
        self.conj = {u: f for u, f in t["conjuncts"]}
        self.punct = {u: f for u, f in t["punctuation"]}
        sg = t["signs"]
        self.anusvara, self.visarga = sg["anusvara"], sg["visarga"]
        self.rakar, self.yansa, self.repaya = sg["rakaransaya"], sg["yansaya"], sg["repaya"]
        self.reverse = self._reverse(t)

    def decompose(self, u: str) -> list[Tok]:
        """Split a Unicode syllable into decoder tokens."""
        toks: list[Tok] = []
        i, n = 0, len(u)
        while i < n:
            ch = u[i]
            if ch in self.cons:
                cons = ch
                i += 1
                mods: list[Tok] = []
                while i + 2 < n + 0 and u[i] == HAL and u[i + 1] == ZWJ and u[i + 2] in self.cons:
                    c2 = u[i + 2]
                    if c2 in ("ර", "ය"):
                        mods.append(Tok("mod", HAL + ZWJ + c2))
                    else:
                        cons += HAL + ZWJ + c2
                    i += 3
                toks.append(Tok("cons", cons))
                toks.extend(mods)
            elif ch in self.iv:
                toks.append(Tok("iv", ch))
                i += 1
            elif ch in self.vs or ch in self.pre:
                toks.append(Tok("sign", ch))
                i += 1
            else:
                toks.append(Tok("mark", ch))
                i += 1
        return toks

    def _reverse(self, t: dict) -> list[tuple[str, list[Tok]]]:
        rev: dict[str, list[Tok]] = {}

        def add(f: str, toks: list[Tok]) -> None:
            rev.setdefault(f, toks)

        for u, f in t["consonants"]:
            add(f, [Tok("cons", u)])
        for u, f in t["specialSyllables"]:
            add(f, self.decompose(u))
        for u, f in t["conjuncts"]:
            add(f, [Tok("cons", u)])
        for u, f in t["independentVowels"]:
            add(f, [Tok("iv", u)])
        for u, f in t["vowelSigns"]:
            add(f, [Tok("sign", u)])
        add("f", [Tok("pre", "ෙ")])
        add("ff", [Tok("pre", "ෛ")])
        add(self.rakar, [Tok("mod", HAL + ZWJ + "ර")])
        add(self.yansa, [Tok("mod", HAL + ZWJ + "ය")])
        add(self.repaya, [Tok("repaya", "ර" + HAL + ZWJ)])
        add(self.anusvara, [Tok("mark", "ං")])
        add(self.visarga, [Tok("mark", "ඃ")])
        for u, f in t["punctuation"]:
            add(f, [Tok("mark", u)])
        for f, u in t["decodeAliases"]:
            add(f, self.decompose(u))
        # Longest FM sequence first; ties keep table order (stable sort).
        return sorted(rev.items(), key=lambda kv: -len(kv[0]))


@lru_cache(maxsize=1)
def _maps() -> _Maps:
    return _Maps(load_table())


def has_sinhala(text: str) -> bool:
    return bool(_SINHALA_RE.search(text))


def _is_sinhala_char(ch: str) -> bool:
    return bool(_SINHALA_RE.match(ch)) or ch in (ZWJ, ZWNJ)


def unicode_to_fm(text: str) -> str:
    """Convert Unicode Sinhala to FM glyph encoding.

    Non-Sinhala characters pass through, except ASCII punctuation, which is
    moved to the code points where FM fonts draw it."""
    m = _maps()
    s = unicodedata.normalize("NFC", text)
    n = len(s)
    out: list[str] = []
    i = 0

    def at(j: int) -> str:
        return s[j] if 0 <= j < n else ""

    def marks(j: int) -> int:
        while j < n:
            if s[j] == "ං":
                out.append(m.anusvara)
            elif s[j] == "ඃ":
                out.append(m.visarga)
            else:
                break
            j += 1
        return j

    while i < n:
        ch = s[i]
        if ch in m.cons:
            base = ch
            j = i + 1
            repaya = False
            if ch == "ර" and at(j) == HAL and at(j + 1) == ZWJ and at(j + 2) in m.cons:
                repaya = True
                base = s[j + 2]
                j += 3
            if at(j) == HAL and at(j + 1) == ZWJ and (base + HAL + ZWJ + at(j + 2)) in m.conj:
                base = base + HAL + ZWJ + s[j + 2]
                j += 3
            mods = ""
            while at(j) == HAL and at(j + 1) == ZWJ and at(j + 2) in ("ර", "ය"):
                mods += m.rakar if s[j + 2] == "ර" else m.yansa
                j += 3
            cluster = (m.conj[base] if base in m.conj else m.cons[base]) + mods + (m.repaya if repaya else "")
            sign = at(j)
            if sign and sign in m.pre:
                p, sfx = m.pre[sign]
                out.append(p + cluster + sfx)
                j += 1
            elif sign and sign in m.vs:
                special = m.special.get(base + sign) if not mods and not repaya else None
                out.append(special if special is not None else cluster + m.vs[sign])
                j += 1
                if sign == HAL and at(j) == ZWJ:
                    j += 1  # touching-letter ZWJ has no FM equivalent
            else:
                out.append(cluster)
            i = marks(j)
            continue

        if ch in m.iv:
            out.append(m.iv[ch])
            i = marks(i + 1)
            continue
        if ch in (ZWJ, ZWNJ):
            i += 1
            continue
        if ch in m.pre:
            p, sfx = m.pre[ch]
            out.append(p + sfx)
        elif ch == "ං":
            out.append(m.anusvara)
        elif ch == "ඃ":
            out.append(m.visarga)
        elif ch in m.vs:
            out.append(m.vs[ch])
        else:
            out.append(m.punct.get(ch, ch))
        i += 1
    return "".join(out)


def _tokenize(text: str) -> list[Tok]:
    rev = _maps().reverse
    toks: list[Tok] = []
    i = 0
    while i < len(text):
        for f, ts in rev:
            if text.startswith(f, i):
                toks.extend(ts)
                i += len(f)
                break
        else:
            toks.append(Tok("mark", text[i]))
            i += 1
    return toks


def fm_to_unicode(text: str) -> str:
    """Convert FM-encoded text back to Unicode Sinhala."""
    toks = _tokenize(text)
    out: list[str] = []
    k = 0

    def kind(j: int) -> str:
        return toks[j].kind if j < len(toks) else ""

    def read_cluster(k0: int) -> tuple[str, int]:
        cluster = toks[k0].u
        rep = False
        m = k0 + 1
        while True:
            if kind(m) == "repaya":
                rep = True
                m += 1
            elif kind(m) == "mod":
                cluster += toks[m].u
                m += 1
            elif kind(m) == "sign" and toks[m].u == HAL and kind(m + 1) == "mod":
                # "a%" typed instead of "%a": al-lakuna before rakaransaya
                toks[m], toks[m + 1] = toks[m + 1], toks[m]
            else:
                break
        return ("ර" + HAL + ZWJ if rep else "") + cluster, m

    while k < len(toks):
        t = toks[k]
        if t.kind == "pre" and kind(k + 1) == "cons":
            cluster, m = read_cluster(k + 1)
            sign = t.u
            if t.u == "ෙ":
                a = toks[m].u if kind(m) == "sign" else ""
                b = toks[m + 1].u if kind(m + 1) == "sign" else ""
                if a == "ා" and b == HAL:
                    sign, m = "ෝ", m + 2
                elif a == "ා":
                    sign, m = "ො", m + 1
                elif a == HAL:
                    sign, m = "ේ", m + 1
                elif a == "ෟ":
                    sign, m = "ෞ", m + 1
            out.append(cluster + sign)
            k = m
        elif t.kind == "cons":
            cluster, m = read_cluster(k)
            out.append(cluster)
            k = m
        else:
            out.append(t.u)
            k += 1
    return unicodedata.normalize("NFC", "".join(out))


@dataclass
class FMRun:
    text: str
    sinhala: bool


def split_for_fm(text: str) -> list[FMRun]:
    runs: list[FMRun] = []
    pending_ws = ""
    for ch in text:
        if ch.isspace():
            if runs:
                runs[-1].text += ch
            else:
                pending_ws += ch
            continue
        sinhala = _is_sinhala_char(ch)
        if runs and runs[-1].sinhala == sinhala:
            runs[-1].text += ch
        else:
            runs.append(FMRun(("" if runs else pending_ws) + ch, sinhala))
    if not runs and pending_ws:
        runs.append(FMRun(pending_ws, False))
    return runs
