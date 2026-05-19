#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `command failed: ${command} ${args.join(' ')}`,
        result.stdout,
        result.stderr,
      ].filter(Boolean).join('\n'),
    );
  }
  return result.stdout.trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, filePath), 'utf8'));
}

function hasGnuTarSupport() {
  const gtarCheck = spawnSync('gtar', ['--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (gtarCheck.status === 0 && gtarCheck.stdout.includes('--sort')) {
    return true;
  }
  const tarCheck = spawnSync('tar', ['--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return tarCheck.status === 0 && tarCheck.stdout.includes('--sort');
}

function findReviewGradeMethods() {
  const methods = [];
  const standards = fs.readdirSync(path.join(repoRoot, 'methodologies'), { withFileTypes: true });
  for (const standard of standards) {
    if (!standard.isDirectory()) continue;
    const programs = fs.readdirSync(path.join(repoRoot, 'methodologies', standard.name), { withFileTypes: true });
    for (const program of programs) {
      if (!program.isDirectory()) continue;
      const methodCodes = fs.readdirSync(path.join(repoRoot, 'methodologies', standard.name, program.name), { withFileTypes: true });
      for (const methodCode of methodCodes) {
        if (!methodCode.isDirectory()) continue;
        const versions = fs.readdirSync(path.join(repoRoot, 'methodologies', standard.name, program.name, methodCode.name), { withFileTypes: true });
        for (const version of versions) {
          if (!version.isDirectory()) continue;
          const metaPath = path.join(repoRoot, 'methodologies', standard.name, program.name, methodCode.name, version.name, 'META.json');
          if (!fs.existsSync(metaPath)) continue;
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta.artifact_quality_standard?.adoption_status === 'review_grade') {
              methods.push({
                path: path.join(standard.name, program.name, methodCode.name, version.name),
                meta,
              });
            }
          } catch {
            // skip unparseable META
          }
        }
      }
    }
  }
  return methods;
}

function main() {
  // 1. Discover all review_grade methods in source
  const reviewGradeMethods = findReviewGradeMethods();
  assert.ok(reviewGradeMethods.length > 0, 'at least one review_grade method must exist in source');
  for (const method of reviewGradeMethods) {
    const richPath = path.join(repoRoot, 'methodologies', method.path, 'rules.rich.json');
    assert.ok(fs.existsSync(richPath), `${method.path}: rules.rich.json must exist for review_grade method`);
    const rich = readJson(path.join('methodologies', method.path, 'rules.rich.json'));
    const rulesWithEvidence = rich.filter(r => r.requirement_coverage?.expected_evidence?.length > 0);
    assert.ok(rulesWithEvidence.length > 0, `${method.path}: expected_evidence must be present in review_grade rules.rich.json`);
    assert.equal(rulesWithEvidence.length, rich.length, `${method.path}: all rules must have expected_evidence at review_grade`);
  }
  pass(`source validation: ${reviewGradeMethods.length} review_grade method(s) have complete expected evidence`);

  // 2. Verify config/evidence-taxonomy.json is present and loadable
  const taxonomy = readJson('config/evidence-taxonomy.json');
  assert.ok(taxonomy.evidence_types?.length > 0, 'evidence taxonomy must define evidence types');
  pass(`taxonomy loaded: ${taxonomy.evidence_types.length} evidence types`);

  // 3. Pack archive assertions (only on CI with GNU tar)
  if (!hasGnuTarSupport()) {
    console.warn('skipping pack archive assertion locally: GNU tar unavailable');
    console.log('ok');
    return;
  }

  run('bash', ['scripts/pack-methodologies.sh']);

  const sha12 = run('git', ['rev-parse', '--short=12', 'HEAD']);
  const archivePath = path.join('artifacts', `methodologies-pack-${sha12}.tar.gz`);

  assert.ok(fs.existsSync(path.join(repoRoot, archivePath)), `missing pack archive ${archivePath}`);

  const listing = run('tar', ['-tf', archivePath]).split('\n');

  // 5. Verify each review_grade method's critical files are in the pack
  for (const method of reviewGradeMethods) {
    const packPrefix = `methodologies-pack/methodologies/${method.path}`;
    const expectedFiles = [
      `${packPrefix}/META.json`,
      `${packPrefix}/rules.json`,
      `${packPrefix}/rules.rich.json`,
      `${packPrefix}/sections.json`,
      `${packPrefix}/sections.rich.json`,
    ];
    for (const expectedPath of expectedFiles) {
      assert.ok(listing.includes(expectedPath), `pack archive missing ${expectedPath}`);
    }
  }

  // 6. Verify review_grade META.json inside archive has correct adoption_status
  for (const method of reviewGradeMethods) {
    const metaInPack = JSON.parse(
      run('tar', ['-xOf', archivePath, `methodologies-pack/methodologies/${method.path}/META.json`]),
    );
    assert.equal(
      metaInPack.artifact_quality_standard?.adoption_status,
      'review_grade',
      `${method.path}: packed META must retain adoption_status review_grade`,
    );
  }

  // 7. Verify expected_evidence metadata survives inside packed rules.rich.json
  for (const method of reviewGradeMethods) {
    const packedRich = JSON.parse(
      run('tar', ['-xOf', archivePath, `methodologies-pack/methodologies/${method.path}/rules.rich.json`]),
    );
    for (const rule of packedRich) {
      assert.ok(
        rule.requirement_coverage?.expected_evidence?.length > 0,
        `${method.path} ${rule.id}: expected_evidence must survive in packed rules.rich.json`,
      );
    }
  }

  // 8. Verify config/evidence-taxonomy.json is in the pack
  assert.ok(
    listing.includes('methodologies-pack/config/evidence-taxonomy.json'),
    'pack archive must include config/evidence-taxonomy.json',
  );
  const packedTaxonomy = JSON.parse(
    run('tar', ['-xOf', archivePath, 'methodologies-pack/config/evidence-taxonomy.json']),
  );
  assert.deepStrictEqual(
    packedTaxonomy,
    taxonomy,
    'packed evidence-taxonomy.json must match source',
  );

  // 9. Verify PROVENANCE.json + manifest/index.json are present
  assert.ok(listing.includes('methodologies-pack/PROVENANCE.json'), 'pack archive must include PROVENANCE.json');
  assert.ok(listing.includes('methodologies-pack/manifest/index.json'), 'pack archive must include manifest/index.json');

  // 10. Verify _export metadata for review_grade standards
  for (const method of reviewGradeMethods) {
    const standardDir = method.path.split('/')[0];
    const exportPath = `methodologies-pack/methodologies/${standardDir}/_export/export-metadata.json`;
    assert.ok(listing.includes(exportPath), `pack archive missing ${exportPath}`);
  }

  pass(`pack archive verified: ${reviewGradeMethods.length} review_grade method(s) fully present`);
  console.log('ok');
}

function pass(message) {
  console.log(`PASS  ${message}`);
}

main();
