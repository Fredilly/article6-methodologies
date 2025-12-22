#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseIngestYaml } from './resolve-ingest-scope.mjs';
import {
  compareVersionsDesc,
  deterministicGeneratedAt,
  extractCodeFromId,
  parseArgs,
  sectorToken,
  readJson,
  writeJson
} from './utils/previous-versions.mjs';

function usage() {
  console.error(
    'Usage: node scripts/lock-previous-versions.mjs --in source-assets/UNFCCC/Agriculture/previous-versions.json --out source-assets/UNFCCC/Agriculture/previous-versions.lock.json',
  );
  process.exit(2);
}

function listCodesFromIngest({ program, sector }) {
  const token = sectorToken(sector);
  const ingestPath = path.resolve(process.cwd(), `ingest.${token}.yml`);
  if (!fs.existsSync(ingestPath)) {
    console.error(`[previous:lock] ingest file not found: ${path.relative(process.cwd(), ingestPath)}`);
    process.exit(2);
  }
  const doc = parseIngestYaml(fs.readFileSync(ingestPath, 'utf8'));
  const methods = Array.isArray(doc?.methods) ? doc.methods : [];
  const codes = new Set();
  for (const m of methods) {
    const id = String(m?.id || '').trim();
    if (!id) continue;
    if (!id.toLowerCase().startsWith(`${program.toLowerCase()}.${sector.toLowerCase()}.`)) continue;
    const code = extractCodeFromId(id);
    if (code) codes.add(code);
  }
  return new Set(codes);
}

function normalizeDiscovered(doc) {
  const program = String(doc?.program || '').trim();
  const sector = String(doc?.sector || '').trim();
  if (!program || !sector) {
    console.error('[previous:lock] invalid input: missing program/sector');
    process.exit(2);
  }
  const ingestCodes = listCodesFromIngest({ program, sector });
  const methodsIn = Array.isArray(doc?.methods) ? doc.methods : [];

  const byCode = new Map();
  for (const m of methodsIn) {
    const code = String(m?.code || '').trim();
    if (!code) continue;
    if (!ingestCodes.has(code)) continue;
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
  const args = parseArgs(process.argv.slice(2));
  const inPath = String(args.in || '').trim();
  const outPath = String(args.out || '').trim();
  if (!inPath || !outPath) usage();

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

