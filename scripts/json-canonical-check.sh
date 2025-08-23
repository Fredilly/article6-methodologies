#!/usr/bin/env node
/**
 * Re-serializes JSON files with sorted keys and 2-space indent, then
 * exits non-zero if any file would change. Does not modify files.
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
    if (stable !== raw) changed.push(f);
  } catch (e) {
    console.error(`Invalid JSON: ${f}\n${e.message}`);
    process.exitCode = 2;
  }
});
if (changed.length) {
  console.error('Non-canonical JSON detected in:\n' + changed.map(x => ' - ' + x).join('\n'));
  process.exit(1);
}
