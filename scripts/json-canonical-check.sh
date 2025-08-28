#!/usr/bin/env node
/**
 * Canonical JSON checker/fixer
 * - Default: check only; list non-canonical files and exit non-zero.
 * - With --fix: rewrite files with sorted keys, 2-space indent, trailing LF.
 */
const fs = require('fs');
const path = require('path');

function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === 'object') {
    const out = {};
    Object.keys(obj).sort().forEach(k => { out[k] = sortKeysDeep(obj[k]); });
    return out;
  }
  return obj;
}

function stableStringify(obj) {
  return JSON.stringify(sortKeysDeep(obj), null, 2) + '\n';
}

function listJsonFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(listJsonFiles(res));
    } else if (res.endsWith('.json')) {
      results.push(res);
    }
  }
  return results;
}

const roots = ['methodologies', 'schemas', 'tests'];
let files = [];
roots.forEach(r => {
  if (fs.existsSync(r)) files = files.concat(listJsonFiles(r));
});
let changed = [];
files.forEach(f => {
  const raw = fs.readFileSync(f, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    const stable = stableStringify(parsed);
    if (stable !== raw) {
      changed.push(f);
      if (process.argv.includes('--fix')) {
        fs.writeFileSync(f, stable, 'utf8');
        console.log('fixed', f);
      }
    }
  } catch (e) {
    console.error(`Invalid JSON: ${f}\n${e.message}`);
    process.exitCode = 2;
  }
});
if (changed.length) {
  if (process.argv.includes('--fix')) {
    console.log(`OK: canonicalized ${changed.length}/${files.length} JSON file(s)`);
    process.exit(0);
  } else {
    console.error('Non-canonical JSON detected in:\n' + changed.map(x => ' - ' + x).join('\n'));
    process.exit(1);
  }
}
