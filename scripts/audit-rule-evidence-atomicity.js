#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { sourceRefLooksComposite } = require('./check-governance-source-resolution');

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: node scripts/audit-rule-evidence-atomicity.js <methodology-dir>');
    process.exit(2);
  }

  const methodDir = path.resolve(args[0]);
  const rulesPath = path.join(methodDir, 'rules.rich.json');
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  const findings = [];

  for (const rule of rules) {
    const sourceRef = normalize(rule?.provenance?.source_ref);
    if (!sourceRefLooksComposite(sourceRef)) continue;
    const clauses = rule?.refs?.requirement_clauses;
    if (Array.isArray(clauses) && clauses.length >= 2) continue;
    findings.push({
      id: rule.id || rule.stable_id,
      source_ref: sourceRef,
      lines: Array.isArray(rule?.refs?.lines) ? rule.refs.lines : [],
      logic: normalize(rule.logic),
      source_span_text: normalize(rule.source_span_text)
    });
  }

  console.log(JSON.stringify({
    methodology: args[0],
    composite_rule_count: findings.length,
    findings
  }, null, 2));

  if (findings.length) process.exit(1);
}

main();
