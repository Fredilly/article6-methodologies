#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const methodDir = path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-ACM0003', 'v02-0');
const unrelatedForestryRichPaths = [
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AM0014', 'v03-0', 'rules.rich.json'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AMS0007', 'v03-1', 'rules.rich.json'),
];
const unrelatedLeanRulePaths = [
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AM0073', 'v01-0', 'rules.json'),
];
const expectedToolPaths = [
  'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/EB75_repan30_AR-ACM0003_ver02.0.pdf',
  'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-02-v01.pdf',
  'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-08-v04.0.0.pdf',
  'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-12-v03.1.pdf',
  'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-14-v04.2.pdf',
  'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-15-v02.0.pdf',
  'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-16-v01.1.0.pdf',
];
const expectedEvidenceRuleIds = new Set([
  'UNFCCC.Forestry.AR-ACM0003.v02-0.R-1-0005',
  'UNFCCC.Forestry.AR-ACM0003.v02-0.R-1-0006',
  'UNFCCC.Forestry.AR-ACM0003.v02-0.R-1-0007',
  'UNFCCC.Forestry.AR-ACM0003.v02-0.R-1-0008',
]);
const expectedLeanProjection = new Map([
  ['R-1-0005', ['risk-assessment', 'buffer-account-records']],
  ['R-1-0006', ['plot-remeasurement-records', 'qaqc-procedures']],
  ['R-1-0007', ['uncertainty-worksheet', 'deduction-calculation-records']],
  ['R-1-0008', ['monitoring-report-package', 'versioned-monitoring-datasets']],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertMetaToolReferencesTruth() {
  const meta = readJson(path.join(methodDir, 'META.json'));
  const toolRefs = meta.references?.tools || [];
  const sourcePdfs = meta.provenance?.source_pdfs || [];

  assert.deepStrictEqual(
    toolRefs.map((tool) => tool.path),
    expectedToolPaths,
    'META references.tools should remain pinned to the real AR-ACM0003 tool PDFs',
  );

  assert.strictEqual(sourcePdfs.length, 1, 'META provenance.source_pdfs should retain one methodology source PDF');
  assert.strictEqual(
    sourcePdfs[0].path,
    expectedToolPaths[0],
    'META provenance.source_pdfs[0] should continue to point to the primary methodology PDF',
  );

  for (const tool of toolRefs) {
    const absolutePath = path.join(repoRoot, tool.path);
    assert.ok(fs.existsSync(absolutePath), `${tool.path}: referenced tool PDF must exist`);
    const actualSize = fs.statSync(absolutePath).size;
    const actualSha = sha256File(absolutePath);
    assert.strictEqual(tool.size, actualSize, `${tool.path}: META size must match the real PDF`);
    assert.strictEqual(tool.sha256, actualSha, `${tool.path}: META sha256 must match the real PDF`);
    assert.ok(actualSize > 1024, `${tool.path}: tool reference should not collapse to a tiny placeholder artifact`);
  }

  const sourceAbsolutePath = path.join(repoRoot, sourcePdfs[0].path);
  assert.ok(fs.existsSync(sourceAbsolutePath), `${sourcePdfs[0].path}: provenance source PDF must exist`);
  assert.strictEqual(
    sourcePdfs[0].size,
    fs.statSync(sourceAbsolutePath).size,
    `${sourcePdfs[0].path}: provenance source PDF size must match the real PDF`,
  );
  assert.strictEqual(
    sourcePdfs[0].sha256,
    sha256File(sourceAbsolutePath),
    `${sourcePdfs[0].path}: provenance source PDF sha256 must match the real PDF`,
  );
  assert.strictEqual(
    meta.audit_hashes?.source_pdf_sha256,
    sourcePdfs[0].sha256,
    'META audit_hashes.source_pdf_sha256 should stay aligned with provenance.source_pdfs[0]',
  );
}

function run(command, args) {
  return spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
}

function assertRulesRichSchema() {
  const rulesRichPath = path.join(methodDir, 'rules.rich.json');
  const validation = run('./scripts/run-ajv.sh', [
    'validate',
    '-s',
    'schemas/rules.rich.schema.json',
    '-d',
    path.relative(repoRoot, rulesRichPath),
  ]);
  assert.strictEqual(
    validation.status,
    0,
    `rules.rich schema validation should pass\nstdout:\n${validation.stdout}\nstderr:\n${validation.stderr}`,
  );
}

function assertExpectedEvidenceContract() {
  const rulesRich = readJson(path.join(methodDir, 'rules.rich.json'));
  const leanRules = readJson(path.join(methodDir, 'rules.json')).rules;
  const rulesWithEvidence = rulesRich.filter(
    (rule) => Array.isArray(rule.requirement_coverage?.expected_evidence),
  );
  assert.ok(rulesWithEvidence.length > 0, 'expected AR-ACM0003 proving methodology to emit expected_evidence');
  assert.deepStrictEqual(
    new Set(rulesWithEvidence.map((rule) => rule.id)),
    expectedEvidenceRuleIds,
    'expected_evidence should be limited to the grounded AR-ACM0003 proving rules',
  );

  for (const rule of rulesWithEvidence) {
    const coverage = rule.requirement_coverage;
    assert.strictEqual(coverage.coverage_scope, 'rule', `${rule.id}: coverage_scope must be "rule"`);
    assert.strictEqual(coverage.coverage_key, rule.id, `${rule.id}: coverage_key must stay stable`);
    assert.deepStrictEqual(
      coverage.section_refs,
      [{ relationship: 'source_section', section_id: rule.refs.sections[0] }],
      `${rule.id}: section_refs should align with the primary source section`,
    );
  }

  for (const rule of rulesWithEvidence) {
    const evidence = rule.requirement_coverage.expected_evidence;
    assert.ok(evidence.length > 0, `${rule.id}: expected_evidence must be non-empty`);
    for (const item of evidence) {
      assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${rule.id}: evidence id should be stable`);
      assert.ok(typeof item.label === 'string' && item.label.length > 0, `${rule.id}: label should be present`);
      assert.ok(typeof item.description === 'string' && item.description.length > 0, `${rule.id}: description should be present`);
      assert.strictEqual(typeof item.required, 'boolean', `${rule.id}: required should be boolean`);
      assert.ok(!('monitoring_report' in item), `${rule.id}: monitoring_report should be omitted when unsupported`);
    }
  }

  const rulesWithoutEvidence = rulesRich.filter(
    (rule) => !Array.isArray(rule.requirement_coverage?.expected_evidence),
  );
  assert.ok(rulesWithoutEvidence.length > 0, 'expected omission path for unsupported rules');

  const leanRulesWithEvidence = leanRules.filter((rule) => Array.isArray(rule.expectedEvidence));
  assert.deepStrictEqual(
    new Set(leanRulesWithEvidence.map((rule) => rule.stable_id)),
    expectedEvidenceRuleIds,
    'lean expectedEvidence projection should stay limited to the grounded AR-ACM0003 rules',
  );

  for (const rule of leanRulesWithEvidence) {
    assert.deepStrictEqual(
      rule.expectedEvidence,
      expectedLeanProjection.get(rule.id),
      `${rule.id}: lean expectedEvidence should be derived from rich expected_evidence ids`,
    );
  }

  const leanRulesWithoutEvidence = leanRules.filter((rule) => !Array.isArray(rule.expectedEvidence));
  assert.ok(leanRulesWithoutEvidence.length > 0, 'expected lean omission path for unsupported rules');
}

function assertNoBleed() {
  for (const filePath of unrelatedForestryRichPaths) {
    const rules = readJson(filePath);
    const leakingRule = rules.find((rule) => 'expected_evidence' in (rule.requirement_coverage || {}));
    assert.ok(!leakingRule, `${path.relative(repoRoot, filePath)} unexpectedly gained expected_evidence`);
  }

  for (const filePath of unrelatedLeanRulePaths) {
    const rules = readJson(filePath).rules;
    const leakingRule = rules.find((rule) => 'expectedEvidence' in rule);
    assert.ok(!leakingRule, `${path.relative(repoRoot, filePath)} unexpectedly gained lean expectedEvidence`);
  }
}

function rerunScopedGenerationTwice() {
  const commands = [
    ['scripts/rewrite-forestry.js', path.relative(repoRoot, methodDir)],
    ['scripts/enrich-methodology-outputs.js', path.relative(repoRoot, methodDir)],
    ['scripts/derive-lean-from-rich.js', path.relative(repoRoot, methodDir)],
  ];
  for (let index = 0; index < 2; index += 1) {
    for (const args of commands) {
      const result = run(process.execPath, args);
      assert.strictEqual(
        result.status,
        0,
        `${args.join(' ')} should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }
  }
}

function main() {
  const trackedPaths = [
    path.join(methodDir, 'rules.rich.json'),
    path.join(methodDir, 'rules.json'),
    path.join(methodDir, 'sections.rich.json'),
    path.join(methodDir, 'sections.json'),
    path.join(methodDir, 'META.json'),
    ...unrelatedForestryRichPaths,
  ];
  const baselineHashes = new Map(trackedPaths.map((filePath) => [filePath, sha256File(filePath)]));

  assertRulesRichSchema();
  assertExpectedEvidenceContract();
  assertNoBleed();
  assertMetaToolReferencesTruth();

  rerunScopedGenerationTwice();

  assertRulesRichSchema();
  assertExpectedEvidenceContract();
  assertNoBleed();
  assertMetaToolReferencesTruth();

  for (const [filePath, baselineHash] of baselineHashes.entries()) {
    assert.strictEqual(sha256File(filePath), baselineHash, `${path.relative(repoRoot, filePath)} changed after rerun`);
  }

  console.log('ok');
}

main();
