#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  compareVersionsDesc,
  deterministicGeneratedAt,
  readJson,
  writeJson
} from './utils/cli.mjs';

function normalizeDiscovered(doc) {
  const program = String(doc?.program || '').trim();
  const sector = String(doc?.sector || '').trim();
  if (!program || !sector) {
    console.error('[previous:lock] invalid input: missing program/sector');
    process.exit(2);
  }
  const methodsIn = Array.isArray(doc?.methods) ? doc.methods : [];

  const byCode = new Map();
  for (const m of methodsIn) {
    const code = String(m?.code || '').trim();
    if (!code) continue;
    const versions = Array.isArray(m?.versions) ? m.versions.map((v) => String(v).trim()).filter(Boolean) : [];
    byCode.set(code, Array.from(new Set(versions)).sort(compareVersionsDesc));
  }

  const methods = Array.from(byCode.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'variant' }))
    .map(([code, versions]) => ({ code, versions }));

  return {
    generated_at: deterministicGeneratedAt(),
    program,
    sector,
    methods
  };
}

function main() {
  const inPath = 'registry/UNFCCC/Forestry/previous-versions.json';
  const outPath = 'registry/UNFCCC/Forestry/previous-versions.lock.json';

  const absIn = path.resolve(process.cwd(), inPath);
  if (!fs.existsSync(absIn)) {
    console.error(`[previous:lock] input not found: ${inPath}`);
    process.exit(2);
  }

  const discovered = readJson(absIn);
  const lock = normalizeDiscovered(discovered);
  writeJson(path.resolve(process.cwd(), outPath), lock);
  console.log(`[previous:lock] wrote ${outPath}`);
}

main();
