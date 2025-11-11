#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { normalizeVersion, compareVersionTags } = require('../core/versioning');

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

function sourceAssetPath(meta) {
  if (!meta || !meta.id || !meta.version) return null;
  const parts = String(meta.id).split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const publisher = parts[0];
  const middle = parts.slice(1, -1);
  const code = parts[parts.length - 1];
  const segments = ['source-assets', publisher].concat(middle, [code, meta.version, 'source.pdf']);
  return segments.join('/');
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
      const versions = fs.readdirSync(codeDir).sort((a, b) => compareVersionTags(a, b));
      for (const vDir of versions) {
        const fullPath = path.join(codeDir, vDir);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        const metaFile = path.join(fullPath, 'META.json');
        if (!fs.existsSync(metaFile)) continue;
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        const normalizedVersionTag = normalizeVersion(vDir);
        const version = normalizedVersionTag.slice(1).replace(/-/g, '.');
        const relPath = path.relative(repoRoot, fullPath).split(path.sep).join('/');
        const audit = meta.audit_hashes || {};
        if (relPath.includes('/previous/')) {
          const sourcePath = sourceAssetPath(meta) || `${relPath}/source.pdf`;
          entries.push({
            kind: 'previous',
            standard,
            program,
            code,
            version,
            path: relPath,
            status: meta.status || 'superseded',
            effective_from: meta.effective_from || null,
            effective_to: meta.effective_to || null,
            source_pdf: {
              path: sourcePath,
              sha256: audit.source_pdf_sha256 || null,
            },
            tools: meta.tools || [],
          });
          continue;
        }
        const stage = meta.stage || 'staging';
        entries.push({
          kind: 'active',
          standard,
          program,
          code,
          version,
          path: relPath,
          stage,
          latest: false,
        });

        const previousDir = path.join(fullPath, 'previous');
        if (fs.existsSync(previousDir) && fs.statSync(previousDir).isDirectory()) {
          const prevEntries = fs.readdirSync(previousDir).sort((a, b) => compareVersionTags(a, b));
          for (const prevVer of prevEntries) {
            const prevPath = path.join(previousDir, prevVer);
            if (!fs.statSync(prevPath).isDirectory()) continue;
            const prevMetaFile = path.join(prevPath, 'META.json');
            if (!fs.existsSync(prevMetaFile)) continue;
            const prevMeta = JSON.parse(fs.readFileSync(prevMetaFile, 'utf8'));
            const prevRel = path.relative(repoRoot, prevPath).split(path.sep).join('/');
            const prevAudit = prevMeta.audit_hashes || {};
            const sourcePath = sourceAssetPath(prevMeta) || `${prevRel}/source.pdf`;
            entries.push({
              kind: 'previous',
              standard,
              program,
              code,
              version: normalizeVersion(prevVer).slice(1).replace(/-/g, '.'),
              path: prevRel,
              status: prevMeta.status || 'superseded',
              effective_from: prevMeta.effective_from || null,
              effective_to: prevMeta.effective_to || null,
              source_pdf: {
                path: sourcePath,
                sha256: prevAudit.source_pdf_sha256 || null,
              },
              tools: prevMeta.tools || [],
            });
          }
        }
      }
    }
  }
}

// mark latest per (standard, program, code)
const activeEntries = entries.filter(e => e.kind !== 'previous');
const groups = new Map();
for (const e of activeEntries) {
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
