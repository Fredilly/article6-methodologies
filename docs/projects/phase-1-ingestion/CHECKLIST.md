# Phase 1 Ingestion — Persistent Checklist

## Where am I (60 seconds)

- [ ] `npm run status`
- [ ] `npm run status:sectors`
- [ ] `npm run status:methods`
- [ ] `npm run validate:rich`
- [ ] `npm run validate:lean`
- [ ] `npm run validate:offline`
- [ ] `bash scripts/ci-idempotency-agriculture.sh`

## Interpretation notes

- Exit `0` = command ran successfully; non-zero = actionable failure.
- Ignore per-file commit “red X” checks in the GitHub UI; trust `main` **HEAD** checks instead.

## CI truth (main HEAD)

```sh
MAIN_SHA="$(git rev-parse HEAD)"
gh run list --branch main --limit 10 \
  --json conclusion,headSha,createdAt,displayTitle \
  -q '.[] | select(.headSha=="'"$MAIN_SHA"'")'
```

## Before starting Forestry idempotency

- [ ] `npm run status:sectors` exits `0`
- [ ] `npm run validate:rich`, `npm run validate:lean`, `npm run validate:offline` all pass
- [ ] `bash scripts/ci-idempotency-forestry.sh`

## Previous versions (canonical paths)

- Previous versions indices/locks live under `registry/<Program>/<Sector>/previous-versions.json` and `registry/<Program>/<Sector>/previous-versions.lock.json` (no `source-assets/**` duplication).
