#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadClauseEvidence,
  sourceRefLooksComposite,
  validateClauseEvidence
} = require('./check-governance-source-resolution');

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: node scripts/audit-rule-evidence-atomicity.js <methodology-dir>');
    process.exit(2);
  }

  const methodDir = path.resolve(args[0]);
  const metaPath = path.join(methodDir, 'META.json');
  const rulesPath = path.join(methodDir, 'rules.rich.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  const clauseEvidence = loadClauseEvidence(methodDir, meta)?.evidence || null;
  const sourceHash = meta?.audit_hashes?.source_pdf_sha256;
  const failures = [];
  let compositeRuleCount = 0;

  for (const rule of rules) {
    if (!sourceRefLooksComposite(rule?.provenance?.source_ref)) continue;
    compositeRuleCount += 1;
    const label = `${args[0]}: rule ${rule.id || rule.stable_id || '(unknown)'}`;
    validateClauseEvidence(rule, label, clauseEvidence, sourceHash, failures);
  }

  const knownRuleIds = new Set(rules.map((rule) => rule.id || rule.stable_id));
  for (const evidenceRuleId of Object.keys(clauseEvidence?.rules || {})) {
    if (!knownRuleIds.has(evidenceRuleId)) {
      failures.push(`${args[0]}: clause evidence references unknown rule ${evidenceRuleId}`);
    }
  }

  console.log(JSON.stringify({
    methodology: args[0],
    composite_rule_count: compositeRuleCount,
    governed_clause_rule_count: Object.keys(clauseEvidence?.rules || {}).length,
    failure_count: failures.length,
    failures
  }, null, 2));

  if (failures.length) process.exit(1);
}

main();
