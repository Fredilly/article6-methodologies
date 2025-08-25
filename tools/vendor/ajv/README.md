# Vendored AJV
This folder contains a pinned AJV toolchain committed to the repo so JSON Schema validation runs without external registry access.

## Bootstrap (run locally once)
./scripts/vendorize-ajv.sh

Then commit the generated `tools/vendor/ajv/node_modules` and `tools/vendor/ajv/package-lock.json`.
