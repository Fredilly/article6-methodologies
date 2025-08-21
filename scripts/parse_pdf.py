#!/usr/bin/env python3
"""Parse methodology PDF into structured sections (stub)."""
from pathlib import Path


def parse(pdf_path: str):
    """Return structured sections from PDF (placeholder)."""
    path = Path(pdf_path)
    raise NotImplementedError(f"PDF parsing not implemented for {path}")


if __name__ == "__main__":
    # Example usage placeholder
    import sys
    if len(sys.argv) > 1:
        parse(sys.argv[1])
    else:
        print("Usage: parse_pdf.py <path_to_pdf>")
