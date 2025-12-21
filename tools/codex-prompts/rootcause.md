---
description: Root Cause logging (one-shot)
argument-hint: --title "<TITLE>" [--area "<AREA>"] [--tags "<tag1, tag2>"]
---

Follow the repo Root Cause workflow exactly, using evidence only.

Steps:
1) Read `docs/projects/phase-1-ingestion/ROOT_CAUSE.md` and follow the format/template in that document.
2) Create a new entry with the one-shot generator (use `--title` and include `--area` / `--tags` if provided):
   - `npm run -s root-cause:new -- --title "<TITLE>" --area "<AREA>" --tags "<tag1, tag2>"`
3) Capture the created file path from the command output and open it.
4) Fill the entry sections using evidence from the repo only (logs, diffs, commands, file contents). Do not invent facts, do not add placeholders like “TBD”, and omit sections not supported by evidence.
5) Regenerate the index:
   - `npm run -s root-cause:index`
6) Ensure the new entry appears in `docs/projects/phase-1-ingestion/ROOT_CAUSE_INDEX.md`.
7) Commit changes using a Conventional Commit message and a signed-off-by line:
   - `git commit -s -m "docs(root-cause): <short title>"`

