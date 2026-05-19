#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const PLACEHOLDER_PATTERNS = [/Not specified/i, /TBD/i, /\bpending\b/i, /\bunknown\b/i];

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function isGradeA(methodDir) {
  const errors = [];

  const metaPath = path.join(methodDir, 'META.json');
  const secPath = path.join(methodDir, 'sections.json');
  const rulesPath = path.join(methodDir, 'rules.json');
  const richRulesPath = path.join(methodDir, 'rules.rich.json');

  if (!fs.existsSync(metaPath)) errors.push('Missing META.json');
  if (!fs.existsSync(secPath)) errors.push('Missing sections.json');
  if (!fs.existsSync(rulesPath)) errors.push('Missing rules.json');
  if (!fs.existsSync(richRulesPath)) errors.push('Missing rules.rich.json');

  if (errors.length > 0) return { gradeA: false, errors };

  const meta = readJSON(metaPath);
  const sections = readJSON(secPath).sections || [];
  const rules = readJSON(rulesPath).rules || [];
  const richRules = readJSON(richRulesPath);
  const richByStableId = new Map(richRules.map((r) => [r.stable_id, r]));

  const sourceAudited = rules.filter((r) => r.quality_status === 'source_audited');
  const draftRules = rules.filter((r) => r.quality_status === 'draft_unverified');

  const methodologyRef = meta.references?.tools?.[0]?.doc ||
    `${meta.standard}/${meta.methodology.replace(/ .*/, '')}@${meta.version}`;

  // 0. META must declare Source-Audited readiness
  if (meta.artifact_quality_standard?.adoption_status !== 'grade_a') {
    errors.push(`META adoption_status is "${meta.artifact_quality_standard?.adoption_status}", expected "grade_a"`);
  }
  if (meta.artifact_status?.rules !== 'source_audited') {
    errors.push(`META artifact_status.rules is "${meta.artifact_status?.rules}", expected "source_audited"`);
  }
  if (meta.methodology_linked_review_ready !== true) {
    errors.push('META methodology_linked_review_ready is not true');
  }

  // 1. All sections must have locator_status: source_audited
  for (const sec of sections) {
    if (sec.locator_status !== 'source_audited') {
      errors.push(`Section ${sec.id} locator_status is "${sec.locator_status}", expected "source_audited"`);
    }
    if (sec.page_start == null || sec.page_end == null) {
      errors.push(`Section ${sec.id} has null page_start or page_end`);
    }
  }

  // 2. No draft rules
  if (draftRules.length > 0) {
    errors.push(`${draftRules.length} draft_unverified rules exist (require 0 for Source-Audited)`);
  }

  // 2a. No active external_unencoded deps
  if (meta.external_dependencies?.methodology_and_tool_refs) {
    const activeDeps = meta.external_dependencies.methodology_and_tool_refs
      .filter((d) => d.status === 'external_unencoded');
    if (activeDeps.length > 0) {
      errors.push(`${activeDeps.length} active external_unencoded dependencies exist: ${activeDeps.map((d) => d.id).join(', ')}`);
    }
  }

  // 3-6. Rich rule quality checks
  for (const rule of rules) {
    const rich = richByStableId.get(rule.stable_id);
    if (!rich) {
      errors.push(`${rule.stable_id} missing from rules.rich.json`);
      continue;
    }

    if (rich.source_span_status !== 'source_audited') {
      errors.push(`${rule.stable_id} source_span_status is "${rich.source_span_status}"`);
    }
    if (rich.rule_detail?.status !== 'source_audited') {
      errors.push(`${rule.stable_id} rule_detail.status is "${rich.rule_detail?.status}"`);
    }

    const conditions = rich.rule_detail?.conditions || [];
    if (conditions.length < 1) {
      errors.push(`${rule.stable_id} has fewer than 1 condition`);
    } else {
      for (const cond of conditions) {
        if (PLACEHOLDER_PATTERNS.some((p) => p.test(cond))) {
          errors.push(`${rule.stable_id} condition contains placeholder: "${cond}"`);
        }
      }
    }

    if (rich.rule_detail?.exceptions) {
      for (const exc of rich.rule_detail.exceptions) {
        if (PLACEHOLDER_PATTERNS.some((p) => p.test(exc))) {
          errors.push(`${rule.stable_id} exceptions contain placeholder: "${exc}"`);
        }
      }
    }

    if (!rich.source_span_text || rich.source_span_text.length === 0) {
      errors.push(`${rule.stable_id} has empty source_span_text`);
    }
  }

  // 7. No unresolved external deps in rule tools (exclude own ref)
  for (const rule of rules) {
    for (const tool of rule.tools || []) {
      if (tool !== methodologyRef) {
        errors.push(`Unresolved external dependency: ${tool} (referenced by ${rule.id})`);
      }
    }
  }

  // 8. Guard against false readiness
  if (meta.methodology_linked_review_ready && draftRules.length > 0) {
    errors.push('META methodology_linked_review_ready is true but draft rules exist');
  }

  return { gradeA: errors.length === 0, errors };
}

// CLI
const args = process.argv.slice(2);
if (args.length > 0) {
  for (const arg of args) {
    const dir = path.resolve(ROOT, arg);
    const result = isGradeA(dir);
    if (result.gradeA) {
      console.log(`${path.relative(ROOT, dir)}: Source-Audited`);
    } else {
      console.log(`${path.relative(ROOT, dir)}: NOT Source-Audited`);
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      process.exitCode = 1;
    }
  }
}

module.exports = { isGradeA };
