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

  assert.equal(meta.artifact_status?.source_pdf, 'verified', 'VM0047 source PDF must be verified');
  assert.equal(meta.artifact_status?.sections, 'source_audited', 'VM0047 sections must be source_audited from TOC');
  assert.equal(meta.artifact_status?.rules, 'draft_unverified', 'VM0047 rules remain draft_unverified');
  assert.equal(meta.artifact_quality_standard?.version, 'review_contract_v1', 'VM0047 should opt into review_contract_v1');
  assert.equal(meta.methodology_linked_review_ready, false, 'VM0047 must not be review-ready');
  assert.ok(Array.isArray(meta.methodology_linked_review_blockers) && meta.methodology_linked_review_blockers.length >= 2, 'VM0047 must explain blockers');

  assert.ok(sections.length >= 20, `VM0047 sections.json must have >= 20 entries (got ${sections.length})`);

  const ruleIds = new Set(rules.map((r) => r.id));
  const richRules = readJSON(path.join(METHOD_DIR, 'rules.rich.json'));
  const richByStableId = new Map(richRules.map((rule) => [rule.stable_id, rule]));

  for (const rule of rules) {
    const richRule = richByStableId.get(rule.stable_id);
    assert.ok(richRule, `${rule.stable_id} must exist in rules.rich.json`);
    assert.equal(richRule.quality_status, rule.quality_status, `${rule.stable_id} rich/lean quality_status mismatch`);
    assert.ok(richRule.section_context?.page_start, `${rule.stable_id} must have page_start`);
    assert.ok(richRule.section_context?.page_end, `${rule.stable_id} must have page_end`);
  }

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

  const sourceAuditedRules = rules.filter((rule) => rule.quality_status === 'source_audited');
  const draftRules = rules.filter((rule) => rule.quality_status === 'draft_unverified');

  assert.ok(sourceAuditedRules.length >= 1, 'VM0047 should have at least 1 source-audited rule');
  assert.ok(draftRules.length >= 1, 'VM0047 should have at least 1 draft_unverified rule');

  for (const leanRule of sourceAuditedRules) {
    const richRule = richByStableId.get(leanRule.stable_id);
    assert.equal(richRule.section_context?.locator_status, 'source_audited', `${leanRule.stable_id} must have audited locator status`);
    const externalTools = (leanRule.tools || []).filter((tool) => tool !== 'Verra/VM0047@v1-0');
    assert.equal(externalTools.length, 0, `${leanRule.stable_id} is source_audited and must not have blocked external deps`);
  }

  for (const leanRule of draftRules) {
    const hasDep = (leanRule.tools || []).some((t) => t !== 'Verra/VM0047@v1-0');
    if (hasDep) {
      for (const tool of (leanRule.tools || []).filter((t) => t !== 'Verra/VM0047@v1-0')) {
        const entry = externalRefs.get(tool);
        assert.ok(entry, `${leanRule.stable_id} external dependency ${tool} must be declared in META.json`);
        assert.equal(entry.status, 'external_unencoded', `${tool} must remain external_unencoded`);
        assert.equal(entry.local_artifact_present, false, `${tool} must not claim local artifact presence`);
      }
    }
  }

  assert.equal(meta.provenance?.source_pdfs?.[0]?.sha256, '987f86d4e7f8aa939875dbf6a1376287444531954f7573b3b46fe0e07919ded6', 'VM0047 source PDF hash must match');

  console.log('ok verra vm0047 truthfulness');
}

main();
