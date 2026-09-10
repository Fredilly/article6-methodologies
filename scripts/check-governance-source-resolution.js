#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LINE_REF = /^(.+)#L(\d+)-L(\d+)$/;
const GOVERNED_STATES = new Set(['PROVENANCE_COMPLETE', 'RETRIEVAL_TESTED', 'VERIFIED']);
const SOURCE_RESOLUTION_CONTRACT = 'governed-text-v1';

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalize(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLineRef(ref) {
  const match = LINE_REF.exec(String(ref || ''));
  if (!match) return null;
  const start = Number(match[2]);
  const end = Number(match[3]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
  return { repoPath: match[1], start, end };
}

function resolveLineRef(ref) {
  const parsed = parseLineRef(ref);
  if (!parsed) return { error: `invalid line reference ${JSON.stringify(ref)}` };

  const absolute = path.resolve(ROOT, parsed.repoPath);
  if (!absolute.startsWith(ROOT + path.sep)) {
    return { error: `line reference escapes repository: ${ref}` };
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return { error: `referenced source text does not exist: ${parsed.repoPath}` };
  }

  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  if (parsed.end > lines.length) {
    return { error: `line reference ${ref} exceeds ${lines.length} lines` };
  }

  return {
    repoPath: parsed.repoPath,
    start: parsed.start,
    end: parsed.end,
    text: lines.slice(parsed.start - 1, parsed.end).join('\n')
  };
}

function evidenceQuotes(record, ruleMode) {
  const locators = ruleMode ? record.refs?.locators : record.locators;
  if (!Array.isArray(locators)) return [];
  return locators
    .map((locator) => normalize(locator && locator.quote))
    .filter(Boolean);
}

function lineRefs(record, ruleMode) {
  const refs = ruleMode ? record.refs?.lines : record.provenance?.lines;
  return Array.isArray(refs) ? refs.filter((value) => typeof value === 'string' && value.trim()) : [];
}

function sourceRefLooksComposite(sourceRef) {
  const ref = normalize(sourceRef);
  if (!ref) return false;
  return (
    /\bitems?\s+\d+\s*[-–]\s*\d+/i.test(ref) ||
    /\bitems?\s+\d+\s*(?:,|and)\s*\d+/i.test(ref) ||
    /¶\s*\d+\s*[-–]\s*\d+/i.test(ref) ||
    /\bparagraphs?\s+\d+\s*[-–]\s*\d+/i.test(ref) ||
    /\b(?:and|&)\s+table\s+\d+/i.test(ref)
  );
}

function validateClauseEvidence(rule, label, failures) {
  const sourceRef = rule?.provenance?.source_ref;
  if (!sourceRefLooksComposite(sourceRef)) return;

  const clauses = rule?.refs?.requirement_clauses;
  if (!Array.isArray(clauses) || clauses.length < 2) {
    failures.push(`${label}: composite source locator ${JSON.stringify(sourceRef)} requires clause-level refs.requirement_clauses evidence or must be split into atomic rules`);
    return;
  }

  const ids = new Set();
  for (const clause of clauses) {
    const clauseId = normalize(clause?.id);
    const normalizedRequirement = normalize(clause?.normalized_requirement);
    const sourceSpan = normalize(clause?.source_span_text);
    const refs = Array.isArray(clause?.lines) ? clause.lines.filter((value) => typeof value === 'string' && value.trim()) : [];
    const quotes = Array.isArray(clause?.locators)
      ? clause.locators.map((locator) => normalize(locator && locator.quote)).filter(Boolean)
      : [];
    const clauseLabel = `${label}: clause ${clauseId || '(missing-id)'}`;

    if (!clauseId) failures.push(`${clauseLabel}: missing stable clause id`);
    else if (ids.has(clauseId)) failures.push(`${clauseLabel}: duplicate clause id`);
    else ids.add(clauseId);

    if (!normalizedRequirement) failures.push(`${clauseLabel}: missing normalized_requirement`);
    if (!sourceSpan) failures.push(`${clauseLabel}: missing source_span_text`);
    if (refs.length === 0) failures.push(`${clauseLabel}: missing exact governed-text line reference`);
    if (quotes.length === 0) failures.push(`${clauseLabel}: missing exact evidence quote locator`);

    const resolved = [];
    for (const ref of refs) {
      const result = resolveLineRef(ref);
      if (result.error) failures.push(`${clauseLabel}: ${result.error}`);
      else resolved.push(result);
    }
    if (resolved.length === 0) continue;

    const resolvedText = normalize(resolved.map((item) => item.text).join('\n'));
    for (const quote of quotes) {
      if (!resolvedText.includes(quote)) {
        failures.push(`${clauseLabel}: evidence quote is not present in resolved governed-text span`);
      }
    }
    if (sourceSpan && !resolvedText.includes(sourceSpan)) {
      failures.push(`${clauseLabel}: source_span_text is not present in resolved governed-text span`);
    }
  }
}

function validateResolvableEvidence(record, label, ruleMode, failures) {
  const refs = lineRefs(record, ruleMode);
  const quotes = evidenceQuotes(record, ruleMode);

  if (refs.length === 0) {
    failures.push(`${label}: missing exact governed-text line reference`);
    return;
  }
  if (quotes.length === 0) {
    failures.push(`${label}: missing exact evidence quote locator`);
    return;
  }

  const resolved = [];
  for (const ref of refs) {
    const result = resolveLineRef(ref);
    if (result.error) failures.push(`${label}: ${result.error}`);
    else resolved.push(result);
  }
  if (resolved.length === 0) return;

  const resolvedText = normalize(resolved.map((item) => item.text).join('\n'));
  for (const quote of quotes) {
    if (!resolvedText.includes(quote)) {
      failures.push(`${label}: evidence quote is not present in resolved governed-text span`);
    }
  }

  if (ruleMode) {
    const sourceSpan = normalize(record.source_span_text);
    if (!sourceSpan) {
      failures.push(`${label}: missing source_span_text`);
    } else if (!resolvedText.includes(sourceSpan)) {
      failures.push(`${label}: source_span_text is not present in resolved governed-text span`);
    }
    validateClauseEvidence(record, label, failures);
  } else if (resolvedText.length < 20) {
    failures.push(`${label}: resolved section content is not substantive`);
  }
}

function validateComponent(componentDir) {
  const absoluteDir = path.resolve(ROOT, componentDir);
  const metaPath = path.join(absoluteDir, 'META.json');
  const sectionsPath = path.join(absoluteDir, 'sections.rich.json');
  const rulesPath = path.join(absoluteDir, 'rules.rich.json');
  const failures = [];

  if (!fs.existsSync(metaPath)) return failures;
  const meta = readJSON(metaPath);
  const governance = meta?.governance_v1 || {};

  // The stronger invariant is forward-compatible and explicit. Legacy
  // governance records are not silently re-graded by a contract introduced
  // after their promotion. Any component that opts into this contract is
  // fully enforced once it reaches a governed promotion state.
  if (governance.source_resolution_contract !== SOURCE_RESOLUTION_CONTRACT) return failures;

  const state = governance.state;
  if (!GOVERNED_STATES.has(state)) return failures;

  for (const required of [sectionsPath, rulesPath]) {
    if (!fs.existsSync(required)) failures.push(`${path.relative(ROOT, absoluteDir)}: missing ${path.basename(required)}`);
  }
  if (failures.length) return failures;

  if (state === 'VERIFIED' && governance.verified !== true) {
    failures.push(`${componentDir}: VERIFIED state requires governance_v1.verified=true`);
  }
  if (state !== 'VERIFIED' && governance.verified === true) {
    failures.push(`${componentDir}: governance_v1.verified=true is invalid outside VERIFIED state`);
  }

  const sourceHash = meta?.audit_hashes?.source_pdf_sha256;
  if (!/^[a-f0-9]{64}$/.test(String(sourceHash || ''))) {
    failures.push(`${componentDir}: governed component is missing audit_hashes.source_pdf_sha256`);
  }

  const sections = readJSON(sectionsPath);
  for (const section of sections) {
    const label = `${componentDir}: section ${section.id || '(unknown)'}`;
    if (section.source_span_status !== 'source_audited') continue;
    if (section.provenance?.source_hash !== sourceHash) {
      failures.push(`${label}: provenance.source_hash does not match governed source PDF hash`);
    }
    validateResolvableEvidence(section, label, false, failures);
  }

  const rules = readJSON(rulesPath);
  for (const rule of rules) {
    const label = `${componentDir}: rule ${rule.id || rule.stable_id || '(unknown)'}`;
    if (rule.source_span_status !== 'source_audited') continue;
    if (rule.provenance?.source_hash !== sourceHash) {
      failures.push(`${label}: provenance.source_hash does not match governed source PDF hash`);
    }
    validateResolvableEvidence(rule, label, true, failures);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/check-governance-source-resolution.js <methodology-dir> [methodology-dir ...]');
    process.exit(2);
  }

  const failures = args.flatMap(validateComponent);
  if (failures.length) {
    console.error('Governance source-resolution invariant failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log(`Governance source-resolution invariant passed for ${args.length} component(s).`);
}

if (require.main === module) main();

module.exports = {
  normalize,
  parseLineRef,
  resolveLineRef,
  sourceRefLooksComposite,
  validateClauseEvidence,
  validateComponent
};
