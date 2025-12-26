#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  compareVersionsDesc,
  deterministicGeneratedAt,
  parseArgs,
  readJson,
  writeJson
} from './utils/cli.mjs';
import { discoverPreviousVersions } from './discover-previous-versions.shared.mjs';

function usage() {
  console.error(
    'Usage: node scripts/check-previous-lock-drift.mjs --program UNFCCC --sector Agriculture --lock registry/UNFCCC/Agriculture/previous-versions.lock.json [--discovery source-assets|repo-tree]',
  );
  process.exit(2);
}

function discoverUnfcccForestryFromRepoTree() {
  const baseDir = path.resolve(process.cwd(), 'methodologies/UNFCCC/Forestry');
  if (!fs.existsSync(baseDir)) {
    console.error(`[previous:drift] missing directory: ${path.relative(process.cwd(), baseDir)}`);
    process.exit(2);
  }

  const methods = [];
  const codeEntries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const codeEntry of codeEntries) {
    if (!codeEntry.isDirectory()) continue;
    const code = codeEntry.name;
    const codeDir = path.join(baseDir, code);
    const versionEntries = fs.readdirSync(codeDir, { withFileTypes: true });
    const versionSet = new Set();

    for (const entry of versionEntries) {
      if (!entry.isDirectory()) continue;
      const version = entry.name;
      if (!/^v\d+-\d+$/.test(version)) continue;
      versionSet.add(version);

      const prevDir = path.join(codeDir, version, 'previous');
      if (!fs.existsSync(prevDir) || !fs.statSync(prevDir).isDirectory()) continue;
      const prevEntries = fs.readdirSync(prevDir, { withFileTypes: true });
      for (const prevEntry of prevEntries) {
        if (!prevEntry.isDirectory()) continue;
        const prevVersion = prevEntry.name;
        if (!/^v\d+-\d+$/.test(prevVersion)) continue;
        versionSet.add(prevVersion);
      }
    }

    const versions = Array.from(versionSet).sort(compareVersionsDesc);
    if (versions.length === 0) continue;
    methods.push({ code, versions });
  }

  methods.sort((a, b) => a.code.localeCompare(b.code, 'en', { sensitivity: 'variant' }));
  return methods;
}

function diffMethods({ discovered = [], locked = [] }) {
  const map = (arr) => {
    const out = new Map();
    for (const m of arr) out.set(String(m?.code || ''), Array.isArray(m?.versions) ? m.versions.map(String) : []);
    return out;
  };
  const a = map(discovered);
  const b = map(locked);

  const codes = new Set([...a.keys(), ...b.keys()].filter(Boolean));
  const changes = [];

  for (const code of Array.from(codes).sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'variant' }))) {
    const av = new Set((a.get(code) || []).map((v) => String(v).trim()).filter(Boolean));
    const bv = new Set((b.get(code) || []).map((v) => String(v).trim()).filter(Boolean));
    const added = Array.from(av).filter((v) => !bv.has(v)).sort();
    const removed = Array.from(bv).filter((v) => !av.has(v)).sort();
    if (added.length || removed.length) changes.push({ code, added, removed });
  }
  return changes;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const program = String(args.program || '').trim();
  const sector = String(args.sector || '').trim();
  const lockPath = String(args.lock || '').trim();
  const discovery = String(args.discovery || 'source-assets').trim();
  if (!program || !sector || !lockPath) usage();

  const absLock = path.resolve(process.cwd(), lockPath);
  if (!fs.existsSync(absLock)) {
    console.error(`[previous:drift] lockfile not found: ${lockPath}`);
    process.exit(2);
  }

  let discovered;
  if (discovery === 'repo-tree' && program === 'UNFCCC' && sector === 'Forestry') {
    discovered = {
      generated_at: deterministicGeneratedAt(),
      program,
      sector,
      methods: discoverUnfcccForestryFromRepoTree()
    };
  } else {
    discovered = await discoverPreviousVersions({ program, sector, generated_at: deterministicGeneratedAt() });
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'article6-prev-'));
  const tmpPath = path.join(tmpDir, `${program}.${sector}.previous-versions.json`);
  writeJson(tmpPath, discovered);

  const locked = readJson(absLock);
  const same = JSON.stringify(discovered) === JSON.stringify(locked);
  if (same) {
    console.log('[previous:drift] OK: lockfile matches discovery');
    process.exit(0);
  }

  console.error('[previous:drift] FAIL: lockfile drift detected');
  console.error(`  lock:      ${lockPath}`);
  console.error(`  discovered: ${tmpPath}`);

  const changes = diffMethods({ discovered: discovered.methods, locked: locked.methods });
  if (!changes.length) {
    console.error('  (drift is outside methods[]; compare JSON for details)');
  } else {
    for (const ch of changes) {
      console.error(`  - ${ch.code}`);
      if (ch.added.length) console.error(`    + ${ch.added.join(', ')}`);
      if (ch.removed.length) console.error(`    - ${ch.removed.join(', ')}`);
    }
  }

  console.error('Fix by updating the lockfile:');
  console.error(`  npm run previous:discover:${sector.toLowerCase()}`);
  console.error(`  npm run previous:lock:${sector.toLowerCase()}`);
  process.exit(1);
}

await main();
