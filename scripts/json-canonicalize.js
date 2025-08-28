#!/usr/bin/env node
// Canonicalize JSON files by sorting all object keys recursively and
// writing with 2-space indentation and a trailing LF. Targets:
// - methodologies/**/*.json
// - schemas/**/*.json
// - tests/**/*.json
const fs = require('fs');
const path = require('path');

function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj).sort()) out[k] = sortKeysDeep(obj[k]);
    return out;
  }
  return obj;
}

function listJsonFiles(dir) {
  const out = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && p.endsWith('.json')) out.push(p);
    }
  })(dir);
  return out.sort();
}

const roots = ['methodologies', 'schemas', 'tests'];
let changed = 0, total = 0;
for (const r of roots) {
  for (const f of listJsonFiles(r)) {
    total++;
    const raw = fs.readFileSync(f, 'utf8');
    let data;
    try { data = JSON.parse(raw); } catch (e) { console.error(`invalid JSON: ${f}`); process.exitCode = 2; continue; }
    const stable = JSON.stringify(sortKeysDeep(data), null, 2) + '\n';
    if (stable !== raw) {
      fs.writeFileSync(f, stable, 'utf8');
      console.log('fixed', f);
      changed++;
    }
  }
}
console.log(`OK: canonicalized ${changed}/${total} JSON file(s)`);
