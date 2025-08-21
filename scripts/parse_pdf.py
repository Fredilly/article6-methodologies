"""Placeholder PDF parsing script."""

from pathlib import Path


def parse_pdf(pdf_path: str) -> dict:
    """Parse a PDF file and return a structured representation."""
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(pdf_path)
    # Placeholder logic
    return {"sections": []}


if __name__ == "__main__":
    import json
    import sys

    result = parse_pdf(sys.argv[1])
    print(json.dumps(result, indent=2))
