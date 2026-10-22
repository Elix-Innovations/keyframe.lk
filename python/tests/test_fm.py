import pytest

from conftest import GOLDEN
from keyframe_sinhala import table as T
from keyframe_sinhala.fm import fm_to_unicode, has_sinhala, split_for_fm, unicode_to_fm

CORPUS = [
    "මේක තමයි 2026 A/L ICT කරන ළමයින්ට අපි කරන අන්තිම program එක",
    "ශ්‍රී ලංකාව", "ප්‍රශ්නය", "කෝප්පය", "පොත", "කෞතුක", "රූපය", "කුරුල්ලා", "සූර්යයා",
    "ක්‍රියාව", "විද්‍යාව", "ගෘහ", "දෛවය", "රැකියාව", "ගුරුතුමා", "ප්‍රෝඩා",
    "ධර්‍මය", "ශුභ", "ශූන්‍ය", "ළුණු", "ළූ", "ක්‍ෂේත්‍රය", "ඓතිහාසික", "ඖෂධ", "ආයුබෝවන්",
]


def roundtrip_runs(text: str) -> str:
    """Convert the Sinhala runs only, as the renderer does."""
    return "".join(
        fm_to_unicode(unicode_to_fm(r.text)) if r.sinhala else r.text for r in split_for_fm(text)
    )


@pytest.mark.parametrize("word", CORPUS)
def test_round_trip(word: str) -> None:
    assert roundtrip_runs(word) == word


@pytest.mark.parametrize("u,fm", GOLDEN["unicodeToFM"])
def test_golden_u2fm(u: str, fm: str) -> None:
    assert unicode_to_fm(u) == fm
    assert fm_to_unicode(fm) == u


@pytest.mark.parametrize("fm,u", GOLDEN["fmToUnicode"])
def test_golden_fm2u(fm: str, u: str) -> None:
    assert fm_to_unicode(fm) == u


def test_verified_corrections() -> None:
    # Settled with python -m keyframe_sinhala.verify against the real FM fonts.
    assert unicode_to_fm("ඟ") == "Õ"  # "¹" is a Latin "v" in the fonts
    assert unicode_to_fm("ර්‍ක") == "l_"  # repaya hook, not "¾"
    assert unicode_to_fm("ළූ") == "¿E"
    assert unicode_to_fm("කඃ") == "l#"
    assert unicode_to_fm("ශු") == "Y="


def test_every_table_entry_round_trips() -> None:
    for u, _ in T.CONSONANTS + T.INDEPENDENT_VOWELS + T.SPECIAL_SYLLABLES + T.CONJUNCTS:
        assert fm_to_unicode(unicode_to_fm(u)) == u, u
    for u, _ in T.VOWEL_SIGNS:
        assert fm_to_unicode(unicode_to_fm("ක" + u)) == "ක" + u
    for u, *_ in T.PRE_BASE:
        for c in ("ක", "ක්‍ර", "ක්‍ය", "ර්‍ක"):
            assert fm_to_unicode(unicode_to_fm(c + u)) == c + u, c + u


def test_fm_codes_unique() -> None:
    fms = [f for _, f in T.CONSONANTS + T.INDEPENDENT_VOWELS + T.VOWEL_SIGNS + T.SPECIAL_SYLLABLES + T.CONJUNCTS]
    fms += list(T.SIGNS.values()) + [f for _, f in T.PUNCTUATION]
    assert len(fms) == len(set(fms))


def test_punctuation_and_passthrough() -> None:
    assert unicode_to_fm("ආ, ඒ.") == "wd\" ta'"
    assert unicode_to_fm("2026") == "2026"
    assert fm_to_unicode("2026 ") == "2026 "


def test_split_for_fm() -> None:
    runs = split_for_fm("  මේ A/L එක")
    assert [(r.text, r.sinhala) for r in runs] == [("  මේ ", True), ("A/L ", False), ("එක", True)]
    assert has_sinhala("abc ක") and not has_sinhala("abc")


def test_json_is_up_to_date() -> None:
    assert T.main(["--check"]) == 0
