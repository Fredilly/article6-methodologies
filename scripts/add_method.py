#!/usr/bin/env python3
"""CLI helper to scaffold a new methodology pack."""
import argparse
import pathlib


def main():
    """Entry point for adding methodology structure."""
    parser = argparse.ArgumentParser(description="Add a new methodology pack")
    parser.add_argument("code", help="Methodology code, e.g., AR-AMS0007")
    args = parser.parse_args()
    path = pathlib.Path("methodologies") / args.code
    # Placeholder: implement scaffolding logic
    path.mkdir(parents=True, exist_ok=True)
    print(f"Scaffolded methodology folder at {path}")


if __name__ == "__main__":
    main()
