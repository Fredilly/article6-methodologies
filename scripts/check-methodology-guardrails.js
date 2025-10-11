#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'core', 'forestry-guardrails.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureSections(leanRules, sections, requiredSections, methodKey, failures) {
  const validSections = new Set((sections || []).map((section) => section.id));
  const counts = new Map();
  for (const rule of leanRules) {
    if (!validSections.has(rule.section_id)) {
      failures.push(`${methodKey}: rule ${rule.id} references unknown section ${rule.section_id}`);
    }
    counts.set(rule.section_id, (counts.get(rule.section_id) || 0) + 1);
  }
  for (const sectionId of requiredSections) {
    if ((counts.get(sectionId) || 0) === 0) {
      failures.push(`${methodKey}: required section ${sectionId} has no lean rules`);
    }
  }
}

function ensureParity(leanRules, richRules, methodKey, failures) {
  const leanById = new Map();
  for (const rule of leanRules) {
    leanById.set(rule.id, rule);
  }
  for (const richRule of richRules) {
    const simpleId = String(richRule.id).split('.').pop();
    if (!leanById.has(simpleId)) {
      failures.push(`${methodKey}: lean rules missing ${simpleId} from rich rules`);
      continue;
    }
    const leanRule = leanById.get(simpleId);
    if (!Array.isArray(leanRule.inputs)) {
      failures.push(`${methodKey}: rule ${simpleId} missing inputs array in lean rules`);
    }
    if (!Array.isArray(leanRule.when)) {
      failures.push(`${methodKey}: rule ${simpleId} missing when array in lean rules`);
    }
    if (!Array.isArray(leanRule.tools)) {
      failures.push(`${methodKey}: rule ${simpleId} missing tools array in lean rules`);
    }
  }
}

function ensureTools(metaTools, leanRules, richRules, methodKey, failures, allowedMissing) {
  const toolSet = new Set((metaTools || []).map((tool) => tool.doc).filter(Boolean));
  const whitelist = new Set(allowedMissing || []);
  const check = (doc, origin) => {
    if (whitelist.has(doc)) return;
    if (!toolSet.has(doc)) {
      failures.push(`${methodKey}: ${origin} references ${doc} missing from META.references.tools`);
    }
  };

  leanRules.forEach((rule) => {
    for (const doc of (rule.tools || [])) {
      check(doc, `lean rule ${rule.id}`);
    }
  });

  richRules.forEach((rule) => {
    const docs = (rule.refs && Array.isArray(rule.refs.tools)) ? rule.refs.tools : [];
    docs.forEach((doc) => check(doc, `rich rule ${rule.id}`));
  });
}

function main() {
  const failures = [];
  for (const [methodKey, config] of Object.entries(CONFIG)) {
    const methodDir = path.join(ROOT, 'methodologies', methodKey);
    const leanSectionsPath = path.join(methodDir, 'sections.json');
    const leanRulesPath = path.join(methodDir, 'rules.json');
    const richSectionsPath = path.join(methodDir, 'sections.rich.json');
    const richRulesPath = path.join(methodDir, 'rules.rich.json');
    const metaPath = path.join(methodDir, 'META.json');

    if (![leanSectionsPath, leanRulesPath, richSectionsPath, richRulesPath, metaPath].every((filePath) => fs.existsSync(filePath))) {
      failures.push(`${methodKey}: missing methodology artefacts`);
      continue;
    }

    const leanSections = readJSON(leanSectionsPath).sections || [];
    const leanRules = readJSON(leanRulesPath).rules || [];
    const richRules = readJSON(richRulesPath) || [];
    const metaTools = readJSON(metaPath)?.references?.tools || [];

    ensureSections(leanRules, leanSections, config.requiredSections || [], methodKey, failures);
    ensureParity(leanRules, richRules, methodKey, failures);
    ensureTools(metaTools, leanRules, richRules, methodKey, failures, config.allowedMissingTools);
  }

  if (failures.length) {
    failures.forEach((failure) => console.error(failure));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
