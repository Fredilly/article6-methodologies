#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'forestry-gold',
  'methodologies',
  'UNFCCC',
  'Forestry',
  'AR-ACM0003',
  'v02-0',
);
const sectionsPath = path.join(fixtureRoot, 'sections.json');
const rulesPath = path.join(fixtureRoot, 'rules.json');
const metaPath = path.join(fixtureRoot, 'META.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
  const sections = readJson(sectionsPath).sections;
  const rules = readJson(rulesPath).rules;
  const meta = readJson(metaPath);

  assert.equal(meta.stage, 'production', 'fixture must be marked production');
  assert.equal(sections.length, 5, 'fixture should preserve all five canonical sections');
  assert.equal(rules.length, 8, 'fixture should preserve all eight proving rules');

  const sectionIds = new Set(sections.map((section) => section.id));
  const stableSectionIds = new Set(sections.map((section) => section.stable_id));
  assert.equal(sectionIds.size, sections.length, 'section ids must be unique');
  assert.equal(stableSectionIds.size, sections.length, 'section stable ids must be unique');

  for (const rule of rules) {
    assert.ok(sectionIds.has(rule.section_id), `${rule.id}: section_id must exist in sections.json`);
    assert.ok(
      stableSectionIds.has(rule.section_stable_id),
      `${rule.id}: section_stable_id must exist in sections.json`,
    );
    assert.ok(Array.isArray(rule.tools) && rule.tools.length > 0, `${rule.id}: tools must be non-empty`);
    assert.ok(Array.isArray(rule.expectedEvidence), `${rule.id}: expectedEvidence must be present`);
    assert.ok(rule.expectedEvidence.length > 0, `${rule.id}: expectedEvidence must be non-empty`);
    for (const item of rule.expectedEvidence) {
      assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${rule.id}: evidence ids must be stable`);
      assert.equal(typeof item.label, 'string', `${rule.id}: evidence label must be a string`);
      assert.ok(item.label.length > 0, `${rule.id}: evidence label must be non-empty`);
      assert.equal(typeof item.description, 'string', `${rule.id}: evidence description must be a string`);
      assert.ok(item.description.length > 0, `${rule.id}: evidence description must be non-empty`);
      assert.equal(typeof item.required, 'boolean', `${rule.id}: evidence required must be boolean`);
    }
  }

  assert.equal(
    meta.audit_hashes.sections_json_sha256,
    sha256File(sectionsPath),
    'META sections hash must match fixture sections.json',
  );
  assert.equal(
    meta.audit_hashes.rules_json_sha256,
    sha256File(rulesPath),
    'META rules hash must match fixture rules.json',
  );

  const toolRefs = meta.references?.tools || [];
  assert.equal(toolRefs.length, 7, 'fixture must include every AR-ACM0003 v02-0 tool asset');

  for (const ref of toolRefs) {
    const absPath = path.join(repoRoot, ref.path);
    assert.ok(fs.existsSync(absPath), `tool ref missing file: ${ref.path}`);
    assert.equal(ref.sha256, sha256File(absPath), `tool ref hash mismatch: ${ref.path}`);
  }

  const sourcePdfs = meta.provenance?.source_pdfs || [];
  assert.equal(sourcePdfs.length, 1, 'fixture should keep the primary methodology source PDF provenance');
  assert.equal(
    sourcePdfs[0].sha256,
    meta.audit_hashes.source_pdf_sha256,
    'source pdf provenance should match META audit hash',
  );

  console.log('ok');
}

main();
