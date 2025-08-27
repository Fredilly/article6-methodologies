#!/usr/bin/env node
/**
 * Offline validator: no external deps. Walk repo, find target JSONs, validate with
 * precompiled validators in scripts/validators/*.cjs. Exits non-zero on any error.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  { name: 'META',     file: 'META.json',     validator: require('./validators/meta.cjs') },
  { name: 'sections', file: 'sections.json', validator: require('./validators/sections.cjs') },
  { name: 'rules',    file: 'rules.json',    validator: require('./validators/rules.cjs') },
];

function* walk(dir) {
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function collectFiles() {
  const hits = [];
  for (const p of walk(path.join(ROOT, 'methodologies'))) {
    for (const t of TARGETS) {
      if (p.endsWith('/' + t.file)) hits.push({ type: t.name, file: p, validate: t.validator });
    }
  }
  return hits;
}

const files = collectFiles();
let failed = 0;

for (const { type, file, validate } of files) {
  const raw = fs.readFileSync(file, 'utf8');
  let data;
  try { data = JSON.parse(raw); }
  catch (e) {
    console.error(`✖ ${type}: ${file} — invalid JSON: ${e.message}`);
    failed++; continue;
  }
  const ok = validate(data);
  if (!ok) {
    console.error(`✖ ${type}: ${file}`);
    for (const err of validate.errors || []) {
      console.error(`  - ${err.instancePath || '(root)'} ${err.message}`);
    }
    failed++;
  } else {
    console.log(`✓ ${type}: ${file} valid`);
  }
}

if (files.length === 0) {
  console.log('ℹ no target JSON files found under /methodologies');
}
process.exit(failed ? 1 : 0);
