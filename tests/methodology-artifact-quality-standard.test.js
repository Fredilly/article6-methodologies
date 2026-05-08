#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  METHODOLOGIES_ROOT,
  listMethodDirs
} = require('../core/methodology-artifact-contract.cjs');
const {
  QUALITY_REQUIRED_LEAN_RULE_FIELDS,
  QUALITY_REQUIRED_LEAN_SECTION_FIELDS,
  QUALITY_REQUIRED_RICH_RULE_FIELDS,
  QUALITY_REQUIRED_RICH_SECTION_FIELDS,
  QUALITY_STANDARD_VERSION
} = require('../core/methodology-artifact-quality.cjs');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertHasFields(object, fields, label) {
  for (const field of fields) {
    assert.ok(Object.prototype.hasOwnProperty.call(object, field), `${label} missing ${field}`);
  }
}

function main() {
  const methodDirs = listMethodDirs(METHODOLOGIES_ROOT, { includePrevious: false });
  let covered = 0;

  for (const methodDir of methodDirs) {
    const meta = readJSON(path.join(methodDir, 'META.json'));
    if (meta?.artifact_quality_standard?.version !== QUALITY_STANDARD_VERSION) continue;
    covered += 1;

    const relPath = path.relative(METHODOLOGIES_ROOT, methodDir);
    const leanSections = readJSON(path.join(methodDir, 'sections.json')).sections || [];
    const leanRules = readJSON(path.join(methodDir, 'rules.json')).rules || [];
    const richSections = readJSON(path.join(methodDir, 'sections.rich.json'));
    const richRules = readJSON(path.join(methodDir, 'rules.rich.json'));

    for (const section of leanSections) {
      assertHasFields(section, QUALITY_REQUIRED_LEAN_SECTION_FIELDS, `${relPath} sections.json ${section.id}`);
    }
    for (const rule of leanRules) {
      assertHasFields(rule, QUALITY_REQUIRED_LEAN_RULE_FIELDS, `${relPath} rules.json ${rule.id}`);
    }
    for (const section of richSections) {
      assertHasFields(section, QUALITY_REQUIRED_RICH_SECTION_FIELDS, `${relPath} sections.rich.json ${section.id}`);
      assert.ok(section.provenance && section.provenance.source_ref && section.provenance.source_hash, `${relPath} sections.rich.json ${section.id} missing provenance source_ref/source_hash`);
      assert.ok(Object.prototype.hasOwnProperty.call(section, 'page_start'), `${relPath} sections.rich.json ${section.id} missing page_start`);
      assert.ok(Object.prototype.hasOwnProperty.call(section, 'page_end'), `${relPath} sections.rich.json ${section.id} missing page_end`);
      assert.ok(Array.isArray(section.children), `${relPath} sections.rich.json ${section.id} children must be an array`);
    }
    for (const rule of richRules) {
      assertHasFields(rule, QUALITY_REQUIRED_RICH_RULE_FIELDS, `${relPath} rules.rich.json ${rule.id}`);
      assert.ok(
        Object.prototype.hasOwnProperty.call(rule, 'source_span_text') || Object.prototype.hasOwnProperty.call(rule, 'source_span_status'),
        `${relPath} rules.rich.json ${rule.id} missing source_span_text/source_span_status`
      );
      assert.ok(rule.refs && Array.isArray(rule.refs.sections) && rule.refs.sections.length >= 1, `${relPath} rules.rich.json ${rule.id} refs.sections must be populated`);
      assert.ok(rule.section_context && Object.prototype.hasOwnProperty.call(rule.section_context, 'page_start'), `${relPath} rules.rich.json ${rule.id} section_context.page_start missing`);
      assert.ok(rule.section_context && Object.prototype.hasOwnProperty.call(rule.section_context, 'page_end'), `${relPath} rules.rich.json ${rule.id} section_context.page_end missing`);
      assert.ok(rule.section_context && rule.section_context.locator_status, `${relPath} rules.rich.json ${rule.id} section_context.locator_status missing`);
      assert.ok(rule.rule_detail && rule.rule_detail.summary, `${relPath} rules.rich.json ${rule.id} rule_detail.summary missing`);
      assert.ok(rule.rule_detail && rule.rule_detail.status, `${relPath} rules.rich.json ${rule.id} rule_detail.status missing`);
      assert.ok(rule.requirement_coverage && rule.requirement_coverage.coverage_key, `${relPath} rules.rich.json ${rule.id} requirement_coverage.coverage_key missing`);
      assert.ok(rule.requirement_coverage && rule.requirement_coverage.coverage_scope, `${relPath} rules.rich.json ${rule.id} requirement_coverage.coverage_scope missing`);
      assert.ok(
        rule.requirement_coverage && (rule.requirement_coverage.expected_evidence_status || Array.isArray(rule.requirement_coverage.expected_evidence)),
        `${relPath} rules.rich.json ${rule.id} requirement_coverage must expose expected_evidence or expected_evidence_status`
      );
    }

    if (meta.methodology_linked_review_ready === true) {
      const sectionsDraft = meta.artifact_status?.sections === 'draft_unverified';
      const rulesDraft = meta.artifact_status?.rules === 'draft_unverified';
      assert.ok(!sectionsDraft && !rulesDraft, `${relPath} cannot be review-ready while artifact_status remains draft_unverified`);
    }
  }

  assert.ok(covered >= 1, 'expected at least one methodology to opt into review_contract_v1');
  console.log(`ok methodology artifact quality standard (${covered} methods)`);
}

main();
