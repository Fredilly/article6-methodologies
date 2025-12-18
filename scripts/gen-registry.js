#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const repoRoot = path.join(__dirname, '..');
const baseDir = path.join(repoRoot, 'methodologies');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[name] = 'true';
      continue;
    }
    out[name] = next;
    i += 1;
  }
  return out;
}

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

function registryKey(entry) {
  return `${entry.standard}||${entry.program}||${entry.code}`;
}

function entryComparator(a, b) {
  return (
    a.standard.localeCompare(b.standard) ||
    a.program.localeCompare(b.program) ||
    a.code.localeCompare(b.code) ||
    versionCompare(a.version, b.version)
  );
}

function buildEntriesForMethod({ standard, program, code }) {
  const entries = [];
  const codeDir = path.join(baseDir, standard, program, code);
  if (!fs.existsSync(codeDir) || !fs.statSync(codeDir).isDirectory()) {
    throw new Error(`[registry] missing method dir: ${path.relative(repoRoot, codeDir)}`);
  }
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
        tools: (Array.isArray(meta.references?.tools) && meta.references.tools.length
          ? meta.references.tools
          : meta.tools || []),
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
          tools: (Array.isArray(prevMeta.references?.tools) && prevMeta.references.tools.length
            ? prevMeta.references.tools
            : prevMeta.tools || []),
        });
      }
    }
  }

  const activeEntries = entries.filter((e) => e.kind !== 'previous');
  activeEntries.sort((a, b) => versionCompare(a.version, b.version));
  activeEntries.forEach((x) => (x.latest = false));
  if (activeEntries.length) activeEntries[activeEntries.length - 1].latest = true;
  entries.sort(entryComparator);
  return entries;
}

function buildAllEntries() {
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
        entries.push(...buildEntriesForMethod({ standard, program, code }));
      }
    }
  }
  return entries;
}

function parseScopedMethodKeysFromIngestYml(ingestYmlPath) {
  const out = execFileSync(
    process.execPath,
    [path.join(__dirname, 'ingest-scope-paths.mjs'), '--ingest-yml', ingestYmlPath, '--kind', 'methodologies-dirs'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const keys = new Set();
  for (const methodDir of out) {
    const parts = methodDir.split('/').filter(Boolean);
    if (parts.length < 4 || parts[0] !== 'methodologies') continue;
    const [_, standard, program, code] = parts;
    keys.add(`${standard}||${program}||${code}`);
  }
  return keys;
}

async function parseScopedMethodKeysFromScopeFile(scopeFilePath) {
  const absolute = path.resolve(repoRoot, scopeFilePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`[registry] scope file not found: ${scopeFilePath}`);
  }
  const ext = path.extname(absolute).toLowerCase();
  if (ext === '.yml' || ext === '.yaml') {
    return parseScopedMethodKeysFromIngestYml(scopeFilePath);
  }
  if (ext === '.json') {
    const doc = safeReadJson(absolute);
    const methods = Array.isArray(doc) ? doc : doc?.methods;
    if (!Array.isArray(methods)) {
      throw new Error(`[registry] scope-file JSON must be an array or {methods:[...]}: ${scopeFilePath}`);
    }
    const { canonicalPaths } = await import(
      pathToFileURL(path.join(repoRoot, 'scripts', 'resolve-ingest-scope.mjs')).href,
    );
    const keys = new Set();
    for (const entry of methods) {
      const raw = typeof entry === 'string' ? entry : '';
      const id = (typeof entry === 'object' && entry ? entry.id : '') || (raw.includes('@') ? raw.split('@')[0] : raw);
      const version =
        (typeof entry === 'object' && entry ? entry.version : '') ||
        (raw.includes('@') ? raw.split('@').slice(1).join('@') : '');
      if (!id || !version) continue;
      const canonical = canonicalPaths({ id, version });
      keys.add(`${canonical.org}||${canonical.program}||${canonical.code}`);
    }
    return keys;
  }

  const lines = fs
    .readFileSync(absolute, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const { canonicalPaths } = await import(
    pathToFileURL(path.join(repoRoot, 'scripts', 'resolve-ingest-scope.mjs')).href,
  );
  const keys = new Set();
  for (const line of lines) {
    const [idRaw, versionRaw = ''] = line.split('@');
    const id = `${idRaw || ''}`.trim();
    const version = `${versionRaw || ''}`.trim();
    if (!id || !version) continue;
    const canonical = canonicalPaths({ id, version });
    keys.add(`${canonical.org}||${canonical.program}||${canonical.code}`);
  }
  return keys;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ingestYml = args['ingest-yml'] || '';
  const scopeFile = args['scope-file'] || '';
  if (ingestYml && scopeFile) {
    console.error('[registry] provide only one of: --ingest-yml, --scope-file');
    process.exit(2);
  }

  let entries = [];
  const outPath = path.join(repoRoot, 'registry.json');

  if (!ingestYml && !scopeFile) {
    entries = buildAllEntries();
    entries.sort(entryComparator);
    fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n');
    return;
  }

  let scopedKeys = new Set();
  if (ingestYml) scopedKeys = parseScopedMethodKeysFromIngestYml(ingestYml);
  if (scopeFile) scopedKeys = await parseScopedMethodKeysFromScopeFile(scopeFile);
  if (!scopedKeys.size) {
    console.error('[registry] empty scope; refusing to update registry.json');
    process.exit(3);
  }

  let existing = [];
  if (fs.existsSync(outPath)) {
    const parsed = safeReadJson(outPath);
    if (Array.isArray(parsed)) existing = parsed;
  }
  if (!existing.length) {
    entries = buildAllEntries();
    entries.sort(entryComparator);
    fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n');
    return;
  }

  const refreshed = [];
  for (const key of Array.from(scopedKeys).sort()) {
    const [standard, program, code] = key.split('||');
    refreshed.push(...buildEntriesForMethod({ standard, program, code }));
  }

  const kept = existing.filter((e) => !scopedKeys.has(registryKey(e)));
  entries = kept.concat(refreshed);
  entries.sort(entryComparator);
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
