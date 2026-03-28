#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const methodDir = path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AMS0007', 'v03-1');
const unrelatedPaths = [
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AM0073', 'v01-0', 'sections.rich.json'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AM0073', 'v01-0', 'rules.rich.json'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AM0014', 'v03-0', 'sections.rich.json'),
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

function validateRichSchemas() {
  const sectionsRichPath = path.join(methodDir, 'sections.rich.json');
  const rulesRichPath = path.join(methodDir, 'rules.rich.json');
  const sectionsValidation = run('./scripts/run-ajv.sh', [
    'validate',
    '-s',
    'schemas/sections.rich.schema.json',
    '-d',
    path.relative(repoRoot, sectionsRichPath),
  ]);
  assert.strictEqual(
    sectionsValidation.status,
    0,
    `sections.rich schema validation should pass\nstdout:\n${sectionsValidation.stdout}\nstderr:\n${sectionsValidation.stderr}`,
  );
  const rulesValidation = run('./scripts/run-ajv.sh', [
    'validate',
    '-s',
    'schemas/rules.rich.schema.json',
    '-d',
    path.relative(repoRoot, rulesRichPath),
  ]);
  assert.strictEqual(
    rulesValidation.status,
    0,
    `rules.rich schema validation should pass\nstdout:\n${rulesValidation.stdout}\nstderr:\n${rulesValidation.stderr}`,
  );
}

function assertLocatorContract() {
  const sections = readJson(path.join(methodDir, 'sections.rich.json'));
  const rules = readJson(path.join(methodDir, 'rules.rich.json'));
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const supportedSections = sections.filter((section) => Array.isArray(section.locators) && section.locators.length > 0);

  assert.ok(supportedSections.length > 0, 'expected proving methodology to have supported section locators');

  for (const section of sections) {
    assert.ok(typeof section.anchor === 'string' && section.anchor.length > 0, `${section.id}: anchor should stay stable`);
    if (Array.isArray(section.pages) && section.pages.length > 0) {
      assert.strictEqual(section.page_start, section.pages[0], `${section.id}: page_start should match first page`);
      assert.strictEqual(section.page_end, section.pages[section.pages.length - 1], `${section.id}: page_end should match last page`);
    } else {
      assert.ok(!('page_start' in section), `${section.id}: page_start should be omitted when pages are absent`);
      assert.ok(!('page_end' in section), `${section.id}: page_end should be omitted when pages are absent`);
    }
    assert.ok(!('lineage' in section), `${section.id}: lineage should be omitted when unsupported`);
  }

  for (const rule of rules) {
    const primarySectionId = rule.refs.primary_section || rule.refs.sections[0];
    const section = sectionById.get(primarySectionId);
    assert.ok(section, `${rule.id}: referenced section should exist`);
    assert.ok(rule.section_context, `${rule.id}: section_context should be present`);
    assert.strictEqual(rule.section_context.section_id, section.id, `${rule.id}: section_context.section_id mismatch`);
    assert.strictEqual(rule.section_context.section_ref, section.id, `${rule.id}: section_context.section_ref mismatch`);
    assert.strictEqual(rule.section_context.section_title, section.title, `${rule.id}: section_context.section_title mismatch`);
    assert.strictEqual(rule.section_context.anchor, section.anchor, `${rule.id}: section_context.anchor mismatch`);
    assert.strictEqual(rule.refs.section_anchor, section.anchor, `${rule.id}: refs.section_anchor mismatch`);
    if ('page_start' in section) {
      assert.strictEqual(rule.section_context.page_start, section.page_start, `${rule.id}: section_context.page_start mismatch`);
      assert.strictEqual(rule.section_context.page_end, section.page_end, `${rule.id}: section_context.page_end mismatch`);
    } else {
      assert.ok(!('page_start' in rule.section_context), `${rule.id}: page_start should be omitted when section pages are absent`);
      assert.ok(!('page_end' in rule.section_context), `${rule.id}: page_end should be omitted when section pages are absent`);
    }
    assert.ok(!('lineage' in rule.section_context), `${rule.id}: section_context.lineage should be omitted when unsupported`);
  }
}

function rerunScopedEnrichmentTwice() {
  for (let index = 0; index < 2; index += 1) {
    const result = run('node', ['scripts/enrich-methodology-outputs.js', path.relative(repoRoot, methodDir)]);
    assert.strictEqual(
      result.status,
      0,
      `scoped rich enrichment should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function main() {
  const trackedPaths = [
    path.join(methodDir, 'sections.rich.json'),
    path.join(methodDir, 'rules.rich.json'),
    path.join(methodDir, 'sections.json'),
    path.join(methodDir, 'rules.json'),
    ...unrelatedPaths,
  ];
  const baselineHashes = new Map(trackedPaths.map((filePath) => [filePath, sha256File(filePath)]));

  validateRichSchemas();
  assertLocatorContract();

  rerunScopedEnrichmentTwice();

  validateRichSchemas();
  assertLocatorContract();

  for (const [filePath, baselineHash] of baselineHashes.entries()) {
    assert.strictEqual(sha256File(filePath), baselineHash, `${path.relative(repoRoot, filePath)} changed after rerun`);
  }

  console.log('ok');
}

main();
