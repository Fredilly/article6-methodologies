#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const am0073Dir = path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AM0073', 'v01-0');
const localToolBin = path.join(repoRoot, 'local-tools', 'bin');
const unrelatedAgricultureRichPaths = [
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'ACM0010', 'v03-0', 'rules.rich.json'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AMS-III.D', 'v21-0', 'rules.rich.json'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AMS-III.R', 'v05-0', 'rules.rich.json'),
];
const expectedEvidenceRuleIds = new Set([
  'UNFCCC.Agriculture.AM0073.v01-0.R-2-0002',
  'UNFCCC.Agriculture.AM0073.v01-0.R-3-0002',
  'UNFCCC.Agriculture.AM0073.v01-0.R-5-0003',
  'UNFCCC.Agriculture.AM0073.v01-0.R-7-0005',
  'UNFCCC.Agriculture.AM0073.v01-0.R-8-0005',
]);
const expectedMonitoringReportEvidence = new Map([
  [
    'UNFCCC.Agriculture.AM0073.v01-0.R-7-0005::monitoring-records',
    {
      expectation: 'Weekly aggregates reconcile with monthly monitoring reports.',
      frequency: 'monthly',
    },
  ],
  [
    'UNFCCC.Agriculture.AM0073.v01-0.R-8-0005::methane-balance-reconciliation',
    {
      expectation: 'Methane generation and consumption reconciliations submitted with monitoring reports.',
      frequency: 'annual',
    },
  ],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeScopedIngestFile() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'article6-am0073-expected-evidence-'));
  const ingestPath = path.join(tmpDir, 'ingest.am0073.yml');
  fs.writeFileSync(
    ingestPath,
    ['version: 2', 'methods:', '  - id: UNFCCC.Agriculture.AM0073', '    version: v01-0', ''].join('\n'),
    'utf8',
  );
  return { tmpDir, ingestPath };
}

function cleanupTmpDir(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
  assert.strictEqual(
    result.status,
    0,
    `${command} ${args.join(' ')} should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

function assertRulesRichSchema() {
  const rulesRichPath = path.join(am0073Dir, 'rules.rich.json');
  runCommand('./scripts/run-ajv.sh', [
    'validate',
    '-s',
    'schemas/rules.rich.schema.json',
    '-d',
    path.relative(repoRoot, rulesRichPath),
  ]);
}

function assertExpectedEvidenceContract() {
  const rulesRich = readJson(path.join(am0073Dir, 'rules.rich.json'));
  const rulesWithEvidence = rulesRich.filter(
    (rule) => Array.isArray(rule.requirement_coverage?.expected_evidence),
  );
  assert.ok(rulesWithEvidence.length > 0, 'expected AM0073 proving methodology to emit expected_evidence');
  assert.deepStrictEqual(
    new Set(rulesWithEvidence.map((rule) => rule.id)),
    expectedEvidenceRuleIds,
    'expected_evidence should be limited to the grounded proving rules',
  );

  for (const rule of rulesWithEvidence) {
    const evidence = rule.requirement_coverage.expected_evidence;
    assert.ok(Array.isArray(evidence) && evidence.length > 0, `${rule.id}: expected_evidence must be non-empty`);
    for (const item of evidence) {
      assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${rule.id}: evidence id should be stable`);
      assert.ok(typeof item.label === 'string' && item.label.length > 0, `${rule.id}: label should be present`);
      assert.ok(typeof item.description === 'string' && item.description.length > 0, `${rule.id}: description should be present`);
      assert.strictEqual(typeof item.required, 'boolean', `${rule.id}: required should be boolean`);
      const key = `${rule.id}::${item.id}`;
      const expectedMonitoringReport = expectedMonitoringReportEvidence.get(key);
      if (expectedMonitoringReport) {
        assert.deepStrictEqual(
          item.monitoring_report,
          expectedMonitoringReport,
          `${key}: monitoring_report should match the canonical proving shape`,
        );
        continue;
      }
      assert.ok(!('monitoring_report' in item), `${key}: monitoring_report should be omitted when unsupported`);
    }
  }

  const reportBoundEvidence = rulesWithEvidence.flatMap((rule) =>
    rule.requirement_coverage.expected_evidence
      .filter((item) => item.monitoring_report)
      .map((item) => `${rule.id}::${item.id}`),
  );
  assert.deepStrictEqual(
    new Set(reportBoundEvidence),
    new Set(expectedMonitoringReportEvidence.keys()),
    'monitoring_report should be limited to the grounded report-bound evidence items',
  );

  const rulesWithoutEvidence = rulesRich.filter(
    (rule) => rule.requirement_coverage && !('expected_evidence' in rule.requirement_coverage),
  );
  assert.ok(rulesWithoutEvidence.length > 0, 'expected omission path for unsupported rules');
}

function assertNoBleed() {
  for (const filePath of unrelatedAgricultureRichPaths) {
    const rules = readJson(filePath);
    const leakingRule = rules.find(
      (rule) =>
        'expected_evidence' in (rule.requirement_coverage || {}) ||
        (rule.requirement_coverage?.expected_evidence || []).some((item) => 'monitoring_report' in item),
    );
    assert.ok(!leakingRule, `${path.relative(repoRoot, filePath)} unexpectedly gained expected_evidence`);
  }
}

function runScopedIngestTwiceAndCheckHashes(baselineHashes) {
  const { tmpDir, ingestPath } = writeScopedIngestFile();
  try {
    const result = spawnSync('bash', ['scripts/ingest-scoped.sh', ingestPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${localToolBin}:${process.env.PATH || ''}`,
        SCOPED_INGEST_RUNS: '2',
        SCOPED_INGEST_ENFORCE_IDEMPOTENCY: '1',
      },
    });
    assert.strictEqual(
      result.status,
      0,
      `scoped AM0073 ingest should pass twice\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  } finally {
    cleanupTmpDir(tmpDir);
  }

  for (const [filePath, baselineHash] of baselineHashes.entries()) {
    assert.strictEqual(sha256File(filePath), baselineHash, `${path.relative(repoRoot, filePath)} changed after scoped rerun`);
  }
}

function main() {
  const trackedPaths = [
    path.join(am0073Dir, 'rules.rich.json'),
    path.join(am0073Dir, 'rules.json'),
    path.join(am0073Dir, 'sections.json'),
    path.join(am0073Dir, 'META.json'),
    ...unrelatedAgricultureRichPaths,
  ];
  const baselineHashes = new Map(trackedPaths.map((filePath) => [filePath, sha256File(filePath)]));

  assertRulesRichSchema();
  assertExpectedEvidenceContract();
  assertNoBleed();

  runScopedIngestTwiceAndCheckHashes(baselineHashes);

  assertRulesRichSchema();
  assertExpectedEvidenceContract();
  assertNoBleed();

  console.log('ok');
}

main();
