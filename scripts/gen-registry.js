#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const baseDir = path.join(repoRoot, 'methodologies');

function versionCompare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const entries = [];
const standards = fs.readdirSync(baseDir).sort();
for (const standard of standards) {
  const standardDir = path.join(baseDir, standard);
  if (!fs.statSync(standardDir).isDirectory()) continue;
  const programs = fs.readdirSync(standardDir).sort();
  for (const program of programs) {
    const programDir = path.join(standardDir, program);
    if (!fs.statSync(programDir).isDirectory()) continue;
    const codes = fs.readdirSync(programDir).sort();
    for (const code of codes) {
      const codeDir = path.join(programDir, code);
      if (!fs.statSync(codeDir).isDirectory()) continue;
      const versions = fs.readdirSync(codeDir).sort();
      for (const vDir of versions) {
        const fullPath = path.join(codeDir, vDir);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        const metaFile = path.join(fullPath, 'META.json');
        if (!fs.existsSync(metaFile)) continue;
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        const stage = meta.stage || 'staging';
        const version = vDir.slice(1).replace(/-/g, '.');
        const relPath = path.relative(repoRoot, fullPath).split(path.sep).join('/');
        entries.push({ standard, program, code, version, path: relPath, stage });
      }
    }
  }
}

// mark latest per (standard, program, code)
const groups = new Map();
for (const e of entries) {
  const key = `${e.standard}||${e.program}||${e.code}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(e);
}
for (const arr of groups.values()) {
  arr.sort((a, b) => versionCompare(a.version, b.version));
  arr.forEach(x => (x.latest = false));
  arr[arr.length - 1].latest = true;
}

entries.sort((a, b) =>
  a.standard.localeCompare(b.standard) ||
  a.program.localeCompare(b.program) ||
  a.code.localeCompare(b.code) ||
  versionCompare(a.version, b.version)
);

const outPath = path.join(repoRoot, 'registry.json');
fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n');

