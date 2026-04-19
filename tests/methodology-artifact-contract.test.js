#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  METHODOLOGIES_ROOT,
  canonicalizeLeanRuleFromLean,
  canonicalizeLeanSection,
  classifyRulesRichMode,
  getMethodInfo,
  listMethodDirs
} = require('../core/methodology-artifact-contract.cjs');

const ROOT = path.resolve(__dirname, '..');
const MODES = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'core', 'methodology-artifact-modes.json'), 'utf8')
);

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function rulesRichModeFor(info) {
  return MODES.overrides?.[info.relPath]?.rules_rich_mode || MODES.default_rules_rich_mode;
}

function methodDirs() {
  return listMethodDirs(METHODOLOGIES_ROOT, { includePrevious: true });
}

function verifyLeanContract(methodDir) {
  const info = getMethodInfo(methodDir);
  const sectionsPath = path.join(methodDir, 'sections.json');
  const rulesPath = path.join(methodDir, 'rules.json');
  const sections = readJSON(sectionsPath).sections || [];
  const rules = readJSON(rulesPath).rules || [];
  const canonicalSections = sections.map((section) => canonicalizeLeanSection(section, info));
  const sectionLookup = new Map(canonicalSections.map((section) => [section.id, section]));

  sections.forEach((section, index) => {
    assert.equal(
      JSON.stringify(section),
      JSON.stringify(canonicalSections[index]),
      `${info.relPath} sections.json section ${section.id} drifts from canonical lean contract`
    );
  });

  const canonicalRules = rules.map((rule) => canonicalizeLeanRuleFromLean(rule, sectionLookup, info));
  rules.forEach((rule, index) => {
    assert.ok(!Object.prototype.hasOwnProperty.call(rule, 'text'), `${info.relPath} ${rule.id}: lean rules must not include text`);
    assert.equal(
      JSON.stringify(rule),
      JSON.stringify(canonicalRules[index]),
      `${info.relPath} rules.json rule ${rule.id} drifts from canonical lean contract`
    );
  });
}

function verifyRichModes(methodDir) {
  const info = getMethodInfo(methodDir);
  const rulesRich = readJSON(path.join(methodDir, 'rules.rich.json'));
  const declaredMode = rulesRichModeFor(info);
  const actualMode = classifyRulesRichMode(rulesRich);
  assert.equal(
    actualMode,
    declaredMode,
    `${info.relPath} rules.rich.json expected mode ${declaredMode} but found ${actualMode}`
  );
}

function verifyRepresentativeCrossMethodSignature() {
  const sampleDirs = [
    'UNFCCC/Agriculture/AM0073/v01-0',
    'UNFCCC/Forestry/AR-AM0014/v03-0',
    'GoldStandard/LUF/GS-00XX/v1-0'
  ];
  const signatures = sampleDirs.map((relPath) => {
    const methodDir = path.join(METHODOLOGIES_ROOT, ...relPath.split('/'));
    const sections = readJSON(path.join(methodDir, 'sections.json')).sections || [];
    const rules = readJSON(path.join(methodDir, 'rules.json')).rules || [];
    return {
      relPath,
      requiredRuleKeys: [
        'id',
        'stable_id',
        'title',
        'logic',
        'section_anchor',
        'section_id',
        'section_number',
        'section_stable_id',
        'tools'
      ].filter((key) => Object.prototype.hasOwnProperty.call(rules[0] || {}, key)),
      optionalRuleKeys: Object.keys(rules[0] || {}).filter((key) => ['expectedEvidence', 'tags', 'when'].includes(key)),
      sectionKeys: Object.keys(sections[0] || {})
    };
  });

  const baseline = signatures[0];
  signatures.slice(1).forEach((signature) => {
    assert.deepEqual(
      signature.requiredRuleKeys,
      baseline.requiredRuleKeys,
      `${signature.relPath} required rule keys do not match ${baseline.relPath}`
    );
    signature.optionalRuleKeys.forEach((key) => {
      assert.ok(['expectedEvidence', 'tags', 'when'].includes(key), `${signature.relPath} has unexpected optional rule key ${key}`);
    });
    assert.deepEqual(
      signature.sectionKeys,
      baseline.sectionKeys,
      `${signature.relPath} section key order does not match ${baseline.relPath}`
    );
  });
}

function verifyMethodInfoNormalization() {
  const activeDir = path.join(
    METHODOLOGIES_ROOT,
    'UNFCCC',
    'Agriculture',
    'ACM0010',
    'v03-0'
  );
  const previousDir = path.join(
    activeDir,
    'previous',
    'v01-0'
  );
  const viaSymlinkedTmp = activeDir.replace('/private/tmp/', '/tmp/');

  const activeInfo = getMethodInfo(activeDir);
  const previousInfo = getMethodInfo(previousDir);
  const symlinkInfo = getMethodInfo(viaSymlinkedTmp);

  assert.equal(activeInfo.methodologyId, 'UNFCCC.Agriculture.ACM0010.v03-0');
  assert.equal(previousInfo.methodologyId, 'UNFCCC.Agriculture.ACM0010.v01-0');
  assert.equal(symlinkInfo.methodologyId, activeInfo.methodologyId);
  assert.equal(previousInfo.relPath, 'UNFCCC/Agriculture/ACM0010/v01-0');
}

function verifyOverlayDerivationClearsStaleExpectedEvidence() {
  const relPath = 'GoldStandard/LUF/GS-00XX/v1-0';
  const methodDir = path.join(METHODOLOGIES_ROOT, ...relPath.split('/'));
  const rulesPath = path.join(methodDir, 'rules.json');
  const originalRulesPayload = fs.readFileSync(rulesPath, 'utf8');
  const rulesDoc = JSON.parse(originalRulesPayload);
  const staleRule = rulesDoc.rules.find((rule) => rule.id === 'R-1-0001');
  assert.ok(staleRule, `${relPath} should include overlay base rule R-1-0001`);
  assert.ok(!('expectedEvidence' in staleRule), `${relPath} baseline rule should not carry expectedEvidence`);

  staleRule.expectedEvidence = ['stale-overlay-evidence'];
  fs.writeFileSync(rulesPath, `${JSON.stringify(rulesDoc, null, 2)}\n`, 'utf8');

  try {
    const result = spawnSync(process.execPath, ['scripts/derive-lean-from-rich.js', path.join('methodologies', relPath)], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        TMPDIR: process.env.TMPDIR || os.tmpdir(),
      }
    });
    assert.equal(
      result.status,
      0,
      `overlay lean derivation should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.match(result.stdout, /OK: derived lean JSON for 1 method folder\(s\)\./);

    const regeneratedRules = readJSON(rulesPath).rules || [];
    const regeneratedRule = regeneratedRules.find((rule) => rule.id === 'R-1-0001');
    assert.ok(regeneratedRule, `${relPath} regenerated rule R-1-0001 should exist`);
    assert.ok(
      !Object.prototype.hasOwnProperty.call(regeneratedRule, 'expectedEvidence'),
      `${relPath} overlay derivation must clear stale lean expectedEvidence when rich omits it`
    );
  } finally {
    fs.writeFileSync(rulesPath, originalRulesPayload, 'utf8');
  }
}

function main() {
  for (const methodDir of methodDirs()) {
    verifyLeanContract(methodDir);
    verifyRichModes(methodDir);
  }
  verifyMethodInfoNormalization();
  verifyRepresentativeCrossMethodSignature();
  verifyOverlayDerivationClearsStaleExpectedEvidence();
  console.log(`ok methodology artifact contract (${methodDirs().length} methods)`);
}

main();
