#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const { fileDigest, makeToolEntry } = require('../scripts/rewrite-forestry.js');

function readHeadFile(relPath) {
  return execFileSync('git', ['show', `HEAD:${relPath}`], { cwd: repoRoot });
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewrite-forestry-lfs-'));
  const methodDir = path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-ACM0003', 'v02-0');
  const trackedFiles = new Map([
    ['META.json', readHeadFile('methodologies/UNFCCC/Forestry/AR-ACM0003/v02-0/META.json')],
    ['rules.rich.json', readHeadFile('methodologies/UNFCCC/Forestry/AR-ACM0003/v02-0/rules.rich.json')],
    ['rules.json', readHeadFile('methodologies/UNFCCC/Forestry/AR-ACM0003/v02-0/rules.json')],
    ['sections.json', readHeadFile('methodologies/UNFCCC/Forestry/AR-ACM0003/v02-0/sections.json')],
  ]);
  try {
    const lfsOid = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const lfsSize = 987654;
    const pointerPath = path.join(tempDir, 'pointer.pdf');
    fs.writeFileSync(
      pointerPath,
      `version https://git-lfs.github.com/spec/v1\noid sha256:${lfsOid}\nsize ${lfsSize}\n`,
      'utf8',
    );

    assert.deepStrictEqual(
      fileDigest(pointerPath),
      { sha256: lfsOid, size: lfsSize },
      'fileDigest should preserve Git LFS pointer oid/size instead of hashing the pointer payload',
    );

    const realToolRelPath = 'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-02-v01.pdf';
    const realToolAbsPath = path.join(repoRoot, realToolRelPath);
    const realBytes = fs.readFileSync(realToolAbsPath);
    const realEntry = makeToolEntry(realToolRelPath);

    assert.equal(realEntry.path, realToolRelPath);
    assert.equal(realEntry.size, realBytes.length, 'real tool entry should retain the on-disk PDF size');
    assert.equal(realEntry.sha256, sha256Buffer(realBytes), 'real tool entry should retain the on-disk PDF sha256');

    const relMethodDir = path.relative(repoRoot, methodDir);
    execFileSync(process.execPath, ['scripts/rewrite-forestry.js', relMethodDir], { cwd: repoRoot, stdio: 'inherit' });
    execFileSync(process.execPath, ['scripts/enrich-methodology-outputs.js', relMethodDir], { cwd: repoRoot, stdio: 'inherit' });
    execFileSync(process.execPath, ['scripts/derive-lean-from-rich.js', relMethodDir], { cwd: repoRoot, stdio: 'inherit' });
    execFileSync(process.execPath, ['scripts/rewrite-forestry.js', relMethodDir], { cwd: repoRoot, stdio: 'inherit' });

    const meta = JSON.parse(fs.readFileSync(path.join(methodDir, 'META.json'), 'utf8'));
    for (const tool of meta.references.tools || []) {
      const absolutePath = path.join(repoRoot, tool.path);
      const digest = fileDigest(absolutePath);
      assert.equal(tool.sha256, digest.sha256, `${tool.path}: rewritten META sha256 should stay truthful on second run`);
      assert.equal(tool.size, digest.size, `${tool.path}: rewritten META size should stay truthful on second run`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    for (const [name, contents] of trackedFiles) {
      fs.writeFileSync(path.join(methodDir, name), contents);
    }
  }

  console.log('ok');
}

main();
