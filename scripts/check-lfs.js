#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function hasGitLfs() {
  const res = spawnSync('git', ['lfs', 'version'], { encoding: 'utf8' });
  if (res.error) {
    if (res.error.code === 'ENOENT') return false;
    throw res.error;
  }
  if (res.status !== 0) {
    const msg = (res.stderr || res.stdout || '').trim();
    if (msg.includes("git: 'lfs' is not a git command")) return false;
    console.error(msg);
    process.exit(res.status);
  }
  return true;
}

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

function runGitLfs(scope) {
  const res = spawnSync('git', ['lfs', 'ls-files', '--name-only', scope], { encoding: 'utf8' });
  if (res.error) {
    console.error('git lfs is required to run this check.');
    throw res.error;
  }
  if (res.status !== 0) {
    const msg = res.stderr || res.stdout;
    console.error(msg.trim());
    process.exit(res.status);
  }
  return res.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
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
  if (!hasGitLfs()) {
    console.warn('git-lfs not installed; skipping LFS audit for this run.');
    return;
  }
  const pdfs = listPdfs(absScope, root);
  const lfsList = runGitLfs(scope);
  const lfsSet = new Set(lfsList);
  const missing = pdfs.filter(p => !lfsSet.has(p));
  if (missing.length) {
    console.error('PDFs missing from git lfs tracking:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error(`PDFs total ${pdfs.length}, LFS ${lfsList.length}`);
    process.exit(1);
  }
  console.log(`All PDFs tracked by LFS under ${scope} (${pdfs.length})`);
}

try {
  main();
} catch (err) {
  process.exit(2);
}
