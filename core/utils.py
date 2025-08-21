"""Utility helpers for the compliance engine (stub)."""
import json
from pathlib import Path


def load_json(path):
    """Load JSON data from path (placeholder)."""
    return json.loads(Path(path).read_text())
