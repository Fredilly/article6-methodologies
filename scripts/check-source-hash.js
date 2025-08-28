#!/usr/bin/env node
// Meta-driven source hash checker (Node-only; no jq)
// Verifies that each path listed in META.references.tools[*].path exists
// and matches the recorded SHA-256 in META.references.tools[*].sha256.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const MROOT = path.join(ROOT, 'methodologies');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name === 'META.json') yield p;
  }
}

let failed = 0;
for (const metaPath of walk(MROOT)) {
  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
  catch (e) { console.error(`✖ META invalid JSON: ${metaPath} — ${e.message}`); failed = 1; continue; }
  const tools = (((meta || {}).references || {}).tools) || [];
  if (!Array.isArray(tools) || tools.length === 0) {
    console.log(`ℹ No tool refs in ${metaPath}`);
    continue;
  }
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
    } else {
      console.log(`✓ OK: ${t.path} matches META in ${path.dirname(metaPath)}`);
    }
  }
  if (issues.length) {
    console.error(`✖ META tool hash failures: ${metaPath}`);
    for (const it of issues) {
      if (it.kind === 'missing') console.error(`  - MISSING: ${it.path}`);
      else console.error(`  - MISMATCH: ${it.path}\n    recorded: ${it.recorded}\n    actual  : ${it.actual}`);
    }
    failed = 1;
  }
}
process.exit(failed ? 1 : 0);

