"""Audit export utilities."""


def export_report(data: dict, path: str) -> None:
    """Write a placeholder compliance report."""
    with open(path, "w", encoding="utf-8") as f:
        f.write("Placeholder report")
