#!/usr/bin/env bash
set -euo pipefail

# Assert that META.references.tools[*].sha256 matches actual file bytes.
# Uses the existing Node checker; this wrapper ensures a clear CI entrypoint.
node "$(cd "$(dirname "$0")"/.. && pwd)/scripts/check-source-hash.js"

