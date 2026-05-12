#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { isGradeA } = require('../scripts/grade-method');

const ROOT = path.resolve(__dirname, '..');

function main() {
  const VM0007_DIR = path.join(ROOT, 'methodologies', 'Verra', 'AFOLU', 'VM0007', 'v1-8');
  const VM0047_DIR = path.join(ROOT, 'methodologies', 'Verra', 'AFOLU', 'VM0047', 'v1-0');

  // 1. VM0047 is now Grade A
  const vm0047 = isGradeA(VM0047_DIR);
  assert.equal(vm0047.gradeA, true, 'VM0047 must be Grade A after all 11 rules promoted and dependencies resolved');

  // 2. VM0007 is not Grade A yet
  const vm0007 = isGradeA(VM0007_DIR);
  assert.equal(vm0007.gradeA, false, 'VM0007 must not be Grade A (33 draft rules, 21 unresolved deps)');

  // 3. A method cannot be app_ready if methodology_linked_review_ready is false
  const vm0047Grade = JSON.parse(require('fs').readFileSync(
    path.join(VM0047_DIR, 'METHOD_GRADE.json'), 'utf8'));
  assert.equal(vm0047Grade.app_ready, true, 'VM0047 app_ready must be true at Grade A');
  assert.equal(vm0047Grade.methodology_linked_review_ready, true, 'VM0047 methodology_linked_review_ready must be true at Grade A');
  assert.ok(!(vm0047Grade.app_ready && !vm0047Grade.methodology_linked_review_ready),
    'app_ready must not be true when methodology_linked_review_ready is false');

  // 4. A method cannot be Grade A with draft_unverified rules (VM0007 proof)
  assert.ok(vm0007.gradeA === false, 'VM0007 should not claim Grade A (33 draft rules)');

  // 5. T-SIG historical wording does not count as an active VM0047 blocker
  // The VM0047 blocker inventory should not list T-SIG as an active blocker
  const inv = JSON.parse(require('fs').readFileSync(
    path.join(VM0047_DIR, 'blocked-external-dependencies.json'), 'utf8'));
  const tsigBlocked = inv.blocked_rules.some((r) =>
    r.external_dependencies.some((d) => d.includes('T-SIG')));
  assert.equal(tsigBlocked, false, 'T-SIG must not appear as an active blocker in VM0047 inventory');

  console.log('ok verra method grade');
}

main();
