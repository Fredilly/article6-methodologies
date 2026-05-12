#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const METHOD_DIR = path.join(ROOT, 'methodologies', 'Verra', 'AFOLU', 'VM0047', 'v1-0');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const meta = readJSON(path.join(METHOD_DIR, 'META.json'));
  const rules = readJSON(path.join(METHOD_DIR, 'rules.json')).rules || [];
  const sections = readJSON(path.join(METHOD_DIR, 'sections.json')).sections || [];
  const richRules = readJSON(path.join(METHOD_DIR, 'rules.rich.json'));
  const richByStableId = new Map(richRules.map((rule) => [rule.stable_id, rule]));

  // --- Base artifact status ---
  assert.equal(meta.artifact_status?.source_pdf, 'verified', 'VM0047 source PDF must be verified');
  assert.equal(meta.artifact_status?.sections, 'source_audited', 'VM0047 sections must be source_audited from TOC');
  assert.equal(meta.artifact_status?.rules, 'draft_unverified', 'VM0047 rules remain draft_unverified');
  assert.equal(meta.artifact_quality_standard?.version, 'review_contract_v1', 'VM0047 should opt into review_contract_v1');
  assert.equal(meta.methodology_linked_review_ready, false, 'VM0047 must not be review-ready');
  assert.ok(Array.isArray(meta.methodology_linked_review_blockers) && meta.methodology_linked_review_blockers.length >= 2, 'VM0047 must explain blockers');

  // --- Exact section count ---
  assert.equal(sections.length, 27, 'VM0047 must have exactly 27 sections');

  // --- Exact rule count split ---
  assert.equal(rules.length, 11, 'VM0047 must have exactly 11 rules');
  const sourceAuditedRules = rules.filter((rule) => rule.quality_status === 'source_audited');
  const draftRules = rules.filter((rule) => rule.quality_status === 'draft_unverified');
  assert.equal(sourceAuditedRules.length, 7, 'VM0047 must have exactly 7 source-audited rules');
  assert.equal(draftRules.length, 4, 'VM0047 must have exactly 4 draft_unverified rules');

  // --- Rich/lean parity across all rules ---
  for (const rule of rules) {
    const richRule = richByStableId.get(rule.stable_id);
    assert.ok(richRule, `${rule.stable_id} must exist in rules.rich.json`);
    assert.equal(richRule.quality_status, rule.quality_status, `${rule.stable_id} rich/lean quality_status mismatch`);
    assert.ok(richRule.section_context?.page_start, `${rule.stable_id} must have page_start`);
    assert.ok(richRule.section_context?.page_end, `${rule.stable_id} must have page_end`);
  }

  // --- Source-audited rule discipline ---
  const PLACEHOLDER_PATTERNS = [/Not specified in VF5 draft seed/i, /TBD/i, /pending/i, /unknown/i];
  for (const leanRule of sourceAuditedRules) {
    const richRule = richByStableId.get(leanRule.stable_id);

    assert.equal(richRule.section_context?.locator_status, 'source_audited', `${leanRule.stable_id} must have audited locator status`);

    const externalTools = (leanRule.tools || []).filter((tool) => tool !== 'Verra/VM0047@v1-0');
    assert.equal(externalTools.length, 0, `${leanRule.stable_id} is source_audited and must not have blocked external deps`);

    assert.ok(richRule.source_span_text && richRule.source_span_text.length > 0, `${leanRule.stable_id} must have non-empty source_span_text`);
    assert.equal(richRule.source_span_status, 'source_audited', `${leanRule.stable_id} must have source_span_status: source_audited`);
    assert.equal(richRule.rule_detail?.status, 'source_audited', `${leanRule.stable_id} must have rule_detail.status: source_audited`);

    assert.ok(Array.isArray(richRule.rule_detail?.conditions) && richRule.rule_detail.conditions.length >= 1,
      `${leanRule.stable_id} must have at least one condition`);

    if (Array.isArray(richRule.rule_detail?.exceptions)) {
      for (const exc of richRule.rule_detail.exceptions) {
        const isPlaceholder = PLACEHOLDER_PATTERNS.some((p) => p.test(exc));
        assert.ok(!isPlaceholder, `${leanRule.stable_id} exceptions must not contain placeholder text: "${exc}"`);
      }
    }
  }

  // --- External dependency declarations ---
  const ruleTools = new Set();
  for (const rule of rules) {
    for (const tool of Array.isArray(rule.tools) ? rule.tools : []) {
      if (tool !== 'Verra/VM0047@v1-0') ruleTools.add(tool);
    }
  }

  const externalRefs = new Map(
    (meta.external_dependencies?.methodology_and_tool_refs || []).map((entry) => [entry.id, entry])
  );
  assert.equal(meta.external_dependencies?.status, 'external_unencoded', 'VM0047 external dependency status must be external_unencoded');
  for (const toolId of ruleTools) {
    const entry = externalRefs.get(toolId);
    assert.ok(entry, `VM0047 external dependency ${toolId} must be declared in META.json`);
    assert.equal(entry.status, 'external_unencoded', `VM0047 external dependency ${toolId} must stay external_unencoded`);
    assert.equal(entry.local_artifact_present, false, `VM0047 external dependency ${toolId} must not claim a local artifact`);
  }

  // --- Blocker inventory ---
  const inventory = readJSON(path.join(METHOD_DIR, 'blocked-external-dependencies.json'));
  assert.equal(inventory.methodology, 'Verra/VM0047@v1-0', 'inventory methodology must match');
  assert.equal(inventory.status, 'external_unencoded', 'inventory status must be external_unencoded');
  assert.equal(inventory.blocked_rule_count, 4, 'inventory must report 4 blocked rules');
  assert.equal(inventory.blocked_rules.length, 4, 'inventory must contain 4 blocked rule entries');
  assert.equal(inventory.blocked_rules.length, draftRules.length, 'inventory must cover every draft_unverified rule');

  const invByStableId = new Map(inventory.blocked_rules.map((entry) => [entry.stable_id, entry]));

  for (const leanRule of draftRules) {
    const invEntry = invByStableId.get(leanRule.stable_id);
    assert.ok(invEntry, `${leanRule.stable_id} must be listed in blocked-external-dependencies.json`);
    assert.equal(invEntry.rule_id, leanRule.id, `${leanRule.stable_id} inventory rule_id mismatch`);
    assert.equal(invEntry.quality_status, 'draft_unverified', `${leanRule.stable_id} inventory quality_status must be draft_unverified`);
    assert.equal(invEntry.blocking_reason, 'external_dependency_unencoded', `${leanRule.stable_id} blocking_reason must be external_dependency_unencoded`);

    const extTools = (leanRule.tools || []).filter((tool) => tool !== 'Verra/VM0047@v1-0');
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

  // --- Guard: external_unencoded + review_ready invariant ---
  if (meta.external_dependencies?.status === 'external_unencoded') {
    assert.equal(meta.methodology_linked_review_ready, false, 'methodology_linked_review_ready must be false when external dependencies are unencoded');
  }

  // --- Provenance ---
  assert.equal(meta.provenance?.source_pdfs?.[0]?.sha256, '987f86d4e7f8aa939875dbf6a1376287444531954f7573b3b46fe0e07919ded6', 'VM0047 source PDF hash must match');

  console.log('ok verra vm0047 truthfulness');
}

main();
