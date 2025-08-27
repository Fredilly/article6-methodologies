#!/usr/bin/env node
/**
 * Offline validator harness (no runtime npm deps).
 * Requires precompiled validators in scripts/validators/{meta,sections,rules}.cjs
 * Generate once (online/CI) with: node scripts/compile-audit.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VDIR = path.join(__dirname, 'validators');

function req(name) {
  try { return require(path.join(VDIR, name + '.cjs')); }
  catch (e) { return null; }
}

const validators = {
  META: req('meta'),
  sections: req('sections'),
  rules: req('rules'),
};

if (!validators.META || !validators.sections || !validators.rules) {
  console.error('ERROR: compiled validators not found in scripts/validators.');
  console.error('Run once on any online box or in CI: npm i ajv@8.17.1 ajv-formats@2.1.1 && node scripts/compile-audit.js');
  process.exit(2);
}

function *walk(dir) {
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const TARGETS = [
  { name: 'META',     file: 'META.json',     validate: validators.META },
  { name: 'sections', file: 'sections.json', validate: validators.sections },
  { name: 'rules',    file: 'rules.json',    validate: validators.rules },
];

function collect() {
  const hits = [];
  const base = path.join(ROOT, 'methodologies');
  if (!fs.existsSync(base)) return hits;
  for (const p of walk(base)) {
    for (const t of TARGETS) {
      if (p.endsWith('/' + t.file)) hits.push({ type: t.name, file: p, validate: t.validate });
    }
  }
  return hits;
}

const files = collect();
let failed = 0;

for (const { type, file, validate } of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    console.error(`✖ ${type}: ${file} — invalid JSON: ${e.message}`);
    failed++; continue;
  }
  const ok = validate(data);
  if (!ok) {
    console.error(`✖ ${type}: ${file}`);
    for (const err of (validate.errors || [])) {
      console.error(`  - ${err.instancePath || '(root)'} ${err.message}`);
    }
    failed++;
  } else {
    console.log(`✓ ${type}: ${file} valid`);
  }
}

if (files.length === 0) console.log('ℹ no target JSON files found under /methodologies');
process.exit(failed ? 1 : 0);
