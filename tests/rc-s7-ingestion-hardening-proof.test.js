#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const localToolBin = path.join(repoRoot, 'local-tools', 'bin');
const env = { ...process.env, PATH: `${localToolBin}:${process.env.PATH || ''}` };
const provingMethod = 'methodologies/UNFCCC/Agriculture/AM0073/v01-0';
const trackedPaths = [
  `${provingMethod}/META.json`,
  `${provingMethod}/rules.json`,
  `${provingMethod}/rules.rich.json`,
  `${provingMethod}/sections.json`,
  'methodologies/UNFCCC/Agriculture/ACM0010/v03-0/rules.rich.json',
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    env: options.env || env,
  });
}

function sha256(relPath) {
  const absPath = path.join(repoRoot, relPath);
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function writeTempIngest(methodsYaml) {
  const tmpPath = path.join(os.tmpdir(), `article6-rc-s7-${process.pid}-${Date.now()}.yml`);
  fs.writeFileSync(tmpPath, methodsYaml, 'utf8');
  return tmpPath;
}

function testMissingInputFailsEarly() {
  const missingPath = path.join(os.tmpdir(), `article6-rc-s7-missing-${process.pid}.yml`);
  const result = run('bash', ['scripts/ingest-scoped.sh', missingPath]);
  assert.notStrictEqual(result.status, 0, 'missing ingest file should fail');
  assert.match(result.stderr, /preflight: ingest file not found:/);
}

function testInvalidScopeFailsClearly() {
  const ingestPath = writeTempIngest('version: 2\nmethods: []\n');
  try {
    const result = run('bash', ['scripts/ingest-scoped.sh', ingestPath]);
    assert.notStrictEqual(result.status, 0, 'zero-method ingest should fail');
    assert.match(result.stderr, /\[ingest-yml\] FAIL: zero methods parsed/);
  } finally {
    fs.rmSync(ingestPath, { force: true });
  }
}

function testOutOfScopeDriftIsDetected() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'article6-rc-s7-scope-'));
  try {
    const init = run('git', ['init', '-q', '-b', 'main'], { cwd: tmpDir });
    assert.strictEqual(init.status, 0, init.stderr);
    run('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir });
    run('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'ingest.yml'), 'version: 2\nmethods:\n  - id: UNFCCC.Agriculture.AM0073\n    version: v01-0\n    sector: Agriculture\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'base\n', 'utf8');
    let result = run('git', ['add', '.'], { cwd: tmpDir });
    assert.strictEqual(result.status, 0, result.stderr);
    result = run('git', ['commit', '-qm', 'base'], { cwd: tmpDir });
    assert.strictEqual(result.status, 0, result.stderr);
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'changed\n', 'utf8');
    result = run('node', [path.join(repoRoot, 'scripts', 'check-scope-drift.mjs'), '--ingest-yml', 'ingest.yml'], { cwd: tmpDir });
    assert.notStrictEqual(result.status, 0, 'out-of-scope drift should fail');
    assert.match(result.stderr, /\[scope-drift\] detected out-of-scope changes:/);
    assert.match(result.stderr, /README\.md/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testScopedIdempotentAm0073Run() {
  const ingestPath = writeTempIngest('version: 2\nmethods:\n  - id: UNFCCC.Agriculture.AM0073\n    version: v01-0\n    sector: Agriculture\n');
  const before = new Map(trackedPaths.map((relPath) => [relPath, sha256(relPath)]));
  const baselineStatus = run('git', ['status', '--porcelain=v1']);
  assert.strictEqual(baselineStatus.status, 0, baselineStatus.stderr);
  try {
    const result = run('bash', ['scripts/ingest-scoped.sh', ingestPath], {
      env: {
        ...env,
        SCOPED_INGEST_RUNS: '2',
        SCOPED_INGEST_ENFORCE_IDEMPOTENCY: '1',
      },
    });
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /\[ingest-scoped\] phase=preflight/);
    assert.match(result.stdout, /\[ingest-scoped\] phase=idempotency:compare-run-diffs/);
    const status = run('git', ['status', '--porcelain=v1']);
    assert.strictEqual(status.status, 0, status.stderr);
    assert.strictEqual(status.stdout, baselineStatus.stdout, status.stdout);
    for (const relPath of trackedPaths) {
      assert.strictEqual(sha256(relPath), before.get(relPath), `${relPath} changed after scoped rerun`);
    }
  } finally {
    fs.rmSync(ingestPath, { force: true });
  }
}

function main() {
  testMissingInputFailsEarly();
  testInvalidScopeFailsClearly();
  testOutOfScopeDriftIsDetected();
  testScopedIdempotentAm0073Run();
  console.log('ok');
}

main();
