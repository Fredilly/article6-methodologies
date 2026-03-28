#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const am0073Dir = path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AM0073', 'v01-0');
const unrelatedAgricultureRichPaths = [
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'ACM0010', 'v03-0', 'rules.rich.json'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AMS-III.D', 'v21-0', 'rules.rich.json'),
  path.join(repoRoot, 'methodologies', 'UNFCCC', 'Agriculture', 'AMS-III.R', 'v05-0', 'rules.rich.json'),
];

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeScopedIngestFile() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'article6-am0073-proof-'));
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

function assertRulesRichCoverageContract() {
  const rulesRichPath = path.join(am0073Dir, 'rules.rich.json');
  const sectionsRichPath = path.join(am0073Dir, 'sections.rich.json');
  const rulesRich = readJson(rulesRichPath);
  const sectionsRich = readJson(sectionsRichPath);
  const sectionIds = new Set(sectionsRich.map((section) => section.id));
  const schemaValidation = spawnSync(
    './scripts/run-ajv.sh',
    ['validate', '-s', 'schemas/rules.rich.schema.json', '-d', path.relative(repoRoot, rulesRichPath)],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.strictEqual(
    schemaValidation.status,
    0,
    `rules.rich schema validation should pass\nstdout:\n${schemaValidation.stdout}\nstderr:\n${schemaValidation.stderr}`,
  );

  const coveredRules = rulesRich.filter((rule) => rule.requirement_coverage);
  assert.ok(coveredRules.length > 0, 'expected AM0073 proving methodology to contain requirement_coverage');

  for (const rule of coveredRules) {
    const coverage = rule.requirement_coverage;
    assert.strictEqual(coverage.coverage_scope, 'rule', `${rule.id}: coverage_scope must be "rule"`);
    assert.strictEqual(coverage.coverage_key, rule.id, `${rule.id}: coverage_key must stay stable`);
    assert.ok(Array.isArray(coverage.section_refs), `${rule.id}: section_refs should be emitted when derivable`);
    assert.ok(coverage.section_refs.length > 0, `${rule.id}: section_refs should be non-empty when emitted`);
    for (const ref of coverage.section_refs) {
      assert.strictEqual(ref.relationship, 'source_section', `${rule.id}: relationship must stay canonical`);
      assert.ok(sectionIds.has(ref.section_id), `${rule.id}: unknown section ref ${ref.section_id}`);
      assert.ok(
        Array.isArray(rule.refs?.sections) && rule.refs.sections.includes(ref.section_id),
        `${rule.id}: section_refs must align with existing rule.refs.sections`,
      );
    }
  }
}

function assertUnrelatedAgricultureHasNoRequirementCoverage() {
  for (const filePath of unrelatedAgricultureRichPaths) {
    const rules = readJson(filePath);
    const leakingRule = rules.find((rule) => rule.requirement_coverage);
    assert.ok(!leakingRule, `${path.relative(repoRoot, filePath)} unexpectedly gained requirement_coverage`);
  }
}

function runScopedGenerationTwice() {
  const yqCheck = spawnSync('sh', ['-lc', 'command -v yq >/dev/null 2>&1'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (yqCheck.status !== 0) {
    return;
  }

  const { tmpDir, ingestPath } = writeScopedIngestFile();
  try {
    const result = spawnSync('bash', ['scripts/ingest-scoped.sh', ingestPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
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

  assertRulesRichCoverageContract();
  assertUnrelatedAgricultureHasNoRequirementCoverage();

  runScopedGenerationTwice();

  assertRulesRichCoverageContract();
  assertUnrelatedAgricultureHasNoRequirementCoverage();

  for (const [filePath, baselineHash] of baselineHashes.entries()) {
    assert.strictEqual(sha256File(filePath), baselineHash, `${path.relative(repoRoot, filePath)} changed after rerun`);
  }

  console.log('ok');
}

main();
