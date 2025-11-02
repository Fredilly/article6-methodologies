#!/usr/bin/env bash
set -euo pipefail

node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const offenders = [];

function walk(dir, matcher, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, matcher, out);
    } else if (matcher.test(entry.name)) {
      out.push(full);
    }
  }
}

function readJson(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return { data: JSON.parse(text), raw: text };
  } catch (err) {
    offenders.push({ file, reason: `invalid JSON (${err.message})` });
    return null;
  }
}

function checkSections(file) {
  const payload = readJson(file);
  if (!payload) return;
  let sections = payload.data;
  if (!Array.isArray(sections) && sections && Array.isArray(sections.sections)) {
    sections = sections.sections;
  }
  if (!Array.isArray(sections)) {
    offenders.push({ file, reason: 'unexpected sections structure' });
    return;
  }
  if (/TODO/i.test(payload.raw)) {
    offenders.push({ file, reason: 'contains TODO placeholder' });
    return;
  }
  if (sections.length < 2) {
    offenders.push({ file, reason: 'fewer than 2 sections' });
    return;
  }
}

function checkRules(file) {
  const payload = readJson(file);
  if (!payload) return;
  let rules = payload.data;
  if (!Array.isArray(rules) && rules && Array.isArray(rules.rules)) {
    rules = rules.rules;
  }
  if (!Array.isArray(rules)) {
    offenders.push({ file, reason: 'unexpected rules structure' });
    return;
  }
  if (/TODO/i.test(payload.raw)) {
    offenders.push({ file, reason: 'contains TODO placeholder' });
    return;
  }
  if (rules.length === 0) {
    offenders.push({ file, reason: 'no rules found' });
    return;
  }
  if (rules.length === 1) {
    const rule = rules[0] || {};
    const requirement = typeof rule.requirement === 'string' ? rule.requirement.trim() : '';
    const title = typeof rule.title === 'string' ? rule.title.trim() : '';
    if (!requirement || /document-level requirements/i.test(title)) {
      offenders.push({ file, reason: 'single-entry stub rule set' });
    }
  }
}

const sectionFiles = [];
const ruleFiles = [];
const base = path.join(root, 'methodologies', 'UNFCCC');
if (fs.existsSync(base)) {
  walk(base, /^sections\.rich\.json$/i, sectionFiles);
  walk(base, /^rules\.rich\.json$/i, ruleFiles);
}

for (const file of sectionFiles) checkSections(file);
for (const file of ruleFiles) checkRules(file);

if (offenders.length) {
  console.error('[check-no-stubs] placeholder content detected:');
  for (const off of offenders) {
    console.error(` - ${path.relative(root, off.file)} (${off.reason})`);
  }
  process.exit(2);
}

console.log('[check-no-stubs] ok');
NODE
