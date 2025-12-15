# INGEST Button (Single-Button Workflow)

- Purpose: single-button ingest workflow + DS-grade gates
- Related issues: #164 #165 #166 #167 #168
- Non-goals: not a methodology/tool, does not supersede methodology content

Do NOT convert `~/desktop/ingest.md` into a methodology/tool under `tools/<ID>`.

Goal: archive it as a repo doc/spec and connect it to existing issues.

## Required actions

1) Copy the file into the repo as:
   `docs/projects/phase-1-ingestion/INGEST_BUTTON.md`
   (keep original content, but you can lightly format headings/bullets)

2) Add a short header at the top of the doc:
   - Purpose: single-button ingest workflow + DS-grade gates
   - Related issues: #164, #165, #166, #167, #168
   - Related commands: `npm run ingest:verify`, `npm run validate:lean`, `npm run status:methods`, `npm run status:sectors`, `npm run root-cause:index`

3) Extract any actionable steps from `ingest.md` into the actual “button” implementation:
   - If `scripts/ingest-verify.sh` does not exist, create it per the doc.
   - If it exists, update it to match the doc (minimal changes).

4) Do NOT touch `sections.json` / `rules.json` for methodologies in this task.

## Tests

- `npm run validate:lean`
- `npm run ingest:verify`

## Discover UNFCCC links (codes -> links.txt)

```sh
node scripts/discover-unfccc.js --codes AMS-III.A AMS-III.AU AMS-III.BE AMS-III.BF AMS-III.BK > batches/agri-ams-iii.links.txt
node scripts/discover-unfccc.js --codes-file batches/agri-ams-iii.codes.txt > batches/agri-ams-iii.links.txt
```

## If tests pass

```sh
git add docs/projects/phase-1-ingestion/INGEST_BUTTON.md scripts/ingest-verify.sh package.json
git commit -m "docs: add ingest button spec and wire DS-grade gate script (#166 #167)"
git push -u origin HEAD
```

## If tests fail

Stop and paste output + `git status -sb` + `git diff`.
