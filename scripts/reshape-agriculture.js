#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'agriculture-canonical.json');
if (!fs.existsSync(TEMPLATE_PATH)) {
  throw new Error(`[reshape-agriculture] missing template at ${TEMPLATE_PATH}`);
}
const TEMPLATE = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

const DEFAULT_METHODS = [
  'UNFCCC/Agriculture/AM0073/v01-0',
  'UNFCCC/Agriculture/ACM0010/v03-0',
  'UNFCCC/Agriculture/AMS-III.D/v21-0',
  'UNFCCC/Agriculture/AMS-III.R/v05-0'
];

function relToDir(rel) {
  return path.join(ROOT, 'methodologies', ...rel.split('/'));
}

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJSON(p, data) {
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  if (fs.existsSync(p)) {
    const current = fs.readFileSync(p, 'utf8');
    if (current === payload) return;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, payload, 'utf8');
}

function methodFragments(dir) {
  const parts = dir.split(path.sep);
  const version = parts[parts.length - 1];
  const code = parts[parts.length - 2];
  const sector = parts[parts.length - 3];
  const program = parts[parts.length - 4];
  return { program, sector, code, version };
}

function methodDoc(dir) {
  const { program, code, version } = methodFragments(dir);
  return `${program}/${code}@${version}`;
}

function methodKey(dir) {
  const { program, sector, code, version } = methodFragments(dir);
  const safeCode = code.replace(/\./g, '-');
  return `${program}.${sector}.${safeCode}.${version}`;
}

function buildRuleId(dir, index, section) {
  const sectionNum = String(section).replace(/^S-/, '') || '1';
  return `${methodKey(dir)}.R-${index + 1}-${sectionNum.padStart(4, '0')}`;
}

function deriveLean(dir) {
  const script = path.join(ROOT, 'scripts', 'derive-lean-from-rich.js');
  const res = spawnSync('node', [script, dir], { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`[reshape-agriculture] derive-lean failed for ${dir}`);
  }
}

function reshape(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`[reshape-agriculture] skip missing ${dir}`);
    return;
  }
  const metaPath = path.join(dir, 'META.json');
  if (!fs.existsSync(metaPath)) {
    console.warn(`[reshape-agriculture] skip ${dir} (missing META.json)`);
    return;
  }
  const meta = loadJSON(metaPath);
  const docId = (meta.provenance && meta.provenance.source_pdfs && meta.provenance.source_pdfs[0]?.doc) || methodDoc(dir);
  const sourceHash = (meta.provenance && meta.provenance.source_pdfs && meta.provenance.source_pdfs[0]?.sha256) || meta.audit_hashes?.source_pdf_sha256;
  if (!sourceHash) {
    throw new Error(`[reshape-agriculture] missing source hash for ${dir}`);
  }

  const sectionsLean = TEMPLATE.sections.map((section) => ({ ...section }));
  writeJSON(path.join(dir, 'sections.json'), { sections: sectionsLean });

  const sectionsRich = TEMPLATE.sections.map((section) => ({
    id: section.id,
    title: section.title,
    provenance: {
      source_hash: sourceHash,
      source_ref: docId,
    },
  }));
  writeJSON(path.join(dir, 'sections.rich.json'), sectionsRich);

  const rulesRich = TEMPLATE.rules.map((rule, idx) => ({
    id: buildRuleId(dir, idx, rule.section),
    logic: rule.logic,
    notes: rule.notes,
    refs: {
      sections: [rule.section],
      tools: [docId],
    },
    summary: rule.summary,
    tags: rule.tags || [],
    type: rule.type,
    when: rule.when,
  }));
  writeJSON(path.join(dir, 'rules.rich.json'), rulesRich);

  deriveLean(dir);
  console.log(`[reshape-agriculture] rewrote ${path.relative(ROOT, dir)}`);
}

function main() {
  const args = process.argv.slice(2);
  const targets = (args.length ? args : DEFAULT_METHODS.map(relToDir)).map((p) => path.resolve(p));
  targets.forEach(reshape);
}

main();
