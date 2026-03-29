#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const methodDir = path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AMS0007', 'v03-1');
const unrelatedMetaPaths = [
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AM0073', 'v01-0', 'META.json'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AM0014', 'v03-0', 'META.json'),
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

function validateMetaSchema() {
  const metaPath = path.join(methodDir, 'META.json');
  const validation = run('./scripts/run-ajv.sh', [
    'validate',
    '-s',
    'schemas/META.schema.json',
    '-d',
    path.relative(repoRoot, metaPath),
  ]);
  assert.strictEqual(
    validation.status,
    0,
    `META schema validation should pass\nstdout:\n${validation.stdout}\nstderr:\n${validation.stderr}`,
  );
}

function assertRelationshipContract() {
  const meta = readJson(path.join(methodDir, 'META.json'));
  const sections = readJson(path.join(methodDir, 'sections.rich.json'));
  const rules = readJson(path.join(methodDir, 'rules.rich.json'));

  const relationships = meta.tool_module_relationships;
  assert.ok(Array.isArray(relationships) && relationships.length > 0, 'expected source-backed tool_module_relationships');

  const sectionByStableId = new Map(sections.map((section) => [section.stable_id, section]));
  const ruleByStableId = new Map(rules.map((rule) => [rule.stable_id, rule]));

  let sawAnchoredRef = false;
  let sawPagedRef = false;

  for (const relationship of relationships) {
    assert.strictEqual(relationship.relationship, 'uses_tool', 'relationship should stay canonical');
    assert.ok(relationship.tool_id.startsWith('UNFCCC/AR-TOOL'), `${relationship.tool_id}: expected external tool relationship`);
    assert.ok(relationship.tool_label.length > 0, `${relationship.tool_id}: tool_label should be present`);

    const section = sectionByStableId.get(relationship.module_id);
    assert.ok(section, `${relationship.module_id}: module_id should resolve to a rich section`);
    assert.strictEqual(relationship.module_label, section.title, `${relationship.module_id}: module_label should mirror section title`);

    assert.ok(Array.isArray(relationship.source_refs) && relationship.source_refs.length > 0, `${relationship.tool_id}: source_refs should be non-empty`);

    for (const sourceRef of relationship.source_refs) {
      const rule = ruleByStableId.get(sourceRef.rule_id);
      assert.ok(rule, `${relationship.tool_id}: rule source ref should resolve`);
      assert.strictEqual(sourceRef.section_stable_id, section.stable_id, `${relationship.tool_id}: section_stable_id mismatch`);
      assert.strictEqual(sourceRef.section_id, section.id, `${relationship.tool_id}: section_id mismatch`);
      assert.ok(Array.isArray(rule.refs.tools) && rule.refs.tools.includes(relationship.tool_id), `${relationship.tool_id}: rule should reference tool`);
      assert.strictEqual(rule.refs.section_stable_id, section.stable_id, `${relationship.tool_id}: rule section_stable_id mismatch`);
      if ('section_anchor' in sourceRef) {
        sawAnchoredRef = true;
        assert.strictEqual(sourceRef.section_anchor, section.anchor, `${relationship.tool_id}: section_anchor mismatch`);
      } else {
        assert.ok(!('anchor' in (rule.section_context || {})) || !('page_start' in sourceRef), `${relationship.tool_id}: anchorless refs should not invent page linkage`);
      }
      if ('page_start' in sourceRef || 'page_end' in sourceRef) {
        sawPagedRef = true;
        assert.strictEqual(sourceRef.page_start, section.page_start, `${relationship.tool_id}: page_start mismatch`);
        assert.strictEqual(sourceRef.page_end, section.page_end, `${relationship.tool_id}: page_end mismatch`);
      } else {
        assert.ok(!('page_start' in section), `${relationship.tool_id}: page bounds should only be omitted when section lacks grounded pages`);
      }
    }
  }

  assert.ok(sawAnchoredRef, 'expected at least one relationship with grounded anchor provenance');
  assert.ok(sawPagedRef, 'expected at least one relationship with grounded page provenance');
}

function assertNoBleed() {
  for (const metaPath of unrelatedMetaPaths) {
    const meta = readJson(metaPath);
    assert.ok(!('tool_module_relationships' in meta), `${path.relative(repoRoot, metaPath)} unexpectedly gained tool_module_relationships`);
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
    path.join(methodDir, 'META.json'),
    path.join(methodDir, 'rules.rich.json'),
    path.join(methodDir, 'sections.rich.json'),
    path.join(methodDir, 'rules.json'),
    path.join(methodDir, 'sections.json'),
    ...unrelatedMetaPaths,
  ];
  const baselineHashes = new Map(trackedPaths.map((filePath) => [filePath, sha256File(filePath)]));

  validateMetaSchema();
  assertRelationshipContract();
  assertNoBleed();

  rerunScopedEnrichmentTwice();

  validateMetaSchema();
  assertRelationshipContract();
  assertNoBleed();

  for (const [filePath, baselineHash] of baselineHashes.entries()) {
    assert.strictEqual(sha256File(filePath), baselineHash, `${path.relative(repoRoot, filePath)} changed after rerun`);
  }

  console.log('ok');
}

main();
