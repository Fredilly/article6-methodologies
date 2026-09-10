#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { validateComponent } = require('./check-governance-source-resolution');

const ROOT = path.resolve(__dirname, '..');
const METHODS_ROOT = path.join(ROOT, 'methodologies');

function *walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = path.join(dir, entry.name);
    if (fs.existsSync(path.join(child, 'META.json'))) yield child;
    yield *walk(child);
  }
}

const failures = [];
let checked = 0;

for (const absoluteDir of walk(METHODS_ROOT)) {
  const meta = JSON.parse(fs.readFileSync(path.join(absoluteDir, 'META.json'), 'utf8'));
  if (!meta?.governance_v1) continue;
  checked += 1;
  const relativeDir = path.relative(ROOT, absoluteDir).split(path.sep).join('/');
  failures.push(...validateComponent(relativeDir));
}

if (failures.length) {
  console.error('Governance corpus provenance/atomicity gate failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Governance corpus provenance/atomicity gate passed for ${checked} governance-v1 component(s).`);
