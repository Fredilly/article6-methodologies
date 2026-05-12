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
  const gradePath = path.join(methodDir, 'METHOD_GRADE.json');
  if (!fs.existsSync(gradePath)) {
    if (allowMissingGradeFile) return { gradeA: false, errors: ['Missing METHOD_GRADE.json'] };
    return { gradeA: false, errors: ['METHOD_GRADE.json not found'] };
  }

  const errors = [];
  const grade = readJSON(gradePath);
  const metaPath = path.join(methodDir, 'META.json');
  const rulesPath = path.join(methodDir, 'rules.json');
  const richRulesPath = path.join(methodDir, 'rules.rich.json');

  if (!fs.existsSync(metaPath)) errors.push('Missing META.json');
  if (!fs.existsSync(rulesPath)) errors.push('Missing rules.json');
  if (!fs.existsSync(richRulesPath)) errors.push('Missing rules.rich.json');

  if (errors.length > 0) return { gradeA: false, errors };

  const meta = readJSON(metaPath);
  const rules = readJSON(rulesPath).rules || [];
  const richRules = readJSON(richRulesPath);
  const richByStableId = new Map(richRules.map((r) => [r.stable_id, r]));

  // Grade claim must match artifacts
  const sourceAudited = rules.filter((r) => r.quality_status === 'source_audited');
  const draftRules = rules.filter((r) => r.quality_status === 'draft_unverified');

  if (grade.grade === 'grade_a') {
    if (draftRules.length > 0) {
      errors.push(`Grade A claim with ${draftRules.length} draft_unverified rules`);
    }
    if (draftRules.length === 0 && sourceAudited.length > 0 && sourceAudited.length === rules.length) {
      // Check blocked dependencies
      const allTools = new Set();
      for (const rule of rules) {
        for (const tool of rule.tools || []) {
          if (!tool.includes(path.basename(methodDir).replace(/-/g, '@'))) {
            allTools.add(tool);
          }
        }
      }
      if (allTools.size > 0) {
        errors.push(`Grade A claim with unresolved external dependencies: ${[...allTools].join(', ')}`);
      }
    }
    if (!meta.methodology_linked_review_ready) {
      errors.push('Grade A claim but methodology_linked_review_ready is false');
    }
    if (grade.app_ready !== true) {
      errors.push('Grade A claim but app_ready is not true');
    }
  }

  // methodology_linked_review_ready guard
  if (meta.methodology_linked_review_ready && draftRules.length > 0) {
    errors.push('methodology_linked_review_ready is true but draft_unverified rules exist');
  }

  // Check for placeholder text in source-audited rich rules
  for (const rule of sourceAudited) {
    const rich = richByStableId.get(rule.stable_id);
    if (!rich) {
      errors.push(`${rule.stable_id} missing from rules.rich.json`);
      continue;
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

  // METHOD_GRADE.json counts must match artifacts
  if (grade.section_count !== undefined) {
    const sec = readJSON(path.join(methodDir, 'sections.json'));
    if (grade.section_count !== sec.sections.length) {
      errors.push(`section_count ${grade.section_count} != actual ${sec.sections.length}`);
    }
  }
  if (grade.rule_count !== undefined && grade.rule_count !== rules.length) {
    errors.push(`rule_count ${grade.rule_count} != actual ${rules.length}`);
  }
  if (grade.source_audited_rule_count !== undefined && grade.source_audited_rule_count !== sourceAudited.length) {
    errors.push(`source_audited_rule_count ${grade.source_audited_rule_count} != actual ${sourceAudited.length}`);
  }
  if (grade.draft_unverified_rule_count !== undefined && grade.draft_unverified_rule_count !== draftRules.length) {
    errors.push(`draft_unverified_rule_count ${grade.draft_unverified_rule_count} != actual ${draftRules.length}`);
  }

  // Non-grade-a methods cannot be Grade A
  if (grade.grade !== 'grade_a') {
    errors.push(`grade is "${grade.grade}", not "grade_a"`);
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
