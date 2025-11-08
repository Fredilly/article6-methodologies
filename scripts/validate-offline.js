#!/usr/bin/env node
/**
 * Offline validator: no external deps. Walk repo, find target JSONs, validate with
 * precompiled validators in scripts/validators/*.cjs. Exits non-zero on any error.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function safeRequire(mod){
  try { return require(mod); }
  catch (err) {
    if (err && (err.code === 'MODULE_NOT_FOUND' || /Cannot find module/.test(String(err)))) return null;
    throw err;
  }
}

let validators;
try {
  validators = {
    META: require('./validators/meta.cjs'),
    META_PREVIOUS: safeRequire('./validators/meta.previous.cjs'),
    sections: require('./validators/sections.cjs'),
    rules: require('./validators/rules.cjs'),
  };
} catch (e) {
  try {
    const bundle = require('./validators/bundle.cjs');
    validators = { META: bundle.META, META_PREVIOUS: bundle.meta_previous, sections: bundle.sections, rules: bundle.rules, sections_rich: bundle.sections_rich, rules_rich: bundle.rules_rich };
  } catch (e2) {
    console.error('ERROR: compiled validators not found in scripts/validators (meta/sections/rules or bundle).');
    process.exit(2);
  }
}

if (!validators.META) {
  console.error('ERROR: META validator unavailable.');
  process.exit(2);
}

const TARGETS = [
  {
    name: 'META',
    file: 'META.json',
    pickValidator: (file) => {
      const previous = isPrevious(file);
      if (previous) {
        return {
          type: 'META.previous',
          validator: validators.META_PREVIOUS || validators.META,
        };
      }
      return { type: 'META', validator: validators.META };
    },
  },
  { name: 'sections', file: 'sections.json', validator: validators.sections },
  { name: 'rules',    file: 'rules.json',    validator: validators.rules },
];

// Optionally include rich validators when available
if (validators.sections_rich && validators.rules_rich) {
  TARGETS.push(
    { name: 'sections.rich', file: 'sections.rich.json', validator: validators.sections_rich },
    { name: 'rules.rich',    file: 'rules.rich.json',    validator: validators.rules_rich },
  );
}

const PREVIOUS_MARKER = `${path.sep}previous${path.sep}`;
function isPrevious(p){
  return p.includes(PREVIOUS_MARKER) || p.includes('/previous/');
}

function* walk(dir) {
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function matchesFile(p, file){
  return p.endsWith('/' + file) || p.endsWith('\\' + file);
}

function collectFiles() {
  const hits = [];
  for (const p of walk(path.join(ROOT, 'methodologies'))) {
    for (const t of TARGETS) {
      if (!matchesFile(p, t.file)) continue;
      if (t.pickValidator) {
        const picked = t.pickValidator(p);
        if (!picked || !picked.validator) {
          console.error(`✖ No validator available for ${p}`);
          process.exit(2);
        }
        hits.push({ type: picked.type || t.name, file: p, validate: picked.validator });
      } else {
        hits.push({ type: t.name, file: p, validate: t.validator });
      }
    }
  }
  return hits;
}

const files = collectFiles();
let failed = 0;

for (const { type, file, validate } of files) {
  const raw = fs.readFileSync(file, 'utf8');
  let data;
  try { data = JSON.parse(raw); }
  catch (e) {
    console.error(`✖ ${type}: ${file} — invalid JSON: ${e.message}`);
    failed++; continue;
  }
  const ok = validate(data);
  if (!ok) {
    console.error(`✖ ${type}: ${file}`);
    for (const err of validate.errors || []) {
      console.error(`  - ${err.instancePath || '(root)'} ${err.message}`);
    }
    failed++;
  } else {
    console.log(`✓ ${type}: ${file} valid`);
  }
}

if (files.length === 0) {
  console.log('ℹ no target JSON files found under /methodologies');
}
process.exit(failed ? 1 : 0);
