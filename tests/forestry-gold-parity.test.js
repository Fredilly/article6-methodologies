#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const fixturesRoot = path.join(repoRoot, 'tests', 'fixtures', 'forestry-gold');
const manifestPath = path.join(fixturesRoot, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Forestry gold manifest missing at ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const ingestFile = process.argv[2] || 'ingest.forestry.yml';
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forestry-gold-'));

const copyDir = (src, dest) => {
  fs.cpSync(src, dest, { recursive: true, force: true });
};

const backupPaths = (rootDir, relPaths = []) =>
  relPaths
    .map((rel) => {
      const target = path.join(repoRoot, rootDir, rel);
      if (!fs.existsSync(target)) {
        console.warn(`[forestry-gold] skip backup (missing) ${rootDir}/${rel}`);
        return null;
      }
      const backup = path.join(tmpRoot, rootDir, rel);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      copyDir(target, backup);
      return { target, backup };
    })
    .filter(Boolean);

const restorePaths = (entries = []) => {
  entries.forEach(({ target, backup }) => {
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    copyDir(backup, target);
  });
};

const methodologyBackups = backupPaths('methodologies', manifest.methodologies || []);
const toolBackups = backupPaths('tools', manifest.tools || []);

let restored = false;
const cleanup = () => {
  if (restored) return;
  restorePaths([...toolBackups, ...methodologyBackups]);
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  restored = true;
};

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(1);
});

const run = (cmd, args, opts = {}) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit ${result.status}`);
  }
};

const diffFailures = [];

try {
  run('npm', ['run', 'ingest:full', '--', ingestFile]);

  const compareDirs = (rootDir, relPaths = []) => {
    relPaths.forEach((rel) => {
      const fixtureDir = path.join(fixturesRoot, rootDir, rel);
      const targetDir = path.join(repoRoot, rootDir, rel);
      if (!fs.existsSync(fixtureDir)) {
        console.warn(`[forestry-gold] fixture missing for ${rootDir}/${rel}; skipping diff`);
        return;
      }
      const diff = spawnSync('diff', ['-ruN', fixtureDir, targetDir], {
        stdio: 'inherit',
        cwd: repoRoot,
      });
      if (diff.status !== 0) {
        diffFailures.push(`${rootDir}/${rel}`);
      }
    });
  };

  compareDirs('methodologies', manifest.methodologies || []);
  compareDirs('tools', manifest.tools || []);
} finally {
  cleanup();
}

if (diffFailures.length === 0) {
  console.log('[forestry-gold] ingest output matches Forestry gold fixtures.');
  process.exit(0);
}

console.error('[forestry-gold] mismatch detected for:\n - ' + diffFailures.join('\n - '));
process.exit(1);
