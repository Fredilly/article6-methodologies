#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function readJSON(p) {
  return JSON.parse(require('fs').readFileSync(p, 'utf8'));
}

function main() {
  const VM0007_DIR = path.join(ROOT, 'methodologies', 'Verra', 'AFOLU', 'VM0007', 'v1-8');
  const VM0047_DIR = path.join(ROOT, 'methodologies', 'Verra', 'AFOLU', 'VM0047', 'v1-0');

  // 1. VM0047 is Source-Audited (computed from canonical artifacts)
  const vm0047 = require('../scripts/grade-method').isGradeA(VM0047_DIR);
  assert.equal(vm0047.gradeA, true, 'VM0047 must be Source-Audited after all 11 rules promoted and dependencies resolved');
  assert.equal(vm0047.errors.length, 0, 'VM0047 must have 0 Source-Audited errors');

  // 2. VM0007 META confirms Source-Audited (grade_a legacy alias)
  const vm0007Meta = readJSON(path.join(VM0007_DIR, 'META.json'));
  assert.equal(vm0007Meta.artifact_status?.rules, 'source_audited', 'VM0007 rules must be source_audited at Source-Audited');
  assert.equal(vm0007Meta.methodology_linked_review_ready, true, 'VM0007 must be review-ready at Source-Audited');
  assert.equal(vm0007Meta.artifact_quality_standard?.adoption_status, 'grade_a', 'VM0007 META adoption_status must be grade_a (legacy/internal alias for Source-Audited)');

  // 3. VM0047 META checks
  const vm0047Meta = readJSON(path.join(VM0047_DIR, 'META.json'));
  assert.equal(vm0047Meta.methodology_linked_review_ready, true, 'VM0047 META methodology_linked_review_ready must be true');
  assert.equal(vm0047Meta.artifact_status?.rules, 'source_audited', 'VM0047 META rules status must be source_audited');
  assert.equal(vm0047Meta.artifact_quality_standard?.adoption_status, 'grade_a', 'VM0047 META adoption_status must be grade_a (legacy/internal alias for Source-Audited)');

  // 4. VM0007 has no remaining blocked external dependencies
  const vm0007Blocked = readJSON(path.join(VM0007_DIR, 'blocked-external-dependencies.json'));
  assert.equal(vm0007Blocked.blocked_rule_count, 0, 'VM0007 must have 0 blocked rules at Source-Audited');
  assert.equal(vm0007Blocked.blocked_rules.length, 0, 'VM0007 must have 0 blocked rule entries at Source-Audited');

  // 5. All 58 VM0007 rules are source_audited
  const vm0007Rules = readJSON(path.join(VM0007_DIR, 'rules.json')).rules;
  const vm0007SourceAudited = vm0007Rules.filter((r) => r.quality_status === 'source_audited');
  const vm0007DraftRules = vm0007Rules.filter((r) => r.quality_status === 'draft_unverified');
  assert.equal(vm0007SourceAudited.length, 58, 'VM0007 must have exactly 58 source_audited rules at Source-Audited');
  assert.equal(vm0007DraftRules.length, 0, 'VM0007 must have 0 draft_unverified rules at Source-Audited');

  // 6. T-SIG is not an active VM0047 blocker
  const inv = readJSON(path.join(VM0047_DIR, 'blocked-external-dependencies.json'));
  const tsigBlocked = inv.blocked_rules.some((r) =>
    r.external_dependencies.some((d) => d.includes('T-SIG')));
  assert.equal(tsigBlocked, false, 'T-SIG must not appear as an active blocker in VM0047 inventory');

  console.log('ok verra method grade');
}

main();
