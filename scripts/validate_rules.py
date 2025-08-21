#!/usr/bin/env python3
"""Validate methodology rules against schema (stub)."""
import json
from pathlib import Path


def validate(rules_path: str):
    """Validate rules data (placeholder)."""
    data = json.loads(Path(rules_path).read_text())
    # TODO: integrate schema validation
    return bool(data)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        ok = validate(sys.argv[1])
        print("Valid" if ok else "Invalid")
    else:
        print("Usage: validate_rules.py <rules.json>")
