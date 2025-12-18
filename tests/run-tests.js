#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const tests = ['tests/pdf-skip-safe.test.js', 'tests/rules-skip-safe.test.js'];

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

