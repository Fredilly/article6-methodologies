#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function listPdfs(dir, root) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listPdfs(full, root));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      results.push(path.relative(root, full));
    }
  }
  return results;
}

function trackedByLfs(file) {
  const res = spawnSync('git', ['check-attr', 'filter', '--', file], { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    console.error((res.stderr || res.stdout || '').trim());
    process.exit(res.status);
  }
  const line = res.stdout.trim();
  const match = line.match(/:\s*filter:\s*(\S+)/i);
  return match ? match[1].toLowerCase() === 'lfs' : false;
}

function main() {
  const args = process.argv.slice(2);
  let scope = 'tools';
  if (args[0] === '--scope' && args[1]) {
    scope = args[1];
  }
  const root = process.cwd();
  const absScope = path.resolve(scope);
  if (!fs.existsSync(absScope)) {
    console.error(`scope path not found: ${scope}`);
    process.exit(2);
  }
  const relScope = path.relative(root, absScope).split(path.sep).join('/');
  if (scope === 'tools' || relScope === 'tools') {
    console.warn('Skipping LFS audit for tools scope (enforcement disabled).');
    return;
  }
  const pdfs = listPdfs(absScope, root);
  const missing = pdfs.filter(p => !trackedByLfs(p));
  if (missing.length) {
    console.error('PDFs missing from git lfs tracking:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error(`PDFs total ${pdfs.length}, tracked ${pdfs.length - missing.length}`);
    process.exit(1);
  }
  console.log(`All PDFs tracked by LFS under ${scope} (${pdfs.length})`);
}

try {
  main();
} catch (err) {
  process.exit(2);
}
