
set -euo pipefail
scripts/install-vendored-ajv.sh
NODE_PATH=scripts/.node/node_modules node scripts/run-ajv.js validate -s schemas/META.schema.json -d 'methodologies/**/META.json'
NODE_PATH=scripts/.node/node_modules node scripts/run-ajv.js validate -s schemas/sections.schema.json -d 'methodologies/**/sections.json'
NODE_PATH=scripts/.node/node_modules node scripts/run-ajv.js validate -s schemas/rules.schema.json -d 'methodologies/**/rules.json'
