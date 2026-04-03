#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const familyDirs = [
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AM0014', 'v01-0-0'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AM0014', 'v02-0-0'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AM0014', 'v03-0'),
];
const unrelatedMetaPaths = [
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

function validateMetaSchema(methodDir) {
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
  const [v01, v02, v03] = familyDirs.map((methodDir) => readJson(path.join(methodDir, 'META.json')));
  const expectedFamilyKey = 'UNFCCC.Forestry.AR-AM0014';
  const expectedLineage = ['v01-0-0', 'v02-0-0', 'v03-0'];

  for (const meta of [v01, v02, v03]) {
    assert.ok(meta.version_relationships, `${meta.provenance.source_pdfs[0].doc}: expected version_relationships`);
    assert.strictEqual(meta.version_relationships.family_key, expectedFamilyKey, 'family_key should stay stable');
    assert.deepStrictEqual(meta.version_relationships.lineage, expectedLineage, 'lineage should stay ordered');
    assert.deepStrictEqual(meta.version_relationships.lineage, meta.relationships.version.lineage, 'lineage should align with existing relationships.version');
    assert.strictEqual(meta.version_relationships.previous_version, meta.relationships.version.previous_version, 'previous_version should align');
    assert.strictEqual(meta.version_relationships.next_version, meta.relationships.version.next_version, 'next_version should align');
  }

  assert.strictEqual(v01.version_relationships.current_version, 'v01-0-0');
  assert.strictEqual(v01.version_relationships.previous_version, null);
  assert.strictEqual(v01.version_relationships.next_version, 'v02-0-0');
  assert.ok(!('previous_pair_key' in v01.version_relationships.diff_hints), 'first version should omit previous_pair_key');
  assert.strictEqual(v01.version_relationships.diff_hints.next_pair_key, 'UNFCCC.Forestry.AR-AM0014:v01-0-0..v02-0-0');

  assert.strictEqual(v02.version_relationships.current_version, 'v02-0-0');
  assert.strictEqual(v02.version_relationships.previous_version, 'v01-0-0');
  assert.strictEqual(v02.version_relationships.next_version, 'v03-0');
  assert.strictEqual(v02.version_relationships.diff_hints.previous_pair_key, 'UNFCCC.Forestry.AR-AM0014:v01-0-0..v02-0-0');
  assert.strictEqual(v02.version_relationships.diff_hints.next_pair_key, 'UNFCCC.Forestry.AR-AM0014:v02-0-0..v03-0');

  assert.strictEqual(v03.version_relationships.current_version, 'v03-0');
  assert.strictEqual(v03.version_relationships.previous_version, 'v02-0-0');
  assert.strictEqual(v03.version_relationships.next_version, null);
  assert.strictEqual(v03.version_relationships.diff_hints.previous_pair_key, 'UNFCCC.Forestry.AR-AM0014:v02-0-0..v03-0');
  assert.ok(!('next_pair_key' in v03.version_relationships.diff_hints), 'last version should omit next_pair_key');
}

function assertNoBleed() {
  for (const metaPath of unrelatedMetaPaths) {
    const meta = readJson(metaPath);
    assert.ok(!('version_relationships' in meta), `${path.relative(repoRoot, metaPath)} unexpectedly gained version_relationships`);
  }
}

function rerunScopedEnrichmentTwice() {
  const args = ['scripts/enrich-methodology-outputs.js', ...familyDirs.map((methodDir) => path.relative(repoRoot, methodDir))];
  for (let index = 0; index < 2; index += 1) {
    const result = run('node', args);
    assert.strictEqual(
      result.status,
      0,
      `scoped family enrichment should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function main() {
  const trackedPaths = [
    ...familyDirs.flatMap((methodDir) => [
      path.join(methodDir, 'META.json'),
      path.join(methodDir, 'rules.json'),
      path.join(methodDir, 'sections.json'),
    ]),
    ...unrelatedMetaPaths,
  ];
  const baselineHashes = new Map(trackedPaths.map((filePath) => [filePath, sha256File(filePath)]));

  for (const methodDir of familyDirs) validateMetaSchema(methodDir);
  assertFamilyContract();
  assertNoBleed();

  rerunScopedEnrichmentTwice();

  for (const methodDir of familyDirs) validateMetaSchema(methodDir);
  assertFamilyContract();
  assertNoBleed();

  for (const [filePath, baselineHash] of baselineHashes.entries()) {
    assert.strictEqual(sha256File(filePath), baselineHash, `${path.relative(repoRoot, filePath)} changed after rerun`);
  }

  console.log('ok');
}

main();
