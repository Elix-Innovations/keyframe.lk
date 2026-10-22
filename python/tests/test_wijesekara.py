import pytest

from conftest import GOLDEN
from keyframe_sinhala.wijesekara import hints, type_keys, wijesekara_key


@pytest.mark.parametrize("keys,expected", GOLDEN["wijesekara"])
def test_golden_sequences(keys: str, expected: str) -> None:
    assert type_keys(keys) == expected


@pytest.mark.parametrize(
    "keys,expected",
    [("lsh", "කිය"), ("fld", "කො"), ("wd", "ආ"), ("l%", "ක්‍ර"), ("flda", "කෝ"), ("ffl", "කෛ"),
     ("fl!", "කෞ"), ("t!", "එෟ"), ("T!", "ඖ"), ("W!", "ඌ"), ("ta", "ඒ"), ("la", "ක්"), ("lH", "ක්‍ය")],
)
def test_required_sequences(keys: str, expected: str) -> None:
    assert type_keys(keys) == expected


def test_unmapped_keys_pass_through() -> None:
    for k in " 0123456789\n":
        assert wijesekara_key("ක", k) is None


def test_kombuva_after_consonant_is_pending() -> None:
    # "l" then "f" then "l": the second ක takes the kombuva, not the first.
    assert type_keys("lfl") == "කකෙ"
    # the pending kombuva carries a ZWNJ marker so it is not read as attached
    assert type_keys("lf") == "ක‌ෙ"


def test_edit_in_middle_uses_text_before_caret() -> None:
    assert wijesekara_key("ක", "a") == (0, "්")
    assert wijesekara_key("කෙ", "d") == (1, "ො")


def test_hints() -> None:
    h = hints()
    assert {"key": "l", "u": "ක"} in h
    assert all(set(x) == {"key", "u"} for x in h)
