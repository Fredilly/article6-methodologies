#!/usr/bin/env node
// Verify that META.references.tools[*].sha256 matches actual files on disk.
// Fails fast on any mismatch or missing file. Deterministic, offline.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const MROOT = path.join(ROOT, 'methodologies');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function* walk(dir) {
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

function collectMetaFiles() {
  const metas = [];
  for (const p of walk(MROOT)) if (p.endsWith('/META.json')) metas.push(p);
  metas.sort();
  return metas;
}

let failed = 0;
for (const metaPath of collectMetaFiles()) {
  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
  catch (e) { console.error(`✖ META invalid JSON: ${metaPath} — ${e.message}`); failed = 1; continue; }
  const tools = (((meta || {}).references || {}).tools) || [];
  const issues = [];
  for (const t of tools.slice().sort((a,b)=>String(a.path).localeCompare(String(b.path)))) {
    const f = path.join(ROOT, t.path);
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) {
      issues.push({ kind: 'missing', path: t.path });
      continue;
    }
    const actual = sha256(fs.readFileSync(f));
    if (String(t.sha256) !== actual) {
      issues.push({ kind: 'mismatch', path: t.path, recorded: String(t.sha256), actual });
    }
  }
  if (issues.length) {
    console.error(`✖ META tool hash failures: ${metaPath}`);
    for (const it of issues) {
      if (it.kind === 'missing') console.error(`  - MISSING: ${it.path}`);
      else console.error(`  - MISMATCH: ${it.path}\n    recorded: ${it.recorded}\n    actual  : ${it.actual}`);
    }
    failed = 1;
  } else {
    console.log(`✓ META tools ok: ${metaPath}`);
  }
}

process.exit(failed ? 1 : 0);

