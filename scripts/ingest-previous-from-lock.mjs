#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalPaths, parseIngestYaml } from './resolve-ingest-scope.mjs';
import { parseArgs, readJson } from './utils/cli.mjs';

function usage() {
  console.error(
    'Usage: node scripts/ingest-previous-from-lock.mjs --ingest-yml <scoped.yml> --previous-lock <lock.json>',
  );
  process.exit(2);
}

function normalizeProgram(methodId) {
  const parts = String(methodId || '').trim().split('.');
  return parts.length >= 2 ? parts[1] : '';
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`[previous:ingest] missing ${label}: ${filePath}`);
    process.exit(2);
  }
}

function runNode(scriptRel, args) {
  execFileSync(process.execPath, [path.join('scripts', scriptRel), ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ingestYml = String(args['ingest-yml'] || '').trim();
  const lockPath = String(args['previous-lock'] || '').trim();
  if (!ingestYml || !lockPath) usage();

  assertFile(ingestYml, 'ingest yml');
  assertFile(lockPath, 'previous lockfile');

  const ingestDoc = parseIngestYaml(fs.readFileSync(ingestYml, 'utf8'));
  const methods = Array.isArray(ingestDoc?.methods) ? ingestDoc.methods : [];
  if (!methods.length) {
    console.error(`[previous:ingest] no methods found in ${ingestYml}`);
    process.exit(2);
  }

  const lock = readJson(lockPath);
  const lockProgram = String(lock?.program || '').trim();
  const lockSector = String(lock?.sector || '').trim();
  if (lockProgram !== 'UNFCCC' || lockSector !== 'Agriculture') {
    console.error(`[previous:ingest] lockfile mismatch: expected UNFCCC/Agriculture, got ${lockProgram}/${lockSector}`);
    process.exit(2);
  }

  const lockMap = new Map();
  for (const m of Array.isArray(lock?.methods) ? lock.methods : []) {
    const code = String(m?.code || '').trim();
    const versions = Array.isArray(m?.versions) ? m.versions.map((v) => String(v).trim()).filter(Boolean) : [];
    if (!code) continue;
    lockMap.set(code, versions);
  }

  const scope = methods
    .map((m) => ({
      id: String(m?.id || '').trim(),
      version: String(m?.version || '').trim(),
    }))
    .filter((m) => m.id && m.version)
    .filter((m) => String(m.id).toUpperCase().startsWith('UNFCCC.') && normalizeProgram(m.id).toLowerCase() === 'agriculture');

  if (!scope.length) {
    console.log('[previous:ingest] no UNFCCC Agriculture methods in scope; skipping');
    return;
  }

  for (const { id, version: activeVersion } of scope) {
    const canonical = canonicalPaths({ id, version: activeVersion });
    const org = canonical.org;
    const sector = canonical.program;
    const code = canonical.code;
    const methodDir = canonical.methodologiesDir;
    const toolsDir = canonical.toolsDir;

    const versions = lockMap.get(code) || [];
    if (!versions.length) {
      console.warn(`[previous:ingest] no locked previous versions for ${code}; skipping`);
      continue;
    }

    for (const prevVersion of versions) {
      if (prevVersion === activeVersion) continue;

      const prevMethodDir = path.posix.join(methodDir, 'previous', prevVersion);
      const prevToolsDir = path.posix.join(toolsDir, 'previous', prevVersion, 'tools');
      const prevPdfSource = path.posix.join('source-assets', org, sector, code, prevVersion, 'source.pdf');
      const prevPdfDest = path.posix.join(prevToolsDir, 'source.pdf');

      if (!fs.existsSync(prevPdfSource)) {
        console.error(`[previous:ingest] missing previous PDF for ${id} ${prevVersion}: ${prevPdfSource}`);
        process.exit(1);
      }

      fs.mkdirSync(prevMethodDir, { recursive: true });
      fs.mkdirSync(prevToolsDir, { recursive: true });
      fs.copyFileSync(prevPdfSource, prevPdfDest);

      runNode('extract-sections.cjs', [prevMethodDir, prevPdfDest]);
      runNode('derive-rules-rich.cjs', [prevMethodDir]);
      runNode('derive-lean-from-rich.js', ['--include-previous', prevMethodDir]);
      runNode('build-meta.cjs', [prevMethodDir]);
      console.log(`[previous:ingest] wrote ${prevMethodDir}`);
    }
  }
}

main();
