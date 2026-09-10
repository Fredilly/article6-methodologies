#!/usr/bin/env node
'use strict';

/**
 * audit-source-spans.js
 *
 * Validates that every rule in a methodology's rules.rich.json has a
 * source_span_text that maps correctly to the PDF section declared in
 * its primary_section, using the parallel governance section-map.json
 * as the contract.
 *
 * Usage:
 *   node scripts/audit-source-spans.js <methodology-dir>
 *
 * Example:
 *   node scripts/audit-source-spans.js methodologies/Verra/AFOLU/VM0007/v1-8/
 *
 * Required files:
 *   - <methodology-dir>/rules.rich.json
 *   - governance/<same registry/domain/component/version>/section-map.json
 *
 * The section-map.json defines:
 *   {
 *     "S-1": { "pdf_sections": ["4"], "title": "..." },
 *     "exceptions": [
 *       { "rule_id": "R-3-0005", "allowed_pdf_sections": ["8.1.2"], "reason": "..." }
 *     ]
 *   }
 *
 * Exits with code 0 if all rules pass, 1 if any fail.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function governanceSupportDir(methodologyDir) {
  const rel = path.relative(path.join(ROOT, 'methodologies'), methodologyDir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`methodology directory must be under ${path.join(ROOT, 'methodologies')}`);
  }
  return path.join(ROOT, 'governance', rel);
}

function isBadString(text) {
  const bad = ['mayVM0007', 'VM0007,must', '17F', '18F', '\f'];
  for (const pattern of bad) {
    if (text.includes(pattern)) return pattern;
  }
  return null;
}

function endsWell(text) {
  if (!text || !text.length) return false;
  const last = text.trimEnd();
  if (!last.length) return false;
  const goodEndings = ['.', '!', ':', ';', '"', ')', '}', ']'];
  const lastChar = last[last.length - 1];
  if (goodEndings.includes(lastChar)) return true;
  if (last.match(/^[\s]*[•\-*\d]+[.)]?\s/)) return true;
  return false;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/audit-source-spans.js <methodology-dir>');
    process.exit(1);
  }

  const mDir = path.resolve(ROOT, args[0]);
  const rulesPath = path.join(mDir, 'rules.rich.json');
  const mapPath = path.join(governanceSupportDir(mDir), 'section-map.json');

  if (!fs.existsSync(rulesPath)) {
    console.error(`FAIL: rules.rich.json not found at ${rulesPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(mapPath)) {
    console.error(`FAIL: governance section-map.json not found at ${mapPath}`);
    console.error('  Create the section map under the parallel governance support directory.');
    process.exit(1);
  }

  const rules = readJSON(rulesPath);
  const sectionMap = readJSON(mapPath);
  const { exceptions = [] } = sectionMap;

  const exceptionLookup = {};
  for (const exc of exceptions) {
    exceptionLookup[exc.rule_id] = new Set(exc.allowed_pdf_sections || []);
  }

  let failures = 0;
  let total = 0;
  const lines = [];

  for (const rule of rules) {
    const rid = rule.id.split('.').pop();
    const refs = rule.refs || {};
    const primarySection = refs.primary_section;
    const ruleSectionNum = refs.section_number;
    const span = rule.source_span_text;
    const ruleProblems = [];

    total++;

    if (!span || !span.trim()) ruleProblems.push('MISSING_SOURCE_SPAN');

    if (span) {
      const bad = isBadString(span);
      if (bad) ruleProblems.push(`BAD_STRING:${bad}`);
    }

    if (span && span.trim() && span.trim()[0] === span.trim()[0].toLowerCase() &&
        !/[•\-*\d]/.test(span.trim()[0])) {
      ruleProblems.push('MID_SENTENCE_START');
    }

    if (primarySection && sectionMap[primarySection]) {
      const allowed = sectionMap[primarySection].pdf_sections || [];
      if (allowed.length > 0 && ruleSectionNum) {
        const excAllowed = exceptionLookup[rid];
        const isException = excAllowed && excAllowed.size > 0;

        if (!allowed.includes(ruleSectionNum)) {
          if (!isException) {
            ruleProblems.push(
              `SECTION_MISMATCH: ${primarySection} expects ${allowed.join(',')} but rule has section_number=${ruleSectionNum}`
            );
          } else {
            const spanStartsWithException = [...excAllowed].some(exc =>
              span && span.trim().startsWith(exc)
            );
            if (!spanStartsWithException) {
              ruleProblems.push(
                `EXCEPTION_VIOLATION: ${rid} allowed to quote ${[...excAllowed].join(',')} but span starts with "${span ? span.trim().substring(0, 30) : '(none)'}"`
              );
            }
          }
        }
      }
    } else if (primarySection) {
      ruleProblems.push(`UNKNOWN_SECTION: ${primarySection} not in section-map`);
    }

    if (span && !endsWell(span)) {
      const lastLine = span.split('\n').filter(l => l.trim()).pop() || '';
      const trimmed = lastLine.trim();
      if (trimmed.length > 3 && !trimmed.match(/^[\s]*[•\-*\d]+[.)]?\s/)) {
        ruleProblems.push(`POSSIBLE_TRUNCATION: ends with "${trimmed.slice(-40)}"`);
      }
    }

    if (ruleProblems.length > 0) {
      failures++;
      lines.push(`FAIL  ${rid.padEnd(16)} ${ruleProblems.join('; ')}`);
    } else {
      lines.push(`PASS  ${rid.padEnd(16)} -`);
    }
  }

  console.log(`\n=== Source-Span Audit (${path.relative(ROOT, mDir)}) ===`);
  console.log(`Total rules: ${total}`);
  for (const line of lines) console.log(line);

  const pass = total - failures;
  const pct = total > 0 ? (pass / total * 100).toFixed(1) : '0.0';
  console.log(`\n${pass}/${total} passed (${pct}%)`);

  if (failures > 0) {
    console.log(`FAILED: ${failures} rule(s) have issues.`);
    process.exit(1);
  }
  console.log('ALL PASSED.');
}

main();
