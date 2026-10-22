import json
from pathlib import Path

import pytest

GOLDEN = json.loads((Path(__file__).parent / "golden.json").read_text("utf-8"))


@pytest.fixture(scope="session")
def golden() -> dict:
    return GOLDEN
