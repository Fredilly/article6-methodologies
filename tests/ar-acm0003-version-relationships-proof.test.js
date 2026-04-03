#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const methodDir = path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-ACM0003', 'v02-0');
const unrelatedMetaPaths = [
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AMS0007', 'v03-1', 'META.json'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AM0073', 'v01-0', 'META.json'),
];

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function run(command, args) {
  return spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
}

function validateMetaSchema() {
  const metaPath = path.join(methodDir, 'META.json');
  const validation = run('./scripts/run-ajv.sh', [
    'validate',
    '-s',
    'schemas/META.schema.json',
    '-d',
    path.relative(repoRoot, metaPath),
  ]);
  assert.strictEqual(
    validation.status,
    0,
    `META schema validation should pass for ${path.relative(repoRoot, metaPath)}\nstdout:\n${validation.stdout}\nstderr:\n${validation.stderr}`,
  );
}

function assertFamilyContract() {
  const meta = readJson(path.join(methodDir, 'META.json'));
  assert.ok(meta.version_relationships, 'AR-ACM0003 should emit version_relationships');
  assert.strictEqual(meta.version_relationships.family_key, 'UNFCCC.Forestry.AR-ACM0003');
  assert.strictEqual(meta.version_relationships.current_version, 'v02-0');
  assert.strictEqual(meta.version_relationships.previous_version, 'v01-0');
  assert.strictEqual(meta.version_relationships.next_version, null);
  assert.deepStrictEqual(meta.version_relationships.lineage, ['v01-0', 'v02-0']);
  assert.deepStrictEqual(meta.version_relationships.lineage, meta.relationships.version.lineage);
  assert.strictEqual(meta.relationships.version.previous_version, 'v01-0');
  assert.strictEqual(meta.relationships.version.next_version, null);
  assert.strictEqual(
    meta.version_relationships.diff_hints.previous_pair_key,
    'UNFCCC.Forestry.AR-ACM0003:v01-0..v02-0',
  );
  assert.ok(!('next_pair_key' in meta.version_relationships.diff_hints), 'current latest version should omit next_pair_key');
}

function assertNoBleed() {
  for (const metaPath of unrelatedMetaPaths) {
    const meta = readJson(metaPath);
    assert.ok(!('version_relationships' in meta), `${path.relative(repoRoot, metaPath)} unexpectedly gained version_relationships`);
  }
}

function rerunScopedEnrichmentTwice() {
  const args = ['scripts/enrich-methodology-outputs.js', path.relative(repoRoot, methodDir)];
  for (let index = 0; index < 2; index += 1) {
    const result = run(process.execPath, args);
    assert.strictEqual(
      result.status,
      0,
      `scoped AR-ACM0003 enrichment should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function main() {
  const trackedPaths = [
    path.join(methodDir, 'META.json'),
    path.join(methodDir, 'rules.rich.json'),
    path.join(methodDir, 'sections.rich.json'),
    path.join(methodDir, 'rules.json'),
    path.join(methodDir, 'sections.json'),
    ...unrelatedMetaPaths,
  ];
  const baselineHashes = new Map(trackedPaths.map((filePath) => [filePath, sha256File(filePath)]));

  validateMetaSchema();
  assertFamilyContract();
  assertNoBleed();

  rerunScopedEnrichmentTwice();

  validateMetaSchema();
  assertFamilyContract();
  assertNoBleed();

  for (const [filePath, baselineHash] of baselineHashes.entries()) {
    assert.strictEqual(sha256File(filePath), baselineHash, `${path.relative(repoRoot, filePath)} changed after rerun`);
  }

  console.log('ok');
}

main();
