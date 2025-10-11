#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'core', 'forestry-guardrails.json');
let config = {};
if (fs.existsSync(CONFIG_PATH)) {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureSequential(leanRules, methodKey, failures) {
  leanRules.forEach((rule, index) => {
    const expected = `R-1-${String(index + 1).padStart(4, '0')}`;
    if (rule.id !== expected) {
      failures.push(`${methodKey}: expected ${expected} but found ${rule.id}`);
    }
  });
}

function ensureSections(leanRules, sections, requiredSections, methodKey, failures) {
  const sectionIds = new Set((sections || []).map((section) => section.id));
  const counts = new Map();
  leanRules.forEach((rule) => {
    if (!sectionIds.has(rule.section_id)) {
      failures.push(`${methodKey}: rule ${rule.id} references unknown section ${rule.section_id}`);
    }
    counts.set(rule.section_id, (counts.get(rule.section_id) || 0) + 1);
  });
  requiredSections.forEach((sectionId) => {
    if ((counts.get(sectionId) || 0) === 0) {
      failures.push(`${methodKey}: required section ${sectionId} has no rules`);
    }
  });
}

function ensureParity(leanRules, richRules, methodKey, failures) {
  const leanMap = new Map(leanRules.map((rule) => [rule.id, rule]));
  richRules.forEach((richRule) => {
    const leanId = richRule.id.split('.').pop();
    if (!leanMap.has(leanId)) {
      failures.push(`${methodKey}: lean rules missing ${leanId}`);
      return;
    }
    const leanRule = leanMap.get(leanId);
    if (!Array.isArray(leanRule.inputs)) {
      failures.push(`${methodKey}: rule ${leanId} missing inputs array`);
    }
    if (!Array.isArray(leanRule.when)) {
      failures.push(`${methodKey}: rule ${leanId} missing when array`);
    }
    if (!Array.isArray(leanRule.tools)) {
      failures.push(`${methodKey}: rule ${leanId} missing tools array`);
    }
  });
}

function ensureTools(metaTools, leanRules, richRules, methodKey, allowedMissing, failures) {
  const toolSet = new Set(metaTools.map((tool) => tool.doc));
  const whitelist = new Set(allowedMissing || []);
  const check = (doc, origin) => {
    if (!doc || whitelist.has(doc)) return;
    if (!toolSet.has(doc)) {
      failures.push(`${methodKey}: ${origin} references ${doc} missing from META.references.tools`);
    }
  };

  leanRules.forEach((rule) => rule.tools.forEach((doc) => check(doc, `lean rule ${rule.id}`)));
  richRules.forEach((rule) => (rule.refs?.tools || []).forEach((doc) => check(doc, `rich rule ${rule.id}`)));
}

function main() {
  const failures = [];
  for (const [methodKey, guard] of Object.entries(config)) {
    const methodDir = path.join(ROOT, 'methodologies', methodKey);
    const leanSectionsPath = path.join(methodDir, 'sections.json');
    const leanRulesPath = path.join(methodDir, 'rules.json');
    const richRulesPath = path.join(methodDir, 'rules.rich.json');
    const metaPath = path.join(methodDir, 'META.json');
    if (![leanSectionsPath, leanRulesPath, richRulesPath, metaPath].every(fs.existsSync)) {
      failures.push(`${methodKey}: missing required files`);
      continue;
    }

    const leanSections = readJSON(leanSectionsPath).sections || [];
    const leanRules = readJSON(leanRulesPath).rules || [];
    const richRules = readJSON(richRulesPath) || [];
    const metaTools = readJSON(metaPath)?.references?.tools || [];

    ensureSequential(leanRules, methodKey, failures);
    ensureSections(leanRules, leanSections, guard.requiredSections || [], methodKey, failures);
    ensureParity(leanRules, richRules, methodKey, failures);
    ensureTools(metaTools, leanRules, richRules, methodKey, guard.allowedMissingTools || [], failures);
  }

  if (failures.length) {
    failures.forEach((message) => console.error(message));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
