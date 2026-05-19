#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const ROOT = process.cwd();
const TAXONOMY_PATH = 'config/evidence-taxonomy.json';
const MAPPING_SCHEMA_PATH = 'schemas/rule-evidence-mapping.schema.json';

let exitCode = 0;

function fail(message) {
  process.stderr.write(`FAIL  ${message}\n`);
  exitCode = 1;
}

function pass(message) {
  process.stdout.write(`PASS  ${message}\n`);
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function loadTaxonomy() {
  return loadJson(TAXONOMY_PATH);
}

function buildTaxonomyLookup(taxonomy) {
  const ids = new Set();
  for (const t of taxonomy.evidence_types) {
    ids.add(t.id);
  }
  return ids;
}

function checkMethodRules(methodPath, taxonomyIds, ajvValidate) {
  const rulesPath = path.join(methodPath, 'rules.rich.json');
  if (!fs.existsSync(rulesPath)) {
    fail(`${methodPath}: missing rules.rich.json`);
    return;
  }

  let rules;
  try {
    rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  } catch (err) {
    fail(`${methodPath}: rules.rich.json parse error — ${err.message}`);
    return;
  }

  if (!Array.isArray(rules) || rules.length === 0) {
    fail(`${methodPath}: rules.rich.json must be a non-empty array`);
    return;
  }

  let allComplete = true;

  for (const rule of rules) {
    const ruleId = rule.id || '(missing id)';

    // Check requirement_kind at rule level
    if (!rule.requirement_kind) {
      fail(`${methodPath} ${ruleId}: missing requirement_kind`);
      allComplete = false;
    } else if (!['human-judgment-required', 'calculable', 'document-check'].includes(rule.requirement_kind)) {
      fail(`${methodPath} ${ruleId}: invalid requirement_kind "${rule.requirement_kind}"`);
      allComplete = false;
    }

    // Check requirement_coverage
    const rc = rule.requirement_coverage;
    if (!rc) {
      fail(`${methodPath} ${ruleId}: missing requirement_coverage`);
      allComplete = false;
      continue;
    }

    const ev = rc.expected_evidence;
    if (!ev || !Array.isArray(ev) || ev.length === 0) {
      fail(`${methodPath} ${ruleId}: expected_evidence is empty or missing`);
      allComplete = false;
      continue;
    }

    // Validate each evidence entry against mapping schema
    const wrapped = {
      rules: [{
        id: ruleId,
        type: rule.type,
        requirement_kind: rule.requirement_kind,
        requirement_coverage: rc
      }]
    };

    const valid = ajvValidate(wrapped);
    if (!valid) {
      for (const err of ajvValidate.errors) {
        fail(`${methodPath} ${ruleId}:${err.instancePath} ${err.message}`);
      }
      allComplete = false;
    }

    // Check evidence_type_id resolves in taxonomy
    for (let i = 0; i < ev.length; i++) {
      const entry = ev[i];
      const eid = entry.evidence_type_id;
      if (eid && !taxonomyIds.has(eid)) {
        fail(`${methodPath} ${ruleId}: expected_evidence[${i}] evidence_type_id "${eid}" not found in taxonomy`);
        allComplete = false;
      }
    }
  }

  if (allComplete) {
    pass(`${methodPath}: ${rules.length} rules — expected evidence complete and valid`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const targetPath = args.find(a => a.startsWith('--path='))?.split('=')[1];

  // Load taxonomy
  let taxonomy;
  try {
    taxonomy = loadTaxonomy();
  } catch (err) {
    fail(`cannot load taxonomy at ${TAXONOMY_PATH}: ${err.message}`);
    process.exit(1);
  }
  const taxonomyIds = buildTaxonomyLookup(taxonomy);
  pass(`taxonomy loaded: ${taxonomy.evidence_types.length} evidence types`);

  // Load and compile mapping schema
  let ajvValidate;
  try {
    const schema = loadJson(MAPPING_SCHEMA_PATH);
    const ajv = new Ajv({ allErrors: true });
    ajvValidate = ajv.compile(schema);
    pass(`mapping schema compiled`);
  } catch (err) {
    fail(`cannot compile mapping schema: ${err.message}`);
    process.exit(1);
  }

  if (targetPath) {
    // Check a single method
    const absPath = path.resolve(ROOT, targetPath);
    if (!fs.existsSync(absPath)) {
      fail(`path not found: ${targetPath}`);
      process.exit(1);
    }
    checkMethodRules(absPath, taxonomyIds, ajvValidate);
  } else {
    // Scan all methods; check those with adoption_status "review_grade"
    // Also scan methods/ directory for any META.json
    const methodsDir = path.join(ROOT, 'methodologies');
    if (!fs.existsSync(methodsDir)) {
      fail('methodologies/ directory not found');
      process.exit(1);
    }
    walkAndCheck(methodsDir, taxonomyIds, ajvValidate);
  }

  if (exitCode !== 0) {
    process.stderr.write(`\nSome checks failed. Review-Grade evidence metadata is incomplete.\n`);
  } else {
    process.stdout.write(`\nAll checks passed.\n`);
  }
  process.exit(exitCode);
}

function walkAndCheck(methodsDir, taxonomyIds, ajvValidate) {
  const entries = fs.readdirSync(methodsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const standardPath = path.join(methodsDir, entry.name);
    walkStandard(standardPath, taxonomyIds, ajvValidate);
  }
}

function walkStandard(standardPath, taxonomyIds, ajvValidate) {
  const entries = fs.readdirSync(standardPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const programPath = path.join(standardPath, entry.name);
    walkProgram(programPath, taxonomyIds, ajvValidate);
  }
}

function walkProgram(programPath, taxonomyIds, ajvValidate) {
  const entries = fs.readdirSync(programPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const methodPath = path.join(programPath, entry.name);
    walkVersion(methodPath, taxonomyIds, ajvValidate);
  }
}

function walkVersion(versionPath, taxonomyIds, ajvValidate) {
  const entries = fs.readdirSync(versionPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidatePath = path.join(versionPath, entry.name);
    const metaPath = path.join(candidatePath, 'META.json');
    if (!fs.existsSync(metaPath)) continue;

    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      return;
    }

    const status = meta.artifact_quality_standard?.adoption_status;
    if (status !== 'review_grade') return;

    checkMethodRules(candidatePath, taxonomyIds, ajvValidate);
  }
}

if (require.main === module) {
  main();
}
