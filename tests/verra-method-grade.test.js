#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { isGradeA } = require('../scripts/grade-method');

const ROOT = path.resolve(__dirname, '..');

function readJSON(p) {
  return JSON.parse(require('fs').readFileSync(p, 'utf8'));
}

function main() {
  const VM0007_DIR = path.join(ROOT, 'methodologies', 'Verra', 'AFOLU', 'VM0007', 'v1-8');
  const VM0047_DIR = path.join(ROOT, 'methodologies', 'Verra', 'AFOLU', 'VM0047', 'v1-0');

  // 1. VM0047 is Grade A (computed from canonical artifacts)
  const vm0047 = isGradeA(VM0047_DIR);
  assert.equal(vm0047.gradeA, true, 'VM0047 must be Grade A after all 11 rules promoted and dependencies resolved');
  assert.equal(vm0047.errors.length, 0, 'VM0047 must have 0 Grade A errors');

  // 2. VM0007 is not Grade A
  const vm0007 = isGradeA(VM0007_DIR);
  assert.equal(vm0007.gradeA, false, 'VM0007 must not be Grade A (33 draft rules, 21 unresolved deps)');
  assert.ok(vm0007.errors.length > 0, 'VM0007 must have Grade A errors');

  // 3. META canonical source of truth is consistent
  const vm0047Meta = readJSON(path.join(VM0047_DIR, 'META.json'));
  assert.equal(vm0047Meta.methodology_linked_review_ready, true, 'VM0047 META methodology_linked_review_ready must be true');
  assert.equal(vm0047Meta.artifact_status?.rules, 'source_audited', 'VM0047 META rules status must be source_audited');
  assert.equal(vm0047Meta.artifact_quality_standard?.adoption_status, 'grade_a', 'VM0047 META adoption_status must be grade_a');

  // Grade A implies methodology_linked_review_ready
  assert.ok(!(vm0047.gradeA && !vm0047Meta.methodology_linked_review_ready),
    'Grade A method must have methodology_linked_review_ready: true');

  // 4. VM0007 has draft rules and active external deps (not Grade A)
  const vm0007Meta = readJSON(path.join(VM0007_DIR, 'META.json'));
  assert.equal(vm0007Meta.artifact_status?.rules, 'draft_unverified', 'VM0007 rules must be draft_unverified');
  assert.equal(vm0007Meta.methodology_linked_review_ready, false, 'VM0007 must not be review-ready');

  // 5. T-SIG is not an active VM0047 blocker
  const inv = readJSON(path.join(VM0047_DIR, 'blocked-external-dependencies.json'));
  const tsigBlocked = inv.blocked_rules.some((r) =>
    r.external_dependencies.some((d) => d.includes('T-SIG')));
  assert.equal(tsigBlocked, false, 'T-SIG must not appear as an active blocker in VM0047 inventory');

  console.log('ok verra method grade');
}

main();
