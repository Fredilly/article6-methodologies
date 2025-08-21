"""Placeholder rule validation script."""

from pathlib import Path

def validate_rules(rules: dict, project: dict) -> bool:
    """Validate a set of rules against a project."""
    # Placeholder always returns True
    return True


if __name__ == "__main__":
    import json
    import sys

    rules = json.loads(Path(sys.argv[1]).read_text())
    project = json.loads(Path(sys.argv[2]).read_text())
    print(validate_rules(rules, project))
