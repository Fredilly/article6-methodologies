#!/usr/bin/env node
/**
 * Canonical JSON checker/fixer
 * - Default: check only; list non-canonical files and exit non-zero.
 * - With --fix: rewrite files with sorted keys, 2-space indent, trailing LF.
 * - Optional positional args restrict processing to explicit files.
 * - Optional --roots=<dir,dir> overrides the default directory scan.
 */
const fs = require('fs');
const path = require('path');
const {
  canonicalizeLeanRuleFromLean,
  canonicalizeLeanSection,
  getMethodInfo
} = require('../core/methodology-artifact-contract.cjs');

function realpathMaybe(inputPath) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(inputPath) : fs.realpathSync(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === 'object') {
    const out = {};
    Object.keys(obj)
      .sort()
      .forEach((k) => {
        out[k] = sortKeysDeep(obj[k]);
      });
    return out;
  }
  return obj;
}

function stableStringify(obj) {
  return JSON.stringify(sortKeysDeep(obj), null, 2) + '\n';
}

function isMethodologyLeanFile(absPath) {
  const rel = path.relative(rootDir, realpathMaybe(absPath)).split(path.sep);
  if (rel[0] !== 'methodologies') return false;
  const base = path.basename(absPath);
  return base === 'sections.json' || base === 'rules.json';
}

function stableStringifyMethodologyLean(absPath, parsed) {
  if (!isMethodologyLeanFile(absPath)) return null;

  const methodDir = path.dirname(absPath);
  const info = getMethodInfo(methodDir);
  const base = path.basename(absPath);

  if (base === 'sections.json') {
    const sections = (parsed.sections || []).map((section) => canonicalizeLeanSection(section, info));
    return JSON.stringify({ sections }, null, 2) + '\n';
  }

  const sectionsPath = path.join(methodDir, 'sections.json');
  const sectionsJson = absPath === sectionsPath
    ? parsed
    : JSON.parse(fs.readFileSync(sectionsPath, 'utf8'));
  const canonicalSections = (sectionsJson.sections || []).map((section) => canonicalizeLeanSection(section, info));
  const sectionLookup = new Map(canonicalSections.map((section) => [section.id, section]));
  const rules = (parsed.rules || []).map((rule) => canonicalizeLeanRuleFromLean(rule, sectionLookup, info));
  return JSON.stringify({ rules }, null, 2) + '\n';
}

function listJsonFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(listJsonFiles(res));
    } else if (res.endsWith('.json')) {
      results.push(res);
    }
  }
  return results;
}

function dedupe(items) {
  return Array.from(new Set(items));
}

const rootDir = realpathMaybe(process.cwd());

function toRelative(absPath) {
  return path.relative(rootDir, realpathMaybe(absPath)) || absPath;
}

const argv = process.argv.slice(2);
const fix = argv.includes('--fix');
const explicitRootsArg = argv.find((arg) => arg.startsWith('--roots='));
const roots = explicitRootsArg
  ? explicitRootsArg.replace('--roots=', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : ['methodologies', 'schemas', 'tests'];

const filesFromArgs = argv.filter((arg) => !arg.startsWith('--'));

let files = [];
if (filesFromArgs.length) {
  files = dedupe(filesFromArgs.map((p) => realpathMaybe(p))).filter((p) => p.endsWith('.json'));
} else {
  roots.forEach((root) => {
    if (!root) return;
    const abs = realpathMaybe(root);
    if (fs.existsSync(abs)) {
      files = files.concat(listJsonFiles(abs));
    }
  });
  files = dedupe(files);
}

if (!files.length) {
  if (filesFromArgs.length) {
    process.exit(0);
  }
}

let changed = [];
files.forEach((absPath) => {
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    if (filesFromArgs.length) {
      console.warn(`Skipping missing file: ${absPath}`);
      return;
    }
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    const stable = stableStringifyMethodologyLean(absPath, parsed) || stableStringify(parsed);
    if (stable !== raw) {
      changed.push(absPath);
      if (fix) {
        fs.writeFileSync(absPath, stable, 'utf8');
        console.log('fixed', toRelative(absPath));
      }
    }
  } catch (e) {
    console.error(`Invalid JSON: ${toRelative(absPath)}\n${e.message}`);
    process.exitCode = 2;
  }
});

if (!changed.length) {
  process.exit(0);
}

if (fix) {
  console.log(`OK: canonicalized ${changed.length}/${files.length} JSON file(s)`);
  process.exit(0);
}

console.error('Non-canonical JSON detected in:\n' + changed.map((x) => ' - ' + toRelative(x)).join('\n'));
process.exit(1);
