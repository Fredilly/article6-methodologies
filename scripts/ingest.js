#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const INGEST_FILE = path.join(ROOT, 'ingest.yml');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function readIngest() {
  if (!fs.existsSync(INGEST_FILE)) {
    fail(`ingest file not found: ${path.relative(ROOT, INGEST_FILE)}`);
  }
  const raw = fs.readFileSync(INGEST_FILE, 'utf8');
  const doc = yaml.load(raw);
  if (!doc || typeof doc !== 'object') {
    fail('ingest.yml must contain a YAML object');
  }
  const methods = Array.isArray(doc.methods) ? doc.methods : [];
  return methods.map((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      fail(`methods[${idx}] must be a mapping`);
    }
    const id = entry.id;
    const version = entry.version;
    if (!id || !version) {
      fail(`methods[${idx}] missing required id/version`);
    }
    const parsed = parseId(String(id));
    return {
      ...entry,
      id: String(id),
      version: String(version),
      parsed,
    };
  });
}

function parseId(id) {
  const parts = id.split('.').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) {
    fail(`invalid method id '${id}' (expected format STANDARD.DOMAIN.METHOD)`);
  }
  const standard = parts[0];
  const method = parts[parts.length - 1];
  const domainSegments = parts.slice(1, parts.length - 1);
  const domainForPath = domainSegments.join('/');
  if (!domainForPath) {
    fail(`invalid method id '${id}' (missing domain component)`);
  }
  return { standard, method, domainSegments, domainForPath };
}

function findSourceFile(toolsDir, method) {
  if (!fs.existsSync(toolsDir)) return null;
  const entries = fs.readdirSync(toolsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile());
  if (!entries.length) return null;
  const lowerMethod = method.toLowerCase();
  const tests = [
    (name) => /^source\.(pdf|docx)$/i.test(name),
    (name) => name.toLowerCase().includes(lowerMethod) && /\.pdf$/i.test(name),
    (name) => /methodology/i.test(name) && /\.pdf$/i.test(name),
    (name) => name.toLowerCase().includes(lowerMethod),
    () => true,
  ];
  for (const test of tests) {
    const found = entries.find((entry) => test(entry.name));
    if (found) return found.name;
  }
  return null;
}

function rel(p) {
  return path.relative(ROOT, p) || '.';
}

function runGenMethod(parsedEntry, opts) {
  const { standard, domainForPath, method } = parsedEntry.parsed;
  const args = [];
  if (opts.dryRun) args.push('--dry-run');
  args.push('--allow-create-outdir');
  args.push(standard, domainForPath, method, parsedEntry.version);
  const scriptPath = path.join(ROOT, 'scripts', 'gen-method.sh');
  const res = spawnSync(scriptPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });
  return res.status === 0;
}

function main() {
  const args = process.argv.slice(2);
  const filterIds = new Set();
  let generate = false;
  let dryRun = false;
  let allowMissing = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--generate') {
      generate = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--allow-missing') {
      allowMissing = true;
    } else if (arg === '--id') {
      const val = args[i + 1];
      if (!val) fail('--id requires a value');
      filterIds.add(String(val));
      i += 1;
    } else if (arg.startsWith('--id=')) {
      filterIds.add(arg.slice('--id='.length));
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }

  const methods = readIngest();
  const subset = filterIds.size
    ? methods.filter((entry) => filterIds.has(entry.id))
    : methods;

  if (!subset.length) {
    console.log('No ingest targets selected.');
    return;
  }

  let issues = 0;
  let failures = 0;

  subset.forEach((entry) => {
    const { parsed, version } = entry;
    const { standard, method, domainSegments, domainForPath } = parsed;
    const toolsDir = path.join(ROOT, 'tools', standard, method, version);
    const methodDir = path.join(ROOT, 'methodologies', standard, ...domainSegments, method, version);

    const missing = [];
    const warnings = [];

    if (!fs.existsSync(toolsDir)) {
      missing.push(`tools directory missing (${rel(toolsDir)})`);
    }

    let sourceName = null;
    if (fs.existsSync(toolsDir)) {
      sourceName = findSourceFile(toolsDir, method);
      if (!sourceName) {
        missing.push('no source document found in tools directory');
      }
    }

    const richSections = path.join(methodDir, 'sections.rich.json');
    const richRules = path.join(methodDir, 'rules.rich.json');
    const hasRich = fs.existsSync(richSections) && fs.existsSync(richRules);

    if (!fs.existsSync(methodDir)) {
      warnings.push(`method output directory missing (${rel(methodDir)})`);
    } else if (!hasRich) {
      warnings.push('rich JSON files missing or incomplete');
    }

    const label = `${entry.id}@${version}`;
    console.log(`\n>>> ${label}`);
    console.log(`    standard: ${standard}`);
    console.log(`    domain:   ${domainSegments.join(' / ')}`);
    console.log(`    method:   ${method}`);
    console.log(`    version:  ${version}`);
    console.log(`    tools:    ${fs.existsSync(toolsDir) ? 'present' : 'missing'}`);
    if (sourceName) {
      console.log(`    source:   ${sourceName}`);
    } else {
      console.log('    source:   missing');
    }
    console.log(`    output:   ${fs.existsSync(methodDir) ? 'present' : 'missing'}`);

    missing.forEach((msg) => {
      console.log(`    ✖ ${msg}`);
    });
    warnings.forEach((msg) => {
      console.log(`    ⚠ ${msg}`);
    });

    if (missing.length) {
      issues += missing.length;
    }

    if (generate) {
      if (missing.length) {
        console.log('    skipping generation due to missing prerequisites');
        failures += 1;
        return;
      }
      const ok = runGenMethod(entry, { dryRun });
      if (!ok) {
        console.log('    ✖ gen-method.sh failed');
        failures += 1;
        return;
      }
      console.log('    ✓ gen-method.sh completed');
    }
  });

  if (!allowMissing && (issues > 0 || failures > 0)) {
    process.exitCode = 1;
    const parts = [];
    if (issues) parts.push(`${issues} missing prerequisite${issues === 1 ? '' : 's'}`);
    if (failures) parts.push(`${failures} generation failure${failures === 1 ? '' : 's'}`);
    console.error(`\nIngest audit failed: ${parts.join(', ')}.`);
    return;
  }

  if (issues > 0 || failures > 0) {
    console.log(`\nIngest completed with issues (allow-missing enabled).`);
  } else {
    console.log('\nIngest audit passed.');
  }
}

main();
