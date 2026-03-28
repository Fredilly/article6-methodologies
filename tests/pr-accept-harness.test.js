#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const harnessPath = path.join(repoRoot, 'scripts', 'pr-accept.js');

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8' });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function setupRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'article6-pr-accept-'));
  run('git', ['init', '-q'], tmpDir);
  run('git', ['config', 'user.name', 'Test User'], tmpDir);
  run('git', ['config', 'user.email', 'test@example.com'], tmpDir);
  writeFile(path.join(tmpDir, '.gitignore'), '');
  return tmpDir;
}

function commitAll(tmpDir) {
  const add = run('git', ['add', '.'], tmpDir);
  assert.strictEqual(add.status, 0, add.stderr);
  const commit = run('git', ['commit', '-qm', 'test'], tmpDir);
  assert.strictEqual(commit.status, 0, commit.stderr);
}

function runHarness(tmpDir, profileName, extraArgs = []) {
  return run('node', [harnessPath, profileName, ...extraArgs], tmpDir);
}

function testMissingProfile() {
  const tmpDir = setupRepo();
  try {
    commitAll(tmpDir);
    const result = runHarness(tmpDir, 'missing-profile');
    assert.notStrictEqual(result.status, 0, 'missing profile should fail');
    assert.match(result.stderr, /FAIL missing profile missing-profile/);
    assert.match(result.stderr, /config\/pr-accept\/missing-profile\.json/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testHappyPath() {
  const tmpDir = setupRepo();
  try {
    writeFile(path.join(tmpDir, 'stable.txt'), 'stable\n');
    writeFile(path.join(tmpDir, 'unchanged.txt'), 'unchanged\n');
    writeJson(path.join(tmpDir, 'config', 'pr-accept', 'happy.json'), {
      name: 'happy',
      proof_tests: ['node -e "process.exit(0)"'],
      validators: ['node -e "process.exit(0)"'],
      rerun_commands: ['node -e "require(\'node:fs\').writeFileSync(\'stable.txt\', \'stable\\\\n\')"'],
      must_be_zero_diff_after_rerun: ['stable.txt'],
      must_not_change: ['unchanged.txt'],
    });
    commitAll(tmpDir);

    const result = runHarness(tmpDir, 'happy');
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS happy proofs=1 validators=1 reruns=1 checked=2/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testCommandFailurePropagation() {
  const tmpDir = setupRepo();
  try {
    writeJson(path.join(tmpDir, 'config', 'pr-accept', 'command-fail.json'), {
      name: 'command-fail',
      proof_tests: ['node -e "process.stderr.write(\'boom\\\\n\'); process.exit(7)"'],
      validators: [],
      rerun_commands: [],
      must_be_zero_diff_after_rerun: [],
      must_not_change: [],
    });
    commitAll(tmpDir);

    const result = runHarness(tmpDir, 'command-fail');
    assert.strictEqual(result.status, 7, result.stderr);
    assert.match(result.stderr, /FAIL proof_tests command failed/);
    assert.match(result.stderr, /phase: proof_tests\[1\]/);
    assert.match(result.stderr, /boom/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testRerunDiffDetection() {
  const tmpDir = setupRepo();
  try {
    writeFile(path.join(tmpDir, 'rerun-target.txt'), 'before\n');
    writeJson(path.join(tmpDir, 'config', 'pr-accept', 'rerun-diff.json'), {
      name: 'rerun-diff',
      proof_tests: [],
      validators: [],
      rerun_commands: ['node -e "require(\'node:fs\').writeFileSync(\'rerun-target.txt\', \'after\\\\n\')"'],
      must_be_zero_diff_after_rerun: ['rerun-target.txt'],
      must_not_change: [],
    });
    commitAll(tmpDir);

    const result = runHarness(tmpDir, 'rerun-diff');
    assert.notStrictEqual(result.status, 0, 'rerun drift should fail');
    assert.match(result.stderr, /FAIL rerun-diff rerun drift/);
    assert.match(result.stderr, /rerun-target\.txt/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testMustNotChangeDetection() {
  const tmpDir = setupRepo();
  try {
    writeFile(path.join(tmpDir, 'protected.txt'), 'before\n');
    writeJson(path.join(tmpDir, 'config', 'pr-accept', 'must-not-change.json'), {
      name: 'must-not-change',
      proof_tests: [],
      validators: [],
      rerun_commands: ['node -e "require(\'node:fs\').writeFileSync(\'protected.txt\', \'after\\\\n\')"'],
      must_be_zero_diff_after_rerun: [],
      must_not_change: ['protected.txt'],
    });
    commitAll(tmpDir);

    const result = runHarness(tmpDir, 'must-not-change');
    assert.notStrictEqual(result.status, 0, 'protected path drift should fail');
    assert.match(result.stderr, /FAIL must-not-change protected-path drift/);
    assert.match(result.stderr, /protected\.txt/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  testMissingProfile();
  testHappyPath();
  testCommandFailurePropagation();
  testRerunDiffDetection();
  testMustNotChangeDetection();
  console.log('ok');
}

main();
