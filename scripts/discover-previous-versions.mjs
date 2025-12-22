#!/usr/bin/env node
import path from 'node:path';
import { discoverPreviousVersions } from './discover-previous-versions.shared.mjs';
import { deterministicGeneratedAt, parseArgs, writeJson } from './utils/previous-versions.mjs';

function usage() {
  console.error(
    'Usage: node scripts/discover-previous-versions.mjs --program UNFCCC --sector Agriculture --out registry/UNFCCC/Agriculture/previous-versions.json',
  );
  process.exit(2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const program = String(args.program || '').trim();
  const sector = String(args.sector || '').trim();
  const outPath = String(args.out || '').trim();
  if (!program || !sector || !outPath) usage();

  const payload = await discoverPreviousVersions({ program, sector, generated_at: deterministicGeneratedAt() });
  writeJson(path.resolve(process.cwd(), outPath), payload);
  console.log(`[previous:discover] wrote ${outPath}`);
}

await main();
