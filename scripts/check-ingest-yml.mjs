#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseIngestYaml } from './resolve-ingest-scope.mjs';

function usage() {
  console.error('Usage: node scripts/check-ingest-yml.mjs <ingest.yml>');
  process.exit(2);
}

function main() {
  const ingestFile = process.argv[2];
  if (!ingestFile) usage();

  const ingestPath = path.resolve(process.cwd(), ingestFile);
  if (!fs.existsSync(ingestPath)) {
    console.error(`[ingest-yml] not found: ${ingestPath}`);
    process.exit(2);
  }

  const doc = parseIngestYaml(fs.readFileSync(ingestPath, 'utf8'));
  const methods = doc.methods || [];
  if (!methods.length) {
    console.error(`[ingest-yml] FAIL: zero methods parsed from ${ingestFile}`);
    process.exit(1);
  }

  for (const method of methods) {
    const id = `${method.id || ''}`.trim();
    const version = `${method.version || ''}`.trim();
    if (!id || !version) {
      console.error(`[ingest-yml] FAIL: missing id/version: ${JSON.stringify(method)}`);
      process.exit(1);
    }
    process.stdout.write(`${id} ${version}\n`);
  }
}

main();

