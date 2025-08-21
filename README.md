# Article 6 Methodologies

This repository provides a canonical structure for storing methodologies used in Article 6 compliance workflows. Each methodology resides under `methodologies/<code>` and contains:

- `META.json` – basic metadata
- `sections.json` – parsed sections from the source document
- `rules.json` – machine-readable compliance rules
- `tests/` – fixture projects and expected outputs
- `outputs/` – generated artefacts such as compliance reports

Scripts in `scripts/` help automate adding new methodologies and parsing source PDFs. The `core/` package holds simple placeholders for the compliance engine.
