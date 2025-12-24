#!/usr/bin/env node
import path from 'node:path';
import { discoverPreviousVersions } from './discover-previous-versions.shared.mjs';
import { deterministicGeneratedAt, writeJson } from './utils/cli.mjs';

async function main() {
  const outPath = 'source-assets/UNFCCC/Forestry/previous-versions.json';
  const payload = await discoverPreviousVersions({
    program: 'UNFCCC',
    sector: 'Forestry',
    generated_at: deterministicGeneratedAt()
  });
  writeJson(path.resolve(process.cwd(), outPath), payload);
  console.log(`[previous:discover] wrote ${outPath}`);
}

await main();

