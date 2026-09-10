#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const CORE = new Set(['META.json','sections.json','sections.rich.json','rules.json','rules.rich.json']);
const LEGACY_CORE = new Set(['META.json','sections.json','rules.json']);
let failed = false;

function isHistorical(p) {
  return path.normalize(p).split(path.sep).includes('previous');
}

function *walkRuntimeDirs(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, {withFileTypes:true})) {
    if (!e.isDirectory()) continue;
    const p = path.join(d, e.name);
    if (isHistorical(p)) continue;

    // A runtime methodology package is identified by META.json. This avoids
    // treating support/specification directories that merely happen to use a
    // v* name as methodology packages.
    if (fs.existsSync(path.join(p, 'META.json'))) yield p;
    yield *walkRuntimeDirs(p);
  }
}

for (const dir of walkRuntimeDirs('methodologies')) {
  const normalized = dir.split(path.sep).join('/');
  const entries = fs.readdirSync(dir, {withFileTypes:true});
  const files = entries.filter(e => e.isFile()).map(e => e.name).sort();
  const extras = files.filter(name => !CORE.has(name));

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, 'META.json'), 'utf8'));
  } catch (err) {
    console.error(`✖ runtime methodology ${normalized} has invalid META.json: ${err.message}`);
    failed = true;
    continue;
  }

  // Cleanliness applies to every current runtime package: governance/support
  // artifacts must live in governance/**, never beside runtime methodology data.
  if (extras.length) {
    console.error(`✖ runtime methodology ${normalized} contains non-core files: ${extras.join(', ')}`);
    failed = true;
  }

  // Governance-v1/rich packages use the five-file contract. Older packages
  // retain the established trio until they are deliberately migrated.
  const hasRich = files.includes('sections.rich.json') || files.includes('rules.rich.json');
  const usesGovernanceV1 = Boolean(meta && meta.governance_v1);
  const required = (hasRich || usesGovernanceV1) ? CORE : LEGACY_CORE;
  const missing = [...required].filter(name => !files.includes(name));

  if (missing.length) {
    console.error(`✖ runtime methodology ${normalized} missing required files: ${missing.join(', ')}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('✓ current runtime methodology packages are clean; Governance-v1/rich packages satisfy the five-file contract');
