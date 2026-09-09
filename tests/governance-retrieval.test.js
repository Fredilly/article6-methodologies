'use strict';

const assert = require('assert');
const path = require('path');
const { createGovernanceRetriever } = require('../lib/governance-retrieval');

const retriever = createGovernanceRetriever(path.resolve(__dirname, '..'));

const identity = retriever.query({ operation: 'identity', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1' });
assert.strictEqual(identity.found, true);
assert.strictEqual(identity.code, 'VM0047');
assert.strictEqual(identity.version, 'v1-1');
assert.strictEqual(identity.status, 'Active');
assert.strictEqual(identity.effective_from, '2025-05-14');
assert.strictEqual(identity.source.sha256, '2fdccb9764a0b06283e974142d0ff250910f81686dc53bcc197f6cf90d53de3d');
assert.strictEqual(identity.source.governed_pdf_present, true);

const current = retriever.query({ operation: 'version', standard: 'Verra', program: 'AFOLU', code: 'VM0047' });
assert.strictEqual(current.version, 'v1-1');
assert.strictEqual(current.latest, true);

const historical = retriever.query({ operation: 'version', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-0' });
assert.strictEqual(historical.version, 'v1-0');

const section = retriever.query({ operation: 'section', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', section_number: '9.3.1' });
assert.strictEqual(section.found, true);
assert.strictEqual(section.section.title, 'Database Requirements for Project and Control Plots');
assert.deepStrictEqual(section.section.pages, [62, 63]);

const rule = retriever.query({ operation: 'rule', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', rule_id: 'R-4-3-0002' });
assert.strictEqual(rule.found, true);
assert.strictEqual(rule.requested_rule_id, 'R-4-3-0002');
assert.strictEqual(rule.rule.id, 'Verra.AFOLU.VM0047.v1-1.R-4-3-0002');
assert.strictEqual(rule.source.sha256, identity.source.sha256);

const leakage = retriever.query({ operation: 'dependency', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', target: 'Verra/VMD0054' });
assert.strictEqual(leakage.applies, true);
assert.strictEqual(leakage.dependency.relationship, 'MANDATORY');
assert.strictEqual(leakage.dependency.version_policy, 'MOST_RECENT_AT_APPLICATION');
assert.strictEqual(leakage.dependency.version, null);

const vt0005 = retriever.query({ operation: 'dependency', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', target: 'Verra/VT0005' });
assert.strictEqual(vt0005.applies, false);
assert.strictEqual(vt0005.answer, 'no');
assert.strictEqual(vt0005.non_dependency.source_page, 47);

const diff = retriever.query({ operation: 'version_diff', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', from_version: 'v1-0' });
assert.strictEqual(diff.found, true);
assert.strictEqual(diff.diff.material_change_count, 11);
assert.ok(diff.diff.change_types.includes('ADDED'));
assert.ok(diff.diff.change_types.includes('MODIFIED'));
assert.ok(diff.diff.change_types.includes('TOOL_CHANGED'));

const verifiedOnly = retriever.query({ operation: 'rules', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', require_verified: true });
assert.strictEqual(verifiedOnly.verification_status, 'verified');
assert.strictEqual(verifiedOnly.verified, true);
assert.strictEqual(verifiedOnly.production_rules_returned, true);
assert.ok(verifiedOnly.rules.length > 0);

console.log('ok governance-v1 structured retrieval');
