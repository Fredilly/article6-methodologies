#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'core', 'forestry-guardrails.json');
const GUARDS = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listRuleIds(rules) {
  return rules.map((rule) => rule.id);
}

function simpleIdFromRich(richId) {
  const parts = String(richId || '').split('.');
  return parts[parts.length - 1];
}

function ensureMonotonic(ids, methodKey, failures) {
  let expected = 1;
  for (const id of ids) {
    const match = /^R-1-(\d+)$/.exec(String(id));
    if (!match) {
      failures.push(`${methodKey}: rule id ${id} does not match R-1-XXXX format`);
      continue;
    }
    const numeric = parseInt(match[1], 10);
    if (numeric !== expected) {
      failures.push(`${methodKey}: rule id ${id} is out of sequence (expected ${expected})`);
    }
    expected += 1;
  }
}

function ensureSections(leanRules, sections, requiredSections, methodKey, failures) {
  const sectionIds = new Set(sections.map((section) => section.id));
  const counts = new Map();
  for (const rule of leanRules) {
    if (!sectionIds.has(rule.section_id)) {
      failures.push(`${methodKey}: rule ${rule.id} references unknown section ${rule.section_id}`);
    }
    counts.set(rule.section_id, (counts.get(rule.section_id) || 0) + 1);
  }
  for (const sectionId of requiredSections) {
    if ((counts.get(sectionId) || 0) === 0) {
      failures.push(`${methodKey}: section ${sectionId} has no rules`);
    }
  }
}

function ensureParity(leanRules, richRules, methodKey, failures) {
  const leanById = new Map();
  for (const rule of leanRules) {
    leanById.set(rule.id, rule);
  }
  for (const richRule of richRules) {
    const id = simpleIdFromRich(richRule.id);
    if (!leanById.has(id)) {
      failures.push(`${methodKey}: rules.rich.json contains ${richRule.id} but lean rules.json is missing ${id}`);
      continue;
    }
    const leanRule = leanById.get(id);
    if (typeof leanRule.title !== 'string' || !leanRule.title.trim()) {
      failures.push(`${methodKey}: rule ${id} missing title in rules.json`);
    }
    if (!Array.isArray(leanRule.inputs)) {
      failures.push(`${methodKey}: rule ${id} missing inputs array in rules.json`);
    }
    if (!Array.isArray(leanRule.when)) {
      failures.push(`${methodKey}: rule ${id} missing when array in rules.json`);
    }
  }
}

function ensureTools(leanRules, richRules, metaTools, methodKey, failures) {
  const toolSet = new Set(metaTools.map((t) => t.doc).filter(Boolean));
  const check = (doc, context) => {
    if (!toolSet.has(doc)) {
      failures.push(`${methodKey}: ${context} references tool ${doc} not present in META.references.tools`);
    }
  };
  leanRules.forEach((rule) => {
    if (Array.isArray(rule.tools)) {
      rule.tools.forEach((doc) => check(doc, `rules.json ${rule.id}`));
    }
  });
  richRules.forEach((rule) => {
    const list = rule.refs && Array.isArray(rule.refs.tools) ? rule.refs.tools : [];
    list.forEach((doc) => check(doc, `rules.rich.json ${rule.id}`));
  });
}

function main() {
  const failures = [];
  for (const [methodKey, config] of Object.entries(GUARDS)) {
    const methodDir = path.join(process.cwd(), 'methodologies', methodKey);
    const sectionsPath = path.join(methodDir, 'sections.json');
    const leanPath = path.join(methodDir, 'rules.json');
    const richPath = path.join(methodDir, 'rules.rich.json');
    const metaPath = path.join(methodDir, 'META.json');

    if (!fs.existsSync(leanPath) || !fs.existsSync(richPath) || !fs.existsSync(sectionsPath) || !fs.existsSync(metaPath)) {
      failures.push(`${methodKey}: missing required data files`);
      continue;
    }

    const sections = readJSON(sectionsPath).sections || [];
    const lean = readJSON(leanPath).rules || [];
    const rich = readJSON(richPath);
    const metaTools = (((readJSON(metaPath) || {}).references || {}).tools) || [];

    ensureMonotonic(listRuleIds(lean), methodKey, failures);
    ensureSections(lean, sections, config.requiredSections || [], methodKey, failures);
    ensureParity(lean, rich, methodKey, failures);
    ensureTools(lean, rich, metaTools, methodKey, failures);
  }

  if (failures.length) {
    failures.forEach((failure) => console.error(failure));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
