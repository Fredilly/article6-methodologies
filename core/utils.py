"""Utility helpers for the compliance engine."""

import json
from pathlib import Path


def load_json(path: str) -> dict:
    """Load JSON data from a file."""
    return json.loads(Path(path).read_text())


def save_json(data: dict, path: str) -> None:
    """Save JSON data to a file."""
    Path(path).write_text(json.dumps(data, indent=2))
