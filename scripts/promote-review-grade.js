#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const TAXONOMY_PATH = 'config/evidence-taxonomy.json';

let exitCode = 0;

function log(level, message) {
  const tag = { ok: '  OK', warn: ' WARN', fail: ' FAIL', info: ' INFO' }[level] || '     ';
  process.stdout.write(`${tag}  ${message}\n`);
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function collectMethods() {
  const methods = [];
  function walk(dir, segments) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = path.join(dir, entry.name);
      if (entry.name === 'previous') continue;
      const metaPath = path.join(p, 'META.json');
      if (fs.existsSync(metaPath)) {
        methods.push({ dir: p, rel: path.relative(ROOT, p), metaPath, segments: [...segments, entry.name] });
      } else {
        walk(p, [...segments, entry.name]);
      }
    }
  }
  walk(path.join(ROOT, 'methodologies'), []);
  return methods;
}

function checkEligibility(method) {
  const issues = [];
  const meta = readJson(path.relative(ROOT, method.metaPath));

  // 1. META adoption_status
  const adopt = meta.artifact_quality_standard?.adoption_status;
  if (!adopt) issues.push('META missing artifact_quality_standard.adoption_status');

  // 2. Rules status
  if (meta.artifact_status?.rules !== 'source_audited') {
    issues.push(`artifact_status.rules is "${meta.artifact_status?.rules}", expected "source_audited"`);
  }

  // 3. Sections status
  if (meta.artifact_status?.sections !== 'source_audited') {
    issues.push(`artifact_status.sections is "${meta.artifact_status?.sections}", expected "source_audited"`);
  }

  // 4. Review-ready
  if (meta.methodology_linked_review_ready !== true) {
    issues.push('methodology_linked_review_ready is not true');
  }

  // 5. Source PDF
  if (meta.artifact_status?.source_pdf !== 'verified') {
    issues.push(`artifact_status.source_pdf is "${meta.artifact_status?.source_pdf}", expected "verified"`);
  }

  // 6. Sections locator_status
  const secPath = path.join(method.dir, 'sections.json');
  if (fs.existsSync(secPath)) {
    const sections = readJson(path.relative(ROOT, secPath));
    for (const sec of sections.sections || []) {
      if (sec.locator_status !== 'source_audited') {
        issues.push(`Section ${sec.id} locator_status is "${sec.locator_status}"`);
      }
    }
  }

  // 7. Rules quality_status + evidence
  const rulesPath = path.join(method.dir, 'rules.json');
  const richPath = path.join(method.dir, 'rules.rich.json');
  const rules = fs.existsSync(rulesPath) ? readJson(path.relative(ROOT, rulesPath)) : null;
  const rich = fs.existsSync(richPath) ? readJson(path.relative(ROOT, richPath)) : null;

  if (rules) {
    const draftRules = rules.rules?.filter(r => r.quality_status === 'draft_unverified') || [];
    if (draftRules.length > 0) {
      issues.push(`${draftRules.length} draft_unverified rules exist`);
    }
  }

  let rulesWithEvidence = 0;
  let totalRichRules = 0;
  if (rich && Array.isArray(rich)) {
    totalRichRules = rich.length;
    for (const rule of rich) {
      const ev = rule.requirement_coverage?.expected_evidence;
      if (ev && Array.isArray(ev) && ev.length > 0) {
        rulesWithEvidence++;
      } else {
        issues.push(`Rule ${rule.id || rule.stable_id || '(unknown)'} missing expected_evidence`);
      }
    }
  } else if (!rich) {
    issues.push('Missing rules.rich.json');
  }

  return { meta, adopt, issues, rulesWithEvidence, totalRichRules };
}

function loadTaxonomyIds() {
  try {
    const tax = readJson(TAXONOMY_PATH);
    return new Set(tax.evidence_types?.map(t => t.id) || []);
  } catch {
    return new Set();
  }
}

function main() {
  log('info', 'Review-Grade Pilot Method Pack Assessment');
  log('info', '');

  const methods = collectMethods();
  const taxonomyIds = loadTaxonomyIds();
  log('info', `Found ${methods.length} methods, taxonomy has ${taxonomyIds.size} evidence types`);
  log('info', '');

  const pilots = [];
  const eligibleNeedingEvidence = [];
  const needsWork = [];

  for (const method of methods) {
    const { adopt, issues, rulesWithEvidence, totalRichRules } = checkEligibility(method);
    const adoptStatus = adopt || 'none';
    const rel = method.rel;

    if (adoptStatus === 'review_grade') {
      if (issues.length === 0) {
        log('ok', `${rel}: review_grade pilot — ${rulesWithEvidence}/${totalRichRules} rules with evidence, no issues`);
        pilots.push(method);
      } else {
        log('fail', `${rel}: review_grade but has ${issues.length} issues`);
        issues.forEach(i => log('fail', `  ${i}`));
      }
    } else if (adoptStatus === 'grade_a' || (issues.length === 0 && totalRichRules > 0)) {
      // Source-Audited or fully audit-ready but not yet review_grade
      const evidencePct = totalRichRules > 0 ? Math.round(rulesWithEvidence / totalRichRules * 100) : 0;
      if (rulesWithEvidence === totalRichRules && totalRichRules > 0) {
        log('warn', `${rel}: eligible for review_grade (100% evidence, ${issues.length} issues) but adoption_status="${adoptStatus}"`);
        eligibleNeedingEvidence.push(method);
      } else {
        log('warn', `${rel}: source_audited but evidence ${rulesWithEvidence}/${totalRichRules} (${evidencePct}%)`);
        eligibleNeedingEvidence.push(method);
      }
    } else {
      log('info', `${rel}: adoption="${adoptStatus}" — ${issues.length > 0 ? issues.length + ' issue(s)' : 'no issues'}`);
      needsWork.push(method);
    }
  }

  log('info', '');
  log('info', '═══════════════════════════════════════════');
  log('info', 'SUMMARY');
  log('info', '═══════════════════════════════════════════');
  log('ok', `Review-Grade pilots ready:    ${pilots.length}`);
  for (const p of pilots) log('ok', `  → ${p.rel}`);

  log('warn', `Source-Audited (needs evidence): ${eligibleNeedingEvidence.length}`);
  for (const m of eligibleNeedingEvidence) {
    const { rulesWithEvidence, totalRichRules } = checkEligibility(m);
    log('warn', `  → ${m.rel}: evidence ${rulesWithEvidence}/${totalRichRules}`);
  }

  log('info', `Not review_grade ready:       ${needsWork.length}`);
  log('info', '');
  log('info', '═══════════════════════════════════════════');
  log('info', 'Next steps for each near-eligible method');
  log('info', '═══════════════════════════════════════════');

  for (const m of eligibleNeedingEvidence) {
    const { issues, rulesWithEvidence, totalRichRules } = checkEligibility(m);
    const missing = totalRichRules - rulesWithEvidence;
    log('info', `${m.rel}:`);
    if (missing > 0) log('info', `  - Populate expected_evidence for ${missing} rule(s) in rules.rich.json`);
    if (issues.length > 0) issues.forEach(i => log('info', `  - Resolve: ${i}`));
  }

  if (pilots.length === 0) {
    log('fail', 'No Review-Grade pilot method packs found');
    exitCode = 1;
  }

  process.exit(exitCode);
}

main();
