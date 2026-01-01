#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function writePdf(filePath, buf) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

function pad10(n) {
  return String(n).padStart(10, '0');
}

function buildPdfWithTextLines(lines) {
  const contentLines = [
    'BT',
    '/F1 12 Tf',
    '14 TL',
    '72 720 Td',
    ...lines.flatMap((line, idx) => {
      const escaped = String(line).replace(/([()\\\\])/g, '\\\\$1');
      return idx === 0 ? [`(${escaped}) Tj`] : ['T*', `(${escaped}) Tj`];
    }),
    'ET',
  ];
  const contentStream = `${contentLines.join('\n')}\n`;

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
  );
  objects.push(
    `4 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}endstream\nendobj\n`,
  );
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${pad10(offsets[i])} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

function runExtractSections(methodDir, pdfPath) {
  return spawnSync('node', ['scripts/extract-sections.cjs', methodDir, pdfPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const methodDir = path.join(repoRoot, 'methodologies', 'TEST', 'Program', 'EXTRACT', 'v00-0');
  const pdfPath = path.join(repoRoot, 'tests', 'tmp', 'extract-sections', 'source.pdf');
  const sectionsPath = path.join(methodDir, 'sections.json');

  rmrf(methodDir);
  rmrf(path.dirname(pdfPath));
  fs.mkdirSync(methodDir, { recursive: true });

  const lines = [
    '1. INTRODUCTION',
    'Applicability and eligibility requirements.',
    '',
    '2. BASELINE',
    'Baseline scenario and additionality.',
    '',
    '3. EMISSIONS',
    'Emission reductions are calculated annually.',
    '',
    '4. LEAKAGE',
    'Leakage shall be monitored and deducted.',
    '',
    '5. MONITORING',
    'Monitoring and QA/QC requirements apply.',
  ];
  writePdf(pdfPath, buildPdfWithTextLines(lines));

  const res = runExtractSections(methodDir, pdfPath);
  assert.strictEqual(res.status, 0, `extract-sections failed:\n${res.stdout}\n${res.stderr}`);

  const lean = readJson(sectionsPath);
  assert.ok(Array.isArray(lean?.sections), 'expected sections array');
  assert.ok(lean.sections.length >= 5, `expected >=5 sections, got ${lean.sections.length}`);
  assert.ok(
    lean.sections.every((s) => typeof s.anchor === 'string' && s.anchor.length > 0),
    'expected all sections to have anchors',
  );
  assert.ok(
    lean.sections.every((s) => typeof s.content === 'string' && s.content.trim().length > 0),
    'expected all sections to have content',
  );

  rmrf(methodDir);
  rmrf(path.dirname(pdfPath));
  console.log('ok');
}

main();
