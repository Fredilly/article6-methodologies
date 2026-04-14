#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const methodDir = path.join(repoRoot, 'methodologies', 'GoldStandard', 'LUF', 'GS-00XX', 'v1-0');

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(methodDir, fileName), 'utf8'));
}

function main() {
  const leanRules = readJson('rules.json').rules;
  const richRules = readJson('rules.rich.json');
  const sectionsRich = readJson('sections.rich.json');

  assert.strictEqual(leanRules.length, 26, 'expected 26 GS lean rules');
  assert.strictEqual(richRules.length, 26, 'expected 26 GS rich rules');
  assert.strictEqual(sectionsRich.length, 5, 'expected 5 GS sections');

  for (const rule of leanRules) {
    assert.ok(rule.id, 'lean rule missing id');
    assert.ok(rule.stable_id, `lean rule ${rule.id} missing stable_id`);
    assert.ok(rule.title, `lean rule ${rule.id} missing title`);
    assert.ok(rule.logic, `lean rule ${rule.id} missing logic`);
    assert.ok(rule.section_anchor, `lean rule ${rule.id} missing section_anchor`);
    assert.ok(rule.section_id, `lean rule ${rule.id} missing section_id`);
    assert.ok(rule.section_number, `lean rule ${rule.id} missing section_number`);
    assert.ok(rule.section_stable_id, `lean rule ${rule.id} missing section_stable_id`);
    assert.ok(Array.isArray(rule.tools), `lean rule ${rule.id} missing tools array`);
    assert.ok(!Object.hasOwn(rule, 'text'), `lean rule ${rule.id} still contains duplicate text`);
  }

  const enrichedStableIds = new Set([
    'GoldStandard.LUF.GS-00XX.v1-0.R-2-0003',
    'GoldStandard.LUF.GS-00XX.v1-0.R-2-0004',
    'GoldStandard.LUF.GS-00XX.v1-0.R-2-0008',
    'GoldStandard.LUF.GS-00XX.v1-0.R-3-0002',
    'GoldStandard.LUF.GS-00XX.v1-0.R-3-0003',
    'GoldStandard.LUF.GS-00XX.v1-0.R-3-0004',
    'GoldStandard.LUF.GS-00XX.v1-0.R-3-0005',
    'GoldStandard.LUF.GS-00XX.v1-0.R-3-0006',
    'GoldStandard.LUF.GS-00XX.v1-0.R-4-0001',
    'GoldStandard.LUF.GS-00XX.v1-0.R-5-0001',
    'GoldStandard.LUF.GS-00XX.v1-0.R-5-0003',
  ]);
  const legacyRichKeys = ['summary', 'refs', 'type', 'notes', 'title', 'logic', 'text'];
  const leanByStableId = new Map(leanRules.map((rule) => [rule.stable_id, rule]));

  for (const rule of richRules) {
    assert.ok(rule.id, 'rich rule missing id');
    assert.ok(rule.stable_id, `rich rule ${rule.id} missing stable_id`);
    for (const key of legacyRichKeys) {
      assert.ok(!Object.hasOwn(rule, key), `rich rule ${rule.id} still contains legacy key ${key}`);
    }
    if (enrichedStableIds.has(rule.stable_id)) {
      assert.ok(rule.source_span_text, `enriched rich rule ${rule.id} missing source_span_text`);
      assert.ok(rule.section_context, `enriched rich rule ${rule.id} missing section_context`);
      assert.ok(rule.requirement_coverage, `enriched rich rule ${rule.id} missing requirement_coverage`);
      assert.ok(rule.rule_detail, `enriched rich rule ${rule.id} missing rule_detail`);
      const leanRule = leanByStableId.get(rule.stable_id);
      assert.ok(leanRule, `missing lean pair for ${rule.id}`);
      assert.strictEqual(rule.section_context.section_id, leanRule.section_id, `${rule.id} section mismatch`);
    } else {
      assert.deepStrictEqual(
        Object.keys(rule).sort(),
        ['id', 'stable_id'],
        `thin rich rule ${rule.id} should only contain identity fields`,
      );
    }
  }

  const allowedSectionKeys = new Set([
    'anchor',
    'id',
    'provenance',
    'section_number',
    'stable_id',
    'summary',
    'title',
    'workflow_role',
  ]);
  let enrichedSections = 0;
  for (const section of sectionsRich) {
    for (const key of Object.keys(section)) {
      assert.ok(allowedSectionKeys.has(key), `section ${section.id} has unexpected key ${key}`);
    }
    assert.ok(section.id, 'section missing id');
    assert.ok(section.title, `section ${section.id} missing title`);
    assert.ok(section.anchor, `section ${section.id} missing anchor`);
    assert.ok(section.section_number, `section ${section.id} missing section_number`);
    assert.ok(section.stable_id, `section ${section.id} missing stable_id`);
    assert.ok(section.provenance, `section ${section.id} missing provenance`);
    if (section.summary || section.workflow_role) enrichedSections += 1;
  }
  assert.ok(enrichedSections >= 3, 'expected modest enrichment in sections.rich.json');

  console.log('ok');
}

main();
