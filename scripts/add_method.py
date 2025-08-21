"""Utility to add a new methodology skeleton."""

import json
from pathlib import Path


def add_method(base_path: str, code: str, metadata: dict) -> None:
    """Create directory structure for a new methodology."""
    method_dir = Path(base_path) / code
    method_dir.mkdir(parents=True, exist_ok=True)
    (method_dir / "tests").mkdir(exist_ok=True)
    (method_dir / "outputs").mkdir(exist_ok=True)

    (method_dir / "META.json").write_text(json.dumps(metadata, indent=2))
    (method_dir / "sections.json").write_text("{}\n")
    (method_dir / "rules.json").write_text("{}\n")
    (method_dir / "tests/sample_project1.json").write_text("{}\n")
    (method_dir / "tests/expected_output1.json").write_text("{}\n")
    (method_dir / "outputs/evidence_hash.json").write_text("{}\n")
    (method_dir / "outputs/compliance_report.pdf").write_bytes(b"%PDF-1.1\n%%EOF\n")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Add a new methodology")
    parser.add_argument("code", help="Methodology code, e.g. AR-AMS0001")
    parser.add_argument("title", help="Human readable title")
    args = parser.parse_args()

    metadata = {"title": args.title, "version": "1.0", "scope": "", "refs": []}
    add_method("methodologies", args.code, metadata)
    print(f"Created methodology {args.code}")
