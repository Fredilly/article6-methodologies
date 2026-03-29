#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'check-roadmap-status-sync.js');
const phaseStatusPath = path.join('docs', 'roadmaps', 'requirement-coverage-support', 'phase-status.json');
const implementationPath = path.join('schemas', 'rules.rich.schema.json');
const executionImplementationPath = path.join('scripts', 'ingest-scoped.sh');

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'article6-roadmap-sync-'));
  const init = run('git', ['init', '-q', '-b', 'main'], tmpDir);
  assert.strictEqual(init.status, 0, init.stderr);
  run('git', ['config', 'user.name', 'Test User'], tmpDir);
  run('git', ['config', 'user.email', 'test@example.com'], tmpDir);

  writeJson(path.join(tmpDir, phaseStatusPath), {
    roadmap: 'requirement-coverage-support',
    goal: 'test',
    last_updated_at: '2026-03-28T00:00:00Z',
    phases: [
      { id: 'rc-s1-rich-schema-foundation', name: 'Rich schema foundation', status: 'done' },
      { id: 'rc-s2-richer-rule-detail', name: 'Richer rule detail', status: 'planned' },
      { id: 'rc-s3-stable-section-page-anchor-linkage', name: 'Stable section/page/anchor linkage', status: 'planned' },
      { id: 'rc-s4-methodology-tool-module-relationships', name: 'Methodology tool/module relationships', status: 'planned' },
    ],
  });
  writeFile(path.join(tmpDir, implementationPath), '{ "ok": true }\n');
  writeFile(path.join(tmpDir, 'README.md'), 'base\n');

  const add = run('git', ['add', '.'], tmpDir);
  assert.strictEqual(add.status, 0, add.stderr);
  const commit = run('git', ['commit', '-qm', 'base'], tmpDir);
  assert.strictEqual(commit.status, 0, commit.stderr);
  const branch = run('git', ['switch', '-c', 'feature'], tmpDir);
  assert.strictEqual(branch.status, 0, branch.stderr);

  return tmpDir;
}

function runGuard(tmpDir) {
  return run('node', [scriptPath, '--base', 'main'], tmpDir);
}

function commitAll(tmpDir) {
  const add = run('git', ['add', '.'], tmpDir);
  assert.strictEqual(add.status, 0, add.stderr);
  const commit = run('git', ['commit', '-qm', 'change'], tmpDir);
  assert.strictEqual(commit.status, 0, commit.stderr);
}

function testHappyPath() {
  const tmpDir = setupRepo();
  try {
    writeFile(path.join(tmpDir, implementationPath), '{ "ok": "changed" }\n');
    writeJson(path.join(tmpDir, phaseStatusPath), {
      roadmap: 'requirement-coverage-support',
      goal: 'test',
      last_updated_at: '2026-03-29T00:00:00Z',
      phases: [
        { id: 'rc-s1-rich-schema-foundation', name: 'Rich schema foundation', status: 'done' },
        { id: 'rc-s2-richer-rule-detail', name: 'Richer rule detail', status: 'done' },
        { id: 'rc-s3-stable-section-page-anchor-linkage', name: 'Stable section/page/anchor linkage', status: 'planned' },
        { id: 'rc-s4-methodology-tool-module-relationships', name: 'Methodology tool/module relationships', status: 'planned' },
      ],
    });
    commitAll(tmpDir);
    const result = runGuard(tmpDir);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS requirement-coverage roadmap status synced/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testMissingPhaseStatusUpdate() {
  const tmpDir = setupRepo();
  try {
    writeFile(path.join(tmpDir, implementationPath), '{ "ok": "changed" }\n');
    commitAll(tmpDir);
    const result = runGuard(tmpDir);
    assert.notStrictEqual(result.status, 0, 'missing phase-status update should fail');
    assert.match(result.stderr, /FAIL requirement-coverage implementation changed without phase-status update/);
    assert.match(result.stderr, /schemas\/rules\.rich\.schema\.json/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testMissingTimestampUpdate() {
  const tmpDir = setupRepo();
  try {
    writeFile(path.join(tmpDir, implementationPath), '{ "ok": "changed" }\n');
    writeJson(path.join(tmpDir, phaseStatusPath), {
      roadmap: 'requirement-coverage-support',
      goal: 'test',
      last_updated_at: '2026-03-28T00:00:00Z',
      phases: [
        { id: 'rc-s1-rich-schema-foundation', name: 'Rich schema foundation', status: 'done' },
        { id: 'rc-s2-richer-rule-detail', name: 'Richer rule detail', status: 'done' },
        { id: 'rc-s3-stable-section-page-anchor-linkage', name: 'Stable section/page/anchor linkage', status: 'planned' },
        { id: 'rc-s4-methodology-tool-module-relationships', name: 'Methodology tool/module relationships', status: 'planned' },
      ],
    });
    commitAll(tmpDir);
    const result = runGuard(tmpDir);
    assert.notStrictEqual(result.status, 0, 'missing timestamp update should fail');
    assert.match(result.stderr, /FAIL phase-status changed without refreshing last_updated_at/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testNoOpPath() {
  const tmpDir = setupRepo();
  try {
    writeFile(path.join(tmpDir, 'README.md'), 'changed\n');
    commitAll(tmpDir);
    const result = runGuard(tmpDir);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS requirement-coverage roadmap status unchanged/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testRcS7ExecutionPathRequiresStatusSync() {
  const tmpDir = setupRepo();
  try {
    writeFile(path.join(tmpDir, executionImplementationPath), '#!/usr/bin/env bash\necho scoped\n');
    commitAll(tmpDir);
    const result = runGuard(tmpDir);
    assert.notStrictEqual(result.status, 0, 'rc-s7 execution path should trigger the roadmap sync guard');
    assert.match(result.stderr, /FAIL requirement-coverage implementation changed without phase-status update/);
    assert.match(result.stderr, /scripts\/ingest-scoped\.sh/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  testHappyPath();
  testMissingPhaseStatusUpdate();
  testMissingTimestampUpdate();
  testNoOpPath();
  testRcS7ExecutionPathRequiresStatusSync();
  console.log('ok');
}

main();
