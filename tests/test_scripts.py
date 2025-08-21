import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import pytest
from scripts.parse_pdf import parse_pdf


def test_parse_pdf_missing_file(tmp_path):
    missing = tmp_path / "missing.pdf"
    with pytest.raises(FileNotFoundError):
        parse_pdf(str(missing))
