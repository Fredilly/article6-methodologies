#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const fixturesRoot = path.join(repoRoot, 'tests', 'fixtures', 'agriculture-gold');
const manifestPath = path.join(fixturesRoot, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Agriculture gold manifest missing at ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const diffFailures = [];

function compareDirs(rootDir, relPaths = []) {
  relPaths.forEach((rel) => {
    const fixtureDir = path.join(fixturesRoot, rootDir, rel);
    const targetDir = path.join(repoRoot, rootDir, rel);
    if (!fs.existsSync(fixtureDir)) {
      console.warn(`[agriculture-gold] fixture missing for ${rootDir}/${rel}; skipping diff`);
      return;
    }
    if (!fs.existsSync(targetDir)) {
      diffFailures.push(`${rootDir}/${rel} (missing target)`);
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
}

compareDirs('methodologies', manifest.methodologies || []);
compareDirs('tools', manifest.tools || []);

if (diffFailures.length === 0) {
  console.log('[agriculture-gold] repository output matches Agriculture gold fixtures.');
  process.exit(0);
}

console.error('[agriculture-gold] mismatch detected for:\n - ' + diffFailures.join('\n - '));
process.exit(1);
