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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'article6-am0073-rule-detail-'));
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

function assertRulesRichContract() {
  const rulesRichPath = path.join(am0073Dir, 'rules.rich.json');
  const sectionsRichPath = path.join(am0073Dir, 'sections.rich.json');
  const rulesRich = readJson(rulesRichPath);
  const sectionsRich = readJson(sectionsRichPath);
  const sectionById = new Map(sectionsRich.map((section) => [section.id, section]));
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
      assert.ok(sectionById.has(ref.section_id), `${rule.id}: unknown section ref ${ref.section_id}`);
      assert.ok(
        Array.isArray(rule.refs?.sections) && rule.refs.sections.includes(ref.section_id),
        `${rule.id}: section_refs must align with existing rule.refs.sections`,
      );
    }

    assert.strictEqual(rule.requirement_text, rule.logic, `${rule.id}: requirement_text should stay grounded in logic`);
    assert.strictEqual(rule.requirement_kind, rule.type, `${rule.id}: requirement_kind should stay grounded in type`);

    assert.ok(rule.section_context, `${rule.id}: section_context should be present for the proving case`);
    assert.strictEqual(rule.section_context.section_id, coverage.section_refs[0].section_id, `${rule.id}: section_context section id mismatch`);
    assert.strictEqual(rule.section_context.section_ref, rule.section_context.section_id, `${rule.id}: section_ref should stay canonical`);
    assert.strictEqual(
      rule.section_context.section_title,
      sectionById.get(rule.section_context.section_id).title,
      `${rule.id}: section_title should match sections.rich`,
    );

    assert.ok(rule.rule_detail, `${rule.id}: rule_detail should be present for the proving case`);
    assert.strictEqual(rule.rule_detail.summary, rule.summary, `${rule.id}: rule_detail.summary should mirror summary`);
    assert.deepStrictEqual(rule.rule_detail.conditions, rule.when, `${rule.id}: rule_detail.conditions should mirror when`);

    assert.ok(!('outputs' in rule.rule_detail), `${rule.id}: outputs should be omitted when unsupported`);
    assert.ok(!('exceptions' in rule.rule_detail), `${rule.id}: exceptions should be omitted when unsupported`);
    assert.ok(!('source_span_text' in rule), `${rule.id}: source_span_text should be omitted when unsupported`);
  }
}

function assertUnrelatedAgricultureHasNoRicherRuleDetail() {
  for (const filePath of unrelatedAgricultureRichPaths) {
    const rules = readJson(filePath);
    const leakingRule = rules.find(
      (rule) =>
        rule.requirement_coverage ||
        rule.requirement_text ||
        rule.requirement_kind ||
        rule.section_context ||
        rule.rule_detail ||
        rule.source_span_text,
    );
    assert.ok(!leakingRule, `${path.relative(repoRoot, filePath)} unexpectedly gained AM0073-only rich rule detail`);
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

  assertRulesRichContract();
  assertUnrelatedAgricultureHasNoRicherRuleDetail();

  runScopedGenerationTwice();

  assertRulesRichContract();
  assertUnrelatedAgricultureHasNoRicherRuleDetail();

  for (const [filePath, baselineHash] of baselineHashes.entries()) {
    assert.strictEqual(sha256File(filePath), baselineHash, `${path.relative(repoRoot, filePath)} changed after rerun`);
  }

  console.log('ok');
}

main();
