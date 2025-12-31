#!/usr/bin/env bash
set -euo pipefail

SHA="${1:-}"
if [[ -z "${SHA}" ]]; then
  echo "usage: scripts/commit-truth.sh <sha>" >&2
  exit 2
fi

for bin in git gh jq; do
  if ! command -v "${bin}" >/dev/null 2>&1; then
    echo "ERROR: missing required command: ${bin}" >&2
    exit 1
  fi
done

dirty="$(git status --porcelain=v1 || true)"
if [[ -n "${dirty}" ]]; then
  echo "ERROR: working tree must be clean." >&2
  echo "Run one of:" >&2
  echo "  - git commit -am \"...\"" >&2
  echo "  - git stash -u" >&2
  echo "  - git restore --staged --worktree ." >&2
  echo >&2
  echo "-- git status --porcelain" >&2
  printf '%s\n' "${dirty}" >&2
  exit 1
fi

if ! git cat-file -e "${SHA}^{commit}" 2>/dev/null; then
  echo "ERROR: not a commit (or not found): ${SHA}" >&2
  exit 1
fi

repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

echo "== Repo =="
echo "${repo}"

echo
echo "== Commit =="
echo "${SHA}"

echo
echo "== Subject =="
git show -s --format=%s "${SHA}"

echo
echo "== Changed Files =="
git show --name-only --pretty=format: "${SHA}"

api_path="/repos/${repo}/commits/${SHA}/check-runs?per_page=100"
json="$(gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "${api_path}")"

total="$(printf '%s' "${json}" | jq -r '.check_runs | length')"
blockers="$(printf '%s' "${json}" | jq -r '
  .check_runs
  | map({
      name: (.name // ""),
      status: (.status // ""),
      conclusion: (.conclusion // null),
      details_url: (.details_url // "")
    })
  | map(select(
      (.status | ascii_downcase) != "completed"
      or (
        ((.conclusion // "") | ascii_downcase) as $c
        | ($c != "success" and $c != "skipped")
      )
    ))
  | sort_by(.name)
  | .[]?
  | "\(.name)\tstatus=\(.status)\tconclusion=\(.conclusion // "null")\t\(.details_url)"
')"
blockers_count="$(printf '%s' "${blockers}" | awk 'NF { c++ } END { print c+0 }')"

echo
echo "== Checks (GitHub check-runs for SHA) =="
echo "total_check_runs=${total}"
echo "blockers=${blockers_count}"

if [[ "${total}" == "0" ]]; then
  echo "ERROR: no check-runs found for this SHA." >&2
  exit 1
fi

if [[ "${blockers_count}" == "0" ]]; then
  echo "✅ none"
  exit 0
fi

echo
echo "-- BLOCKERS (anything not SUCCESS/SKIPPED) --"
printf '%s\n' "${blockers}"
exit 1
