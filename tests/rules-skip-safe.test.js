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

function writePdfHeaderOnly(filePath) {
  // Minimal valid PDF (kept tiny so `pdf-preflight` considers it usable).
  const content = ['BT', '/F1 12 Tf', '14 TL', '72 720 Td', '(Hello) Tj', 'ET'].join('\n') + '\n';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  const pad10 = (n) => String(n).padStart(10, '0');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${pad10(offsets[i])} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  fs.writeFileSync(filePath, pdf, 'utf8');
}

function validRulesRichPayload() {
  return [
    {
      id: 'UNFCCC.Agriculture.AM0073.v00-0.R-0001-0001',
      type: 'eligibility',
      summary: 'Example rule.',
      logic: 'Example rule.',
      refs: { sections: ['S-0001'] },
    },
  ];
}

function sectionsWithNoClassifiableSentences() {
  return {
    sections: [
      { id: 'S-0001', title: 'A', anchor: 'a', content: 'This text has nothing relevant.' },
      { id: 'S-0002', title: 'B', anchor: 'b', content: 'More plain text without keywords.' },
      { id: 'S-0003', title: 'C', anchor: 'c', content: 'Nonsense.' },
      { id: 'S-0004', title: 'D', anchor: 'd', content: 'Still nothing.' },
      { id: 'S-0005', title: 'E', anchor: 'e', content: 'End.' },
    ],
  };
}

function main() {
  const tmpMethodDir = path.join(repoRoot, 'methodologies', 'TEST', 'Program', 'AM0073', 'v00-0');
  const toolsDir = path.join(repoRoot, 'tools', 'TEST', 'Program', 'AM0073', 'v00-0');
  const tmpPdf = path.join(toolsDir, 'source.pdf');
  const sectionsPath = path.join(tmpMethodDir, 'sections.json');
  const rulesRichPath = path.join(tmpMethodDir, 'rules.rich.json');

  rmrf(tmpMethodDir);
  rmrf(toolsDir);
  fs.mkdirSync(tmpMethodDir, { recursive: true });
  fs.mkdirSync(toolsDir, { recursive: true });
  writeJson(sectionsPath, sectionsWithNoClassifiableSentences());

  // Case 1: unusable PDF + existing good rules.rich.json => exit 0 and do not modify rules.rich.json.
  writeLfsPointerPdf(tmpPdf);
  writeJson(rulesRichPath, validRulesRichPayload());
  const beforeHash1 = sha256File(rulesRichPath);
  const result1 = runRulesRich(tmpMethodDir);
  assert.strictEqual(result1.status, 0, `expected status 0, got ${result1.status}\n${result1.stderr}`);
  assert.ok(
    (result1.stdout || '').includes('[rules-rich] source.pdf unusable; keeping existing rules.rich.json (skip-safe)'),
    `expected skip-safe log, got:\n${result1.stdout}\n${result1.stderr}`,
  );
  const afterHash1 = sha256File(rulesRichPath);
  assert.strictEqual(afterHash1, beforeHash1, 'rules.rich.json was modified');

  // Case 2: usable PDF + generated 0 rules + existing good rules.rich.json => exit 0 and do not modify rules.rich.json.
  writePdfHeaderOnly(tmpPdf);
  const beforeHash2 = sha256File(rulesRichPath);
  const result2 = runRulesRich(tmpMethodDir);
  assert.strictEqual(result2.status, 0, `expected status 0, got ${result2.status}\n${result2.stderr}`);
  assert.ok(
    (result2.stdout || '').includes('[rules-rich] generated 0 rules; keeping existing rules.rich.json (skip-safe)'),
    `expected skip-safe log, got:\n${result2.stdout}\n${result2.stderr}`,
  );
  const afterHash2 = sha256File(rulesRichPath);
  assert.strictEqual(afterHash2, beforeHash2, 'rules.rich.json was modified');

  // Case 3: unusable PDF + missing rules.rich.json => exit 2 with actionable error.
  writeLfsPointerPdf(tmpPdf);
  fs.unlinkSync(rulesRichPath);
  const result3 = runRulesRich(tmpMethodDir);
  assert.strictEqual(result3.status, 2, `expected status 2, got ${result3.status}\n${result3.stderr}`);
  assert.ok(
    `${result3.stdout}\n${result3.stderr}`.includes('no valid rules.rich.json to keep'),
    `expected actionable error, got:\n${result3.stdout}\n${result3.stderr}`,
  );

  rmrf(tmpMethodDir);
  rmrf(toolsDir);
  console.log('ok');
}

main();
