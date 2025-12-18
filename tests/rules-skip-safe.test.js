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

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function runRulesRich(methodDir) {
  return spawnSync('node', ['scripts/derive-rules-rich.cjs', methodDir], {
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

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function validRulesRichPayload() {
  return [
    {
      id: 'UNFCCC.Agriculture.AM0073.v00-0.R-0001-0001',
      type: 'monitoring',
      summary: 'A rule summary.',
      logic: 'A rule sentence.',
      refs: { sections: ['S-0001'] },
    },
  ];
}

function main() {
  const tmpMethodDir = path.join(repoRoot, 'methodologies', 'TEST', 'Program', 'AM0073', 'v00-0');
  const pdfPath = path.join(repoRoot, 'tools', 'TEST', 'Program', 'AM0073', 'v00-0', 'source.pdf');
  const rulesPath = path.join(tmpMethodDir, 'rules.rich.json');

  rmrf(tmpMethodDir);
  rmrf(path.dirname(pdfPath));
  fs.mkdirSync(tmpMethodDir, { recursive: true });
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  writeLfsPointerPdf(pdfPath);

  // Case A: placeholder PDF + existing valid rules.rich.json => exit 0 and do not modify rules.rich.json.
  writeJson(rulesPath, validRulesRichPayload());
  const beforeHash = sha256File(rulesPath);
  const result1 = runRulesRich(tmpMethodDir);
  assert.strictEqual(result1.status, 0, `expected status 0, got ${result1.status}\n${result1.stderr}`);
  assert.ok(
    (result1.stdout || '').includes('[rules-rich] source.pdf unusable; keeping existing rules.rich.json (skip-safe)'),
    `expected skip-safe log, got:\n${result1.stdout}\n${result1.stderr}`,
  );
  const afterHash = sha256File(rulesPath);
  assert.strictEqual(afterHash, beforeHash, 'rules.rich.json was modified');

  // Case B: placeholder PDF + missing rules.rich.json => non-zero and actionable error.
  fs.unlinkSync(rulesPath);
  const result2 = runRulesRich(tmpMethodDir);
  assert.notStrictEqual(result2.status, 0, 'expected non-zero exit when rules.rich.json missing');
  assert.ok(
    `${result2.stdout}\n${result2.stderr}`.includes('no valid rules.rich.json to keep'),
    `expected actionable error, got:\n${result2.stdout}\n${result2.stderr}`,
  );

  rmrf(tmpMethodDir);
  rmrf(path.dirname(pdfPath));
  console.log('ok');
}

main();

