#!/usr/bin/env node
/**
 * Normalise META.json files by sorting keys recursively and writing canonical JSON.
 */

const fs = require('node:fs');
const path = require('node:path');

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortValue(value[key]);
    }
    return sorted;
  }
  return value;
}

function normalizeFile(file) {
  let original;
  try {
    original = fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`[normalize-meta] failed to read ${file}: ${err.message}`);
    return false;
  }
  let data;
  try {
    data = JSON.parse(original);
  } catch (err) {
    console.error(`[normalize-meta] invalid JSON in ${file}: ${err.message}`);
    return false;
  }
  const normalised = sortValue(data);
  const contents = `${JSON.stringify(normalised, null, 2)}\n`;
  if (contents !== original) {
    fs.writeFileSync(file, contents, 'utf8');
    console.log(`[normalize-meta] updated ${path.relative(process.cwd(), file)}`);
    return true;
  }
  return false;
}

function walkMetaFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMetaFiles(full));
    } else if (entry.isFile() && entry.name === 'META.json') {
      results.push(full);
    }
  }
  return results;
}

const root = path.join(process.cwd(), 'methodologies');
if (!fs.existsSync(root)) {
  console.error('[normalize-meta] methodologies directory not found');
  process.exit(1);
}

const files = walkMetaFiles(root);
let changed = 0;
for (const file of files) {
  if (normalizeFile(file)) changed += 1;
}

console.log(`[normalize-meta] processed ${files.length} META files (${changed} updated)`);
