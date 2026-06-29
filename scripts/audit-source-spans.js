#!/usr/bin/env node
'use strict';

/**
 * audit-source-spans.js
 *
 * Validates that every rule in a methodology's rules.rich.json has a
 * source_span_text that maps correctly to the PDF section declared in
 * its primary_section, using section-map.json as the contract.
 *
 * Usage:
 *   node scripts/audit-source-spans.js <methodology-dir>
 *
 * Example:
 *   node scripts/audit-source-spans.js methodologies/Verra/AFOLU/VM0007/v1-8/
 *
 * Required files (under methodology-dir):
 *   - rules.rich.json
 *   - section-map.json
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

// ── Config ──────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');

// ── Helpers ─────────────────────────────────────────────────────────────────
function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
  // Allow bullet lists and list items ending mid-line
  if (last.match(/^[\s]*[•\-*\d]+[.)]?\s/)) return true;
  return false;
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/audit-source-spans.js <methodology-dir>');
    process.exit(1);
  }

  const mDir = path.resolve(ROOT, args[0]);

  // 1. Load required files
  const rulesPath = path.join(mDir, 'rules.rich.json');
  const mapPath = path.join(mDir, 'section-map.json');

  if (!fs.existsSync(rulesPath)) {
    console.error(`FAIL: rules.rich.json not found at ${rulesPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(mapPath)) {
    console.error(`FAIL: section-map.json not found at ${mapPath}`);
    console.error('  Create a section-map.json with the section-to-PDF mapping.');
    process.exit(1);
  }

  const rules = readJSON(rulesPath);
  const sectionMap = readJSON(mapPath);

  const methodName = path.basename(path.dirname(rulesPath)) + '/' +
    path.basename(rulesPath);
  const { exceptions = [] } = sectionMap;

  // Build lookup: rule_id -> allowed_pdf_sections set
  const exceptionLookup = {};
  for (const exc of exceptions) {
    exceptionLookup[exc.rule_id] = new Set(exc.allowed_pdf_sections || []);
  }

  // 2. Audit each rule
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

    // R1: source_span_text must exist
    if (!span || !span.trim()) {
      ruleProblems.push('MISSING_SOURCE_SPAN');
    }

    // R2: No bad strings
    if (span) {
      const bad = isBadString(span);
      if (bad) ruleProblems.push(`BAD_STRING:${bad}`);
    }

    // R3: No mid-sentence starts
    if (span && span.trim() && span.trim()[0] === span.trim()[0].toLowerCase() &&
        !/[•\-*\d]/.test(span.trim()[0])) {
      ruleProblems.push('MID_SENTENCE_START');
    }

    // R4: Source section must exist in section-map
    if (primarySection && sectionMap[primarySection]) {
      // R4a: Rule section_number must match one of the mapped PDF sections
      const allowed = sectionMap[primarySection].pdf_sections || [];
      if (allowed.length > 0 && ruleSectionNum) {
        const excAllowed = exceptionLookup[rid];
        const isException = excAllowed && excAllowed.size > 0;

        // Check if rule's section_number is in the map for primarySection
        if (!allowed.includes(ruleSectionNum)) {
          if (!isException) {
            ruleProblems.push(
              `SECTION_MISMATCH: ${primarySection} expects ${allowed.join(',')} but rule has section_number=${ruleSectionNum}`
            );
          } else {
            // Even with exception, the source_span_text should reference
            // one of the allowed PDF sub-sections
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

    // R5: Check for truncated text
    if (span && !endsWell(span)) {
      const lastLine = span.split('\n').filter(l => l.trim()).pop() || '';
      const trimmed = lastLine.trim();
      // Allow bullet items and short headings
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

  // 3. Report
  console.log(`\n=== Source-Span Audit (${path.relative(ROOT, mDir)}) ===`);
  console.log(`Total rules: ${total}`);
  for (const line of lines) {
    console.log(line);
  }

  const pass = total - failures;
  const pct = total > 0 ? (pass / total * 100).toFixed(1) : '0.0';
  console.log(`\n${pass}/${total} passed (${pct}%)`);

  if (failures > 0) {
    console.log(`FAILED: ${failures} rule(s) have issues.`);
    process.exit(1);
  } else {
    console.log('ALL PASSED.');
    process.exit(0);
  }
}

main();
