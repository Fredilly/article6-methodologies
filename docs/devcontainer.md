# Article 6 Devcontainer

## Why

- macOS 12 can’t reliably install poppler / gcc via Homebrew (Tier 3 support).
- Poppler 25.x needs libc++ ranges support that Monterey lacks.
- Running ingest in a Linux devcontainer keeps the toolchain deterministic and avoids host‑specific breakage.

## Requirements

- Docker Desktop (or compatible OCI runtime).
- VS Code with the Dev Containers extension **or** GitHub Codespaces.

## Usage

1. Open the repo in VS Code.
2. Run “Dev Containers: Reopen in Container”.
3. The container builds from `.devcontainer/Dockerfile`, installing:
   - Node.js 20 + Corepack
   - git / git-lfs
   - curl, jq, yq
   - poppler-utils (pdftotext/pdfinfo) + qpdf
   - build-essential and other ingest deps
4. After the container starts:
   - `git lfs install` runs automatically (`postCreateCommand`).
   - Run `npm ci`.
   - Execute ingest flows inside the container, e.g. `npm run ingest:full -- ingest.forestry.yml --offline`, `bash scripts/hash-all.sh`, etc.

## Codespaces

- Codespaces automatically detects `.devcontainer/` and provisions the same image.
- Open this repo in Codespaces → all ingest tooling is ready; just run `npm ci` and the ingest/hash scripts there.

## Notes

- Hosts on macOS 12 should **not** run ingest locally; always use the container or Codespaces.
- Verify poppler utilities using `pdftotext -v` / `pdfinfo -v` once per container build to confirm the toolchain.
