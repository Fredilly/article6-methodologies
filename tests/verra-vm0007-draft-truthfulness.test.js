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

  console.log('ok verra vm0007 draft truthfulness');
}

main();
