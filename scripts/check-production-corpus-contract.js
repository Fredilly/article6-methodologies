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
  const normalized = dir.split(path.sep).join('/');
  if (normalized.includes('/previous/')) continue;

  const metaPath = path.join(dir, 'META.json');
  if (!fs.existsSync(metaPath)) continue;

  const entries = fs.readdirSync(dir, {withFileTypes:true});
  const files = entries.filter(e => e.isFile()).map(e => e.name).sort();
  const extras = files.filter(name => !CORE.has(name));
  const missing = [...CORE].filter(name => !fs.existsSync(path.join(dir, name)));

  if (extras.length) {
    console.error(`✖ runtime methodology ${normalized} contains non-core files: ${extras.join(', ')}`);
    failed = true;
  }
  if (missing.length) {
    console.error(`✖ runtime methodology ${normalized} missing core files: ${missing.join(', ')}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('✓ every current runtime methodology directory contains exactly the five core artifacts');
