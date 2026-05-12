#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const PLACEHOLDER_PATTERNS = [/Not specified/i, /TBD/i, /\bpending\b/i, /\bunknown\b/i];

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function isGradeA(methodDir, { allowMissingGradeFile = false } = {}) {
  const errors = [];

  const gradePath = path.join(methodDir, 'METHOD_GRADE.json');
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

  // Derive the methodology tool ref from META (e.g. "Verra/VM0047@v1-0")
  const methodologyRef = meta.references?.tools?.[0]?.doc ||
    `${meta.standard}/${meta.methodology.replace(/ .*/, '')}@${meta.version}`;

  // 1. All sections must have locator_status: source_audited
  for (const sec of sections) {
    if (sec.locator_status !== 'source_audited') {
      errors.push(`Section ${sec.id} locator_status is "${sec.locator_status}", expected "source_audited"`);
    }
    if (sec.page_start == null || sec.page_end == null) {
      errors.push(`Section ${sec.id} has null page_start or page_end`);
    }
  }

  // 2. Every rule must be source_audited
  if (draftRules.length > 0) {
    errors.push(`${draftRules.length} draft_unverified rules exist (require 0 for Grade A)`);
  }

  // 3. Every rich rule must have source_span_status: source_audited
  // 4. Every rich rule must have rule_detail.status: source_audited
  // 5. Every rich rule must have at least one non-placeholder condition
  // 6. No placeholder exception text
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

  // 7. External dependency check (exclude the method's own ref)
  for (const rule of rules) {
    for (const tool of rule.tools || []) {
      if (tool !== methodologyRef) {
        errors.push(`Unresolved external dependency: ${tool} (referenced by ${rule.id})`);
      }
    }
  }

  // 8. Grade file counts must match artifacts
  let grade;
  if (fs.existsSync(gradePath)) {
    grade = readJSON(gradePath);
    if (grade.section_count !== undefined && grade.section_count !== sections.length) {
      errors.push(`METHOD_GRADE section_count ${grade.section_count} != actual ${sections.length}`);
    }
    if (grade.rule_count !== undefined && grade.rule_count !== rules.length) {
      errors.push(`METHOD_GRADE rule_count ${grade.rule_count} != actual ${rules.length}`);
    }
    if (grade.source_audited_rule_count !== undefined && grade.source_audited_rule_count !== sourceAudited.length) {
      errors.push(`METHOD_GRADE source_audited_rule_count ${grade.source_audited_rule_count} != actual ${sourceAudited.length}`);
    }
    if (grade.draft_unverified_rule_count !== undefined && grade.draft_unverified_rule_count !== draftRules.length) {
      errors.push(`METHOD_GRADE draft_unverified_rule_count ${grade.draft_unverified_rule_count} != actual ${draftRules.length}`);
    }
    if (grade.blocked_rule_count !== undefined && grade.blocked_rule_count !== draftRules.length) {
      errors.push(`METHOD_GRADE blocked_rule_count ${grade.blocked_rule_count} != actual draft count ${draftRules.length}`);
    }
  }

  // 9. Grade A requires specific fields
  if (grade && grade.grade === 'grade_a') {
    if (grade.app_ready !== true) errors.push('Grade A claim but app_ready is not true');
    if (grade.methodology_linked_review_ready !== true) errors.push('Grade A claim but methodology_linked_review_ready is not true');
    if (grade.blocked_rule_count !== 0) errors.push(`Grade A claim but blocked_rule_count is ${grade.blocked_rule_count}`);
    if (grade.draft_unverified_rule_count !== 0) errors.push(`Grade A claim but draft_unverified_rule_count is ${grade.draft_unverified_rule_count}`);
    if (grade.unresolved_external_dependencies?.length > 0) errors.push(`Grade A claim but ${grade.unresolved_external_dependencies.length} unresolved dependencies`);
  }

  // 10. Guard against false readiness
  if (meta.methodology_linked_review_ready && draftRules.length > 0) {
    errors.push('META methodology_linked_review_ready is true but draft rules exist');
  }

  // 11. Non-grade-a cannot be Grade A
  if (grade && grade.grade !== 'grade_a') {
    errors.push(`METHOD_GRADE grade is "${grade.grade}", not "grade_a"`);
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
      console.log(`${path.relative(ROOT, dir)}: Grade A`);
    } else {
      console.log(`${path.relative(ROOT, dir)}: NOT Grade A`);
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      process.exitCode = 1;
    }
  }
}

module.exports = { isGradeA };
