#!/usr/bin/env node
/**
 * Canonical JSON checker/fixer
 * - Default: check only; list non-canonical files and exit non-zero.
 * - With --fix: rewrite files with sorted keys, 2-space indent, trailing LF.
 * - Optional positional args restrict processing to explicit files.
 * - Optional --roots=<dir,dir> overrides the default directory scan.
 */
const fs = require('fs');
const path = require('path');

function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === 'object') {
    const out = {};
    Object.keys(obj)
      .sort()
      .forEach((k) => {
        out[k] = sortKeysDeep(obj[k]);
      });
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

function dedupe(items) {
  return Array.from(new Set(items));
}

const rootDir = process.cwd();

function toRelative(absPath) {
  return path.relative(rootDir, absPath) || absPath;
}

const argv = process.argv.slice(2);
const fix = argv.includes('--fix');
const explicitRootsArg = argv.find((arg) => arg.startsWith('--roots='));
const roots = explicitRootsArg
  ? explicitRootsArg.replace('--roots=', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : ['methodologies', 'schemas', 'tests'];

const filesFromArgs = argv.filter((arg) => !arg.startsWith('--'));

let files = [];
if (filesFromArgs.length) {
  files = dedupe(filesFromArgs.map((p) => path.resolve(p))).filter((p) => p.endsWith('.json'));
} else {
  roots.forEach((root) => {
    if (!root) return;
    const abs = path.resolve(root);
    if (fs.existsSync(abs)) {
      files = files.concat(listJsonFiles(abs));
    }
  });
  files = dedupe(files);
}

if (!files.length) {
  if (filesFromArgs.length) {
    process.exit(0);
  }
}

let changed = [];
files.forEach((absPath) => {
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    if (filesFromArgs.length) {
      console.warn(`Skipping missing file: ${absPath}`);
      return;
    }
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    const stable = stableStringify(parsed);
    if (stable !== raw) {
      changed.push(absPath);
      if (fix) {
        fs.writeFileSync(absPath, stable, 'utf8');
        console.log('fixed', toRelative(absPath));
      }
    }
  } catch (e) {
    console.error(`Invalid JSON: ${toRelative(absPath)}\n${e.message}`);
    process.exitCode = 2;
  }
});

if (!changed.length) {
  process.exit(0);
}

if (fix) {
  console.log(`OK: canonicalized ${changed.length}/${files.length} JSON file(s)`);
  process.exit(0);
}

console.error('Non-canonical JSON detected in:\n' + changed.map((x) => ' - ' + toRelative(x)).join('\n'));
process.exit(1);
