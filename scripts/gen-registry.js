#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const baseDir = path.join(repoRoot, 'methodologies');

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(
      `[registry] failed to read ${path.relative(repoRoot, filePath)}: ${err.message}`,
    );
    return null;
  }
}

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

function normalizePosix(value) {
  return (value || '').replace(/\\/g, '/');
}

function deriveSourcePath(meta, relPath) {
  const provenanceSource = (meta?.provenance?.source_pdfs || []).find((entry) => entry?.path);
  if (provenanceSource?.path) {
    return normalizePosix(provenanceSource.path);
  }
  const fromMeta = sourceAssetPath(meta);
  if (fromMeta) return normalizePosix(fromMeta);
  if (relPath) {
    const segments = normalizePosix(relPath).split('/');
    if (segments.length >= 5 && segments[0] === 'methodologies') {
      const [, publisher, program, code, versionDir] = segments;
      return ['source-assets', publisher, program, code, versionDir, 'source.pdf']
        .filter(Boolean)
        .join('/');
    }
    return `${normalizePosix(relPath)}/source.pdf`;
  }
  return null;
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
        const meta = safeReadJson(metaFile);
        if (!meta) continue;
        const version = vDir.slice(1).replace(/-/g, '.');
        const relPath = path.relative(repoRoot, fullPath).split(path.sep).join('/');
        const audit = meta.audit_hashes || {};
        if (relPath.includes('/previous/')) {
          const sourcePath = deriveSourcePath(meta, relPath);
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
        const sourcePath = deriveSourcePath(meta, relPath);
        entries.push({
          kind: 'active',
          standard,
          program,
          code,
          version,
          path: relPath,
          stage,
          latest: false,
          source_pdf: {
            path: sourcePath,
            sha256: audit.source_pdf_sha256 || null,
          },
        });

        const previousDir = path.join(fullPath, 'previous');
        if (fs.existsSync(previousDir) && fs.statSync(previousDir).isDirectory()) {
          const prevEntries = fs.readdirSync(previousDir).sort();
          for (const prevVer of prevEntries) {
            const prevPath = path.join(previousDir, prevVer);
            if (!fs.statSync(prevPath).isDirectory()) continue;
            const prevMetaFile = path.join(prevPath, 'META.json');
            if (!fs.existsSync(prevMetaFile)) continue;
            const prevMeta = safeReadJson(prevMetaFile);
            if (!prevMeta) continue;
            const prevRel = path.relative(repoRoot, prevPath).split(path.sep).join('/');
            const prevAudit = prevMeta.audit_hashes || {};
            const sourcePath = deriveSourcePath(prevMeta, prevRel);
            entries.push({
              kind: 'previous',
              standard,
              program,
              code,
              version: prevVer.slice(1).replace(/-/g, '.'),
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
