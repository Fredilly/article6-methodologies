#!/usr/bin/env bash
set -euo pipefail
META_0003="methodologies/UNFCCC/Forestry/AR-AMS0003/v01-0/META.json"
expect=("AR-TOOL08_v4-0-0.pdf" "AR-TOOL12_v3-1.pdf" "AR-TOOL14_v4-2.pdf" "AR-TOOL15_v2-0.pdf")
mapfile -t have < <(jq -r '.references.tools[]?.path | select(contains("AR-AMS0007"))' "$META_0003" | awk -F/ '{print $NF}' | sort -u)
ok=1
if printf '%s\n' "${have[@]}" | grep -qx 'AR-TOOL16_v1-1-0.pdf'; then
  echo "POLICY FAIL: 0003 must not reference AR-TOOL16"; ok=0
fi
missing=(); extra=()
for e in "${expect[@]}"; do grep -qx "$e" <(printf '%s\n' "${have[@]}") || missing+=("$e"); done
for a in "${have[@]}"; do grep -qx "$a" <(printf '%s\n' "${expect[@]}") || extra+=("$a"); done
if (( ${#missing[@]} )); then echo "POLICY FAIL: missing ${missing[*]}"; ok=0; fi
if (( ${#extra[@]} )); then echo "POLICY FAIL: unexpected ${extra[*]}"; ok=0; fi
((ok==1)) && echo "POLICY OK: 0003 tools = ${have[*]}" || exit 1
