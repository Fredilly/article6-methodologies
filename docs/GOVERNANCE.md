# Repository Governance

- **Branch protection**: PRs only to `main`, status checks required (validate.yml), CODEOWNERS review required.
- **Commits**: Conventional Commits + DCO line. Prefer rebase over merge. Use `--force-with-lease` only on PR branches.
- **Node**: v20 per `.nvmrc`; keep `package-lock.json` in sync with `package.json`.
