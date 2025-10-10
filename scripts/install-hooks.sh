#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  echo "install-hooks: not in a git repository" >&2
  exit 1
fi

cd "${repo_root}"

hook_path="${repo_root}/.githooks"
if [[ ! -d "${hook_path}" ]]; then
  echo "install-hooks: hook directory ${hook_path} missing" >&2
  exit 1
fi

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true
echo "install-hooks: configured core.hooksPath=.githooks"
