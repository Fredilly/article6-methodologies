# Previous Tools — Scope, Storage, and Minimal Invariants

## What counts as a “tool” in this repo?

In this repo, a **tool** is any *normative artifact required to interpret or apply a methodology*, and that is stored under `tools/**`.

Today, tools are primarily:
- **PDFs** (methodology PDFs, AM/AR tool PDFs, EB meeting reports when used as normative context)
- **Pointer artifacts** for prior versions (see “Previous” below)

Non-tools (by default):
- Registry entries under `registry/**` (these are indexes/lockfiles, not source artifacts)
- Generated methodology outputs under `methodologies/**` (these are derived artifacts)

If we later add structured tool metadata (e.g., JSON manifests, calculators, templates), those will also be “tools” only if they are normative inputs and are stored under `tools/**`.

## Canonical locations

- **Tool source artifacts (canonical):** `tools/<Program>/<Sector>/<Code>/<Version>/*`
- **Previous-version tool pointers (canonical):** `tools/<Program>/<Sector>/<Code>/<ActiveVersion>/previous/<PrevVersion>/tools/`
- **Previous-version indices/locks (canonical):** `registry/<Program>/<Sector>/previous-versions.json` and `registry/<Program>/<Sector>/previous-versions.lock.json`

Notes:
- `registry/**` tracks *what* previous versions should exist (and where), but is not itself a tool source store.
- `tools/**/previous/**/tools/` contains “previous tool” artifacts needed to re-ingest previous versions deterministically without expanding scope.

## What “previous” means for tools

For a previous methodology version under:
`methodologies/<Program>/<Sector>/<Code>/<ActiveVersion>/previous/<PrevVersion>/`

the corresponding previous **tool** source PDF is stored at:
`tools/<Program>/<Sector>/<Code>/<ActiveVersion>/previous/<PrevVersion>/tools/source.pdf`

And we keep a short human-readable pointer file at:
`tools/<Program>/<Sector>/<Code>/<ActiveVersion>/previous/<PrevVersion>/tools/POINTERS.md`

This supports deterministic re-ingest of prior versions while keeping the active version’s tool tree authoritative.

## CI: minimal invariants to enforce now (no schema churn)

Since tools are currently PDFs + pointer files (no structured tool manifests), the smallest enforceable invariants are:

1. **All tool paths referenced in `methodologies/**/META.json` must exist and match their recorded `sha256`.**
   - This includes previous-version `tools/**/previous/**/tools/source.pdf` references.
2. **Previous versions are materialized under `methodologies/**/previous/**` via the sector lockfile, not ad-hoc discovery.**
   - Lockfiles live under `registry/<Program>/<Sector>/previous-versions.lock.json`.

Non-goals (for this milestone):
- Adding new tool schemas or meta.json under `tools/**`
- Reintroducing `source-assets/**` as a canonical output location
- Expanding enforcement to new sectors/programs beyond what existing CI already checks

