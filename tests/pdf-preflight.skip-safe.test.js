#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function runExtractor(methodDir, pdfPath) {
  return spawnSync('node', ['scripts/extract-sections.cjs', methodDir, pdfPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function writeLfsPointerPdf(filePath) {
  fs.writeFileSync(
    filePath,
    [
      'version https://git-lfs.github.com/spec/v1',
      'oid sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'size 12345',
      '',
    ].join('\n'),
    'utf8',
  );
}

function validSectionsPayload() {
  return {
    sections: [
      { id: 'S-0001', title: 'A', anchor: 'a', content: 'a' },
      { id: 'S-0002', title: 'B', anchor: 'b', content: 'b' },
      { id: 'S-0003', title: 'C', anchor: 'c', content: 'c' },
      { id: 'S-0004', title: 'D', anchor: 'd', content: 'd' },
      { id: 'S-0005', title: 'E', anchor: 'e', content: 'e' },
    ],
  };
}

function main() {
  const tmpMethodDir = path.join(repoRoot, 'methodologies', 'TEST', 'Program', 'AM0073', 'v00-0');
  const tmpPdf = path.join(tmpMethodDir, 'source.pdf');
  const sectionsPath = path.join(tmpMethodDir, 'sections.json');

  rmrf(tmpMethodDir);
  fs.mkdirSync(tmpMethodDir, { recursive: true });
  writeLfsPointerPdf(tmpPdf);

  // Case 1: placeholder PDF + existing good sections.json => exit 0 and do not modify sections.json.
  writeJson(sectionsPath, validSectionsPayload());
  const beforeHash = sha256File(sectionsPath);
  const result1 = runExtractor(tmpMethodDir, tmpPdf);
  assert.strictEqual(result1.status, 0, `expected status 0, got ${result1.status}\n${result1.stderr}`);
  assert.ok(
    (result1.stdout || '').includes('leaving existing sections.json intact'),
    `expected skip-safe log, got:\n${result1.stdout}\n${result1.stderr}`,
  );
  const afterHash = sha256File(sectionsPath);
  assert.strictEqual(afterHash, beforeHash, 'sections.json was modified');

  // Case 2: placeholder PDF + missing sections.json => non-zero and actionable error.
  fs.unlinkSync(sectionsPath);
  const result2 = runExtractor(tmpMethodDir, tmpPdf);
  assert.notStrictEqual(result2.status, 0, 'expected non-zero exit when sections.json missing');
  assert.ok(
    `${result2.stdout}\n${result2.stderr}`.includes('cannot generate sections.json'),
    `expected actionable error, got:\n${result2.stdout}\n${result2.stderr}`,
  );

  rmrf(tmpMethodDir);
  console.log('ok');
}

main();
