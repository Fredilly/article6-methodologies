#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const CORE = new Set(['META.json','sections.json','sections.rich.json','rules.json','rules.rich.json']);
let failed = false;

function *walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, {withFileTypes:true})) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (/^v\d/.test(e.name)) yield p;
      yield *walk(p);
    }
  }
}

for (const dir of walk('methodologies')) {
  const metaPath = path.join(dir, 'META.json');
  if (!fs.existsSync(metaPath)) continue;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (meta?.governance_v1?.production_corpus !== true) continue;
  const entries = fs.readdirSync(dir, {withFileTypes:true});
  const extras = entries.filter(e => e.isFile() && !CORE.has(e.name)).map(e => e.name).sort();
  const missing = [...CORE].filter(name => !fs.existsSync(path.join(dir, name)));
  if (extras.length) {
    console.error(`✖ production corpus ${dir} contains non-core files: ${extras.join(', ')}`);
    failed = true;
  }
  if (missing.length) {
    console.error(`✖ production corpus ${dir} missing core files: ${missing.join(', ')}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('✓ production corpus directories contain only the five core artifacts');
