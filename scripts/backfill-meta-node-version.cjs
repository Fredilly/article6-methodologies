#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ROOTS = [
  path.join(REPO_ROOT, 'methodologies', 'UNFCCC', 'Agriculture'),
  path.join(REPO_ROOT, 'methodologies', 'UNFCCC', 'Forestry')
];

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(
    [
      'Usage:',
      '  node scripts/backfill-meta-node-version.cjs',
      '  node scripts/backfill-meta-node-version.cjs --roots <dir,dir>',
      '  node scripts/backfill-meta-node-version.cjs --files <file...>',
      '',
      'Notes:',
      '  - Only operates on META.json under:',
      '      - methodologies/UNFCCC/Agriculture/**/META.json',
      '      - methodologies/UNFCCC/Forestry/**/META.json',
      '  - Sets automation.node_version to process.version.',
      '  - Writes deterministic JSON (Agriculture: deep-sorted keys; Forestry: pipeline key order).'
    ].join('\n') + '\n'
  );
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeysDeep(value[key]);
    }
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value), null, 2) + '\n';
}

function canonicalizeAutomation(existingAutomation, nodeVersion) {
  const automation = isObject(existingAutomation) ? existingAutomation : {};
  const out = {};

  if (Object.prototype.hasOwnProperty.call(automation, 'scripts_manifest_sha256')) {
    out.scripts_manifest_sha256 = automation.scripts_manifest_sha256;
  }
  if (Object.prototype.hasOwnProperty.call(automation, 'repo_commit')) {
    out.repo_commit = automation.repo_commit;
  }

  out.node_version = nodeVersion;

  for (const key of Object.keys(automation)) {
    if (key === 'scripts_manifest_sha256' || key === 'repo_commit' || key === 'node_version') continue;
    out[key] = automation[key];
  }

  return out;
}

function canonicalizeMeta(existingMeta, nodeVersion) {
  const rewrittenKeys = new Set(['audit_hashes', 'automation', 'provenance', 'references', 'audit']);
  const out = {};

  if (Object.prototype.hasOwnProperty.call(existingMeta, 'audit_hashes')) {
    out.audit_hashes = existingMeta.audit_hashes;
  }
  if (Object.prototype.hasOwnProperty.call(existingMeta, 'automation')) {
    out.automation = canonicalizeAutomation(existingMeta.automation, nodeVersion);
  } else {
    out.automation = canonicalizeAutomation({}, nodeVersion);
  }
  if (Object.prototype.hasOwnProperty.call(existingMeta, 'provenance')) {
    out.provenance = existingMeta.provenance;
  }
  if (Object.prototype.hasOwnProperty.call(existingMeta, 'references')) {
    out.references = existingMeta.references;
  }
  if (Object.prototype.hasOwnProperty.call(existingMeta, 'audit')) {
    out.audit = existingMeta.audit;
  }

  for (const key of Object.keys(existingMeta)) {
    if (rewrittenKeys.has(key)) continue;
    out[key] = existingMeta[key];
  }

  return out;
}

function emitMeta({ existingMeta, nodeVersion, mode }) {
  if (mode === 'deep-sorted') {
    const next = JSON.parse(JSON.stringify(existingMeta));
    if (!isObject(next.automation)) next.automation = {};
    next.automation.node_version = nodeVersion;
    return stableStringify(next);
  }
  if (mode === 'pipeline-ordered') {
    const next = canonicalizeMeta(existingMeta, nodeVersion);
    return JSON.stringify(next, null, 2) + '\n';
  }
  throw new Error(`[backfill] unknown emit mode: ${mode}`);
}

function parseArgs(argv) {
  const out = { roots: null, files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--roots') {
      const raw = argv[i + 1] || '';
      out.roots = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((p) => path.resolve(p));
      i += 1;
    } else if (arg === '--files') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        out.files.push(path.resolve(argv[i + 1]));
        i += 1;
      }
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      usage(`Unknown arg: ${arg}`);
      process.exit(2);
    }
  }
  return out;
}

function isScopedMetaFile(absPath) {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.endsWith('/META.json')) return false;
  return (
    rel.startsWith('methodologies/UNFCCC/Agriculture/') ||
    rel.startsWith('methodologies/UNFCCC/Forestry/')
  );
}

function collectMetaFiles(dirPath) {
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMetaFiles(full));
    } else if (entry.isFile() && entry.name === 'META.json') {
      results.push(full);
    }
  }
  return results;
}

function readJsonOrThrow(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch (err) {
    const rel = path.relative(REPO_ROOT, filePath);
    throw new Error(`[backfill] invalid JSON: ${rel}: ${err.message}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  let metaFiles = [];
  if (args.files.length) {
    metaFiles = args.files.slice();
  } else {
    const roots = args.roots?.length ? args.roots : DEFAULT_ROOTS;
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      metaFiles.push(...collectMetaFiles(root));
    }
  }

  metaFiles = Array.from(new Set(metaFiles)).sort();
  if (metaFiles.length === 0) {
    console.log('[backfill] no META.json files found (scoped)');
    return;
  }

  for (const filePath of metaFiles) {
    if (!isScopedMetaFile(filePath)) {
      const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
      throw new Error(`[backfill] refusing out-of-scope file: ${rel}`);
    }
  }

  let updated = 0;
  let skipped = 0;
  for (const filePath of metaFiles) {
    const { raw: beforeRaw, parsed } = readJsonOrThrow(filePath);
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const emitMode = rel.startsWith('methodologies/UNFCCC/Agriculture/')
      ? 'deep-sorted'
      : 'pipeline-ordered';

    const afterRaw = emitMeta({ existingMeta: parsed, nodeVersion: process.version, mode: emitMode });
    if (afterRaw === beforeRaw) {
      skipped += 1;
      continue;
    }

    fs.writeFileSync(filePath, afterRaw, 'utf8');
    updated += 1;
    console.log(`[backfill] updated ${path.relative(REPO_ROOT, filePath)}`);
  }

  console.log(`[backfill] done (${updated} updated, ${skipped} unchanged)`);
}

main();
