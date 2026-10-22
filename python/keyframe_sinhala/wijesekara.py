"""Wijesekara keyboard -> Unicode Sinhala (Python port of web/src/lib/wijesekara.ts).

Stateless: every decision is made from the text before the caret, so the
same function works in a textarea after cursor moves, undo and paste.

`wijesekara_key(before, key)` returns (delete_back, insert) or None when the
key is not part of the layout (the caller then types it normally).

Kombuva handling: on the Wijesekara layout ෙ ("f") is typed *before* the
consonant. A typed kombuva is inserted as a lone ෙ (prefixed with ZWNJ when it
directly follows a consonant, so it is not mistaken for an attached one); when
the next consonant arrives the pending ෙ is removed and consonant + ෙ is
inserted in Unicode order. "ff" makes ෛ. Keys typed after an attached ෙ then
complete the split vowel: a -> ේ, d -> ො, (ො) a -> ෝ, ! -> ෞ.
"""

from __future__ import annotations

from functools import lru_cache

from .fm import HAL, ZWJ, ZWNJ, load_table

KOMBUVA = "ෙ"
KOMBUVA2 = "ෛ"
PRE_SIGNS = (KOMBUVA, KOMBUVA2, "ේ", "ො", "ෝ", "ෞ")


class _Layout:
    def __init__(self, t: dict) -> None:
        self.keys: dict[str, dict[str, str]] = t["wijesekara"]
        self.compose: list[list[str]] = t["wijesekaraCompose"]
        self.consonants = {u for u, _ in t["consonants"] if len(u) == 1}
        # Split vowels by FM suffix after the kombuva: "" -> ෙ, "a" -> ේ, ...
        self.pre_by_suffix = {s: u for u, p, s in t["preBase"] if p == "f"}
        self.suffix_of = {u: s for s, u in self.pre_by_suffix.items()}


@lru_cache(maxsize=1)
def _layout() -> _Layout:
    return _Layout(load_table())


def _is_cons(ch: str) -> bool:
    return ch in _layout().consonants


def _pending_kombuva(before: str) -> tuple[int, str] | None:
    """A kombuva typed but not yet attached: (chars to delete, sign)."""
    if not before or before[-1] not in (KOMBUVA, KOMBUVA2):
        return None
    sign = before[-1]
    prev = before[-2] if len(before) >= 2 else ""
    if prev == ZWNJ:
        return 2, sign
    if prev and (_is_cons(prev) or prev == ZWJ):
        return None  # attached to a consonant (or a touching-conjunct in progress)
    return 1, sign


def _attached_pre(before: str) -> str | None:
    """The split-vowel sign at the end of `before` when it belongs to a consonant."""
    if not before or before[-1] not in PRE_SIGNS:
        return None
    prev = before[-2] if len(before) >= 2 else ""
    return before[-1] if _is_cons(prev) else None


def _cluster_start(before: str) -> int:
    """Index where the consonant cluster ending `before` starts (-1 if none)."""
    i = len(before) - 1
    if i < 0 or not _is_cons(before[i]):
        return -1
    # walk back over C ් ZWJ C ...
    while i >= 3 and before[i - 1] == ZWJ and before[i - 2] == HAL and _is_cons(before[i - 3]):
        i -= 3
    return i


def wijesekara_key(before: str, key: str) -> tuple[int, str] | None:
    L = _layout()
    entry = L.keys.get(key)
    if entry is None:
        return None
    typ, u = entry["type"], entry["u"]

    # 1. Two-key compositions (w+d -> ආ, r+e -> රු, ...)
    for after, k, res in L.compose:
        if k == key and before.endswith(after):
            start = len(before) - len(after)
            if _is_cons(after[0]) and start > 0 and before[start - 1] == ZWJ:
                continue  # ර of a rakaransaya, not a bare consonant
            return len(after), res

    # 2. Keys that complete a split vowel after an attached kombuva.
    pre = _attached_pre(before)
    if pre is not None and pre in L.suffix_of:
        nxt = L.pre_by_suffix.get(L.suffix_of[pre] + key)
        if nxt:
            return 1, nxt

    if typ == "prebase":
        pend = _pending_kombuva(before)
        if pend and pend[1] == KOMBUVA:
            return 1, KOMBUVA2  # ff -> ෛ (keep any ZWNJ marker)
        marker = ZWNJ if before and (_is_cons(before[-1]) or before[-1] == ZWJ) else ""
        return 0, marker + KOMBUVA

    if typ == "consonant":
        pend = _pending_kombuva(before)
        if pend:
            n, sign = pend
            return n, u + sign
        # touching conjunct in progress (ක්‍ + ෙ) gets the next consonant before the ෙ
        if len(before) >= 2 and before[-1] in (KOMBUVA, KOMBUVA2) and before[-2] == ZWJ:
            return 1, u + before[-1]
        return 0, u

    if typ == "vowel" and u == "එ":
        pend = _pending_kombuva(before)
        if pend and pend[1] == KOMBUVA:
            return pend[0], "ඓ"  # f + t -> ඓ

    if typ == "mod":
        if pre is not None:
            return 1, u + pre  # rakaransaya / yansaya goes before the attached vowel sign
        return 0, u

    if typ == "repaya":
        tail = pre or ""
        body = before[: len(before) - len(tail)]
        start = _cluster_start(body)
        if start < 0:
            return 0, u
        # include rakar/yansa that follow the cluster start
        cluster = body[start:]
        return len(cluster) + len(tail), u + cluster + tail

    return 0, u


def type_keys(keys: str, text: str = "") -> str:
    """Apply a sequence of keystrokes (used by tests and the API)."""
    for k in keys:
        r = wijesekara_key(text, k)
        if r is None:
            text += k
        else:
            n, ins = r
            text = (text[: len(text) - n] if n else text) + ins
    return text


def hints() -> list[dict[str, str]]:
    """Key -> Unicode list for an on-screen reference (letters first)."""
    L = _layout()
    order = {"vowel": 0, "consonant": 1, "prebase": 2, "sign": 2, "mod": 3, "repaya": 3, "mark": 3, "special": 4}
    items = [(order.get(v["type"], 9), k, v["u"]) for k, v in L.keys.items()]
    return [{"key": k, "u": u} for _, k, u in sorted(items, key=lambda x: (x[0], x[1].lower(), x[1]))]
