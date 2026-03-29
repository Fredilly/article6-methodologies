#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const tests = [
  'tests/pdf-skip-safe.test.js',
  'tests/rules-skip-safe.test.js',
  'tests/extract-sections-pdfminer.test.js',
  'tests/agri-ams-iii-rules-coverage.test.js',
  'tests/am0073-requirement-coverage-proof.test.js',
  'tests/am0073-richer-rule-detail-proof.test.js',
  'tests/ar-am0014-version-relationships-proof.test.js',
  'tests/ar-ams0007-stable-anchor-linkage-proof.test.js',
  'tests/roadmap-status-sync.test.js',
  'tests/ar-ams0007-tool-module-relationships-proof.test.js',
  'tests/pr-accept-harness.test.js',
];

function main() {
  for (const testFile of tests) {
    const result = spawnSync('node', [testFile], { cwd: repoRoot, encoding: 'utf8' });
    if (result.status !== 0) {
      process.stderr.write(`[tests] FAIL ${testFile}\n`);
      process.stderr.write(`${result.stdout || ''}`);
      process.stderr.write(`${result.stderr || ''}`);
      process.exit(result.status || 1);
    }
    process.stdout.write(`[tests] ok ${path.basename(testFile)}\n`);
  }
}

main();
