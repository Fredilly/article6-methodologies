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

function main() {
  run('node', ['scripts/build-manifest.mjs']);

  const manifest = readJson('manifest/index.json');
  const gsEntries = manifest.filter(entry => entry.methodology === 'GS-00XX');

  assert.ok(gsEntries.length > 0, 'manifest/index.json should include GS-00XX entries');
  assert.ok(
    gsEntries.every(entry => entry.provider === 'GoldStandard'),
    'GS manifest entries should preserve GoldStandard provider',
  );
  assert.ok(
    gsEntries.every(entry => entry.category === 'LUF'),
    'GS manifest entries should preserve LUF category',
  );
  assert.ok(
    gsEntries.every(entry => typeof entry.rule === 'string' && entry.rule.length > 0),
    'GS manifest entries should include non-empty rule text',
  );
  assert.ok(
    gsEntries.every(entry => {
      if (!Array.isArray(entry.tags) || entry.tags.length === 0) return true;
      for (let i = 1; i < entry.tags.length; i++) {
        if (entry.tags[i - 1].localeCompare(entry.tags[i]) > 0) return false;
      }
      return true;
    }),
    'every manifest entry tags array must be sorted deterministically',
  );

  if (hasGnuTarSupport()) {
    run('bash', ['scripts/pack-methodologies.sh']);

    const sha12 = run('git', ['rev-parse', '--short=12', 'HEAD']);
    const archivePath = path.join('artifacts', `methodologies-pack-${sha12}.tar.gz`);
    assert.ok(fs.existsSync(path.join(repoRoot, archivePath)), `missing pack archive ${archivePath}`);

    const archiveListing = run('tar', ['-tf', archivePath]).split('\n');
    const expectedPaths = [
      'methodologies-pack/methodologies/GoldStandard/LUF/GS-00XX/v1-0/META.json',
      'methodologies-pack/methodologies/GoldStandard/LUF/GS-00XX/v1-0/rules.json',
      'methodologies-pack/methodologies/GoldStandard/LUF/GS-00XX/v1-0/sections.json',
      'methodologies-pack/methodologies/GoldStandard/_export/export-metadata.json',
      'methodologies-pack/manifest/index.json',
    ];
    for (const expectedPath of expectedPaths) {
      assert.ok(archiveListing.includes(expectedPath), `pack archive missing ${expectedPath}`);
    }

    const packedManifest = JSON.parse(
      run('tar', ['-xOf', archivePath, 'methodologies-pack/manifest/index.json']),
    );
    const packedGsEntries = packedManifest.filter(entry => entry.methodology === 'GS-00XX');
    assert.ok(packedGsEntries.length > 0, 'packed manifest should include GS-00XX entries');
  } else {
    console.warn('skipping pack archive assertion locally because GNU tar is unavailable');
  }

  console.log('ok');
}

main();
