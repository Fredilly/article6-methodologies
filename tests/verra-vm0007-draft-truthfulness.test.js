#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const METHOD_DIR = path.join(ROOT, 'methodologies', 'Verra', 'AFOLU', 'VM0007', 'v1-8');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const meta = readJSON(path.join(METHOD_DIR, 'META.json'));
  const rules = readJSON(path.join(METHOD_DIR, 'rules.json')).rules || [];

  assert.equal(meta.artifact_status?.source_pdf, 'verified', 'VM0007 source PDF must remain verified');
  assert.equal(meta.artifact_status?.sections, 'source_audited', 'VM0007 sections must be source_audited after VF2');
  assert.equal(meta.artifact_status?.rules, 'draft_unverified', 'VM0007 rules must remain draft_unverified');
  assert.equal(meta.artifact_quality_standard?.version, 'review_contract_v1', 'VM0007 should opt into review_contract_v1');
  assert.equal(meta.methodology_linked_review_ready, false, 'VM0007 must not be marked review-ready while draft artifacts remain');
  assert.ok(Array.isArray(meta.methodology_linked_review_blockers) && meta.methodology_linked_review_blockers.length >= 2, 'VM0007 must explain why review readiness is blocked');
  assert.equal(meta.draft_seed_artifacts?.retained, true, 'VM0007 draft seed artifacts must be explicitly retained');

  const richRules = readJSON(path.join(METHOD_DIR, 'rules.rich.json'));
  const richByStableId = new Map(richRules.map((rule) => [rule.stable_id, rule]));

  const ruleTools = new Set();
  for (const rule of rules) {
    for (const tool of Array.isArray(rule.tools) ? rule.tools : []) {
      if (tool !== 'Verra/VM0007@v1-8') ruleTools.add(tool);
    }
  }

  const externalRefs = new Map(
    (meta.external_dependencies?.methodology_and_tool_refs || []).map((entry) => [entry.id, entry])
  );
  assert.equal(meta.external_dependencies?.status, 'external_unencoded', 'VM0007 external dependency status must remain external_unencoded');
  for (const toolId of ruleTools) {
    const entry = externalRefs.get(toolId);
    assert.ok(entry, `VM0007 external dependency ${toolId} must be declared in META.json`);
    assert.equal(entry.status, 'external_unencoded', `VM0007 external dependency ${toolId} must stay external_unencoded`);
    assert.equal(entry.local_artifact_present, false, `VM0007 external dependency ${toolId} must not claim a local artifact`);
  }

  const sourceAuditedRules = rules.filter((rule) => rule.quality_status === 'source_audited');
  const draftRules = rules.filter((rule) => rule.quality_status === 'draft_unverified');

  assert.equal(sourceAuditedRules.length, 27, 'VM0007 must expose exactly 27 source-audited rules after quick wins');
  assert.equal(draftRules.length, 31, 'VM0007 must keep exactly 31 external-dependent rules draft_unverified after quick wins');

  for (const leanRule of sourceAuditedRules) {
    const richRule = richByStableId.get(leanRule.stable_id);

    assert.ok(richRule, `${leanRule.stable_id} must exist in rules.rich.json`);
    assert.equal(richRule.quality_status, 'source_audited', `${leanRule.stable_id} rich rule must be source_audited`);
    assert.equal(richRule.source_span_status, 'source_audited', `${leanRule.stable_id} must have audited source span status`);
    assert.equal(
      richRule.section_context?.locator_status,
      'source_audited',
      `${leanRule.stable_id} must have audited locator status`
    );
    assert.equal(typeof richRule.section_context?.page_start, 'number', `${leanRule.stable_id} must have page_start`);
    assert.equal(typeof richRule.section_context?.page_end, 'number', `${leanRule.stable_id} must have page_end`);
  }

  for (const leanRule of draftRules) {
    const externalTools = (leanRule.tools || []).filter((tool) => tool !== 'Verra/VM0007@v1-8');

    assert.ok(
      externalTools.length > 0,
      `${leanRule.stable_id} is draft_unverified and should be blocked by at least one external dependency`
    );

    for (const tool of externalTools) {
      const entry = externalRefs.get(tool);
      assert.ok(entry, `${leanRule.stable_id} external dependency ${tool} must be declared in META.json`);
      assert.equal(entry.status, 'external_unencoded', `${tool} must remain external_unencoded`);
      assert.equal(entry.local_artifact_present, false, `${tool} must not claim local artifact presence`);
    }
  }

  const inventory = readJSON(path.join(METHOD_DIR, 'blocked-external-dependencies.json'));
  assert.equal(inventory.methodology, 'Verra/VM0007@v1-8', 'inventory methodology must match');
  assert.equal(inventory.status, 'external_unencoded', 'inventory status must be external_unencoded');
  assert.equal(inventory.blocked_rule_count, 31, 'inventory must report 31 blocked rules after quick wins');
  assert.equal(inventory.blocked_rules.length, 31, 'inventory must contain 31 blocked rule entries after quick wins');
  assert.equal(inventory.blocked_rules.length, draftRules.length, 'inventory must cover every draft_unverified rule');

  const invByStableId = new Map(inventory.blocked_rules.map((entry) => [entry.stable_id, entry]));

  for (const leanRule of draftRules) {
    const invEntry = invByStableId.get(leanRule.stable_id);
    assert.ok(invEntry, `${leanRule.stable_id} must be listed in blocked-external-dependencies.json`);
    assert.equal(invEntry.rule_id, leanRule.id, `${leanRule.stable_id} inventory rule_id mismatch`);
    assert.equal(invEntry.quality_status, 'draft_unverified', `${leanRule.stable_id} inventory quality_status must be draft_unverified`);
    assert.equal(invEntry.blocking_reason, 'external_dependency_unencoded', `${leanRule.stable_id} blocking_reason must be external_dependency_unencoded`);

    const extTools = (leanRule.tools || []).filter((tool) => tool !== 'Verra/VM0007@v1-8');
    assert.deepEqual(
      [...invEntry.external_dependencies].sort(),
      [...extTools].sort(),
      `${leanRule.stable_id} inventory external_dependencies must match lean rule tools`
    );

    for (const dep of invEntry.external_dependencies) {
      const entry = externalRefs.get(dep);
      assert.ok(entry, `${leanRule.stable_id} inventory dep ${dep} must be declared in META.json`);
      assert.equal(entry.status, 'external_unencoded', `${dep} must remain external_unencoded`);
      assert.equal(entry.local_artifact_present, false, `${dep} must not claim local artifact presence`);
    }
  }

  for (const leanRule of sourceAuditedRules) {
    assert.ok(!invByStableId.has(leanRule.stable_id), `${leanRule.stable_id} is source_audited and must not appear in blocked-external-dependencies.json`);
  }

  console.log('ok verra vm0007 draft truthfulness');
}

main();
