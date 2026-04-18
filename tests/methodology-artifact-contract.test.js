#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

function main() {
  for (const methodDir of methodDirs()) {
    verifyLeanContract(methodDir);
    verifyRichModes(methodDir);
  }
  verifyMethodInfoNormalization();
  verifyRepresentativeCrossMethodSignature();
  console.log(`ok methodology artifact contract (${methodDirs().length} methods)`);
}

main();
