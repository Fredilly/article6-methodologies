#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { extractSections } = require('./extract-sections.cjs');

const repoRoot = path.resolve(__dirname, '..');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const explicit = parseMethodsArg(args.method);
  const targets = explicit.length > 0 ? explicit : discoverMethods();
  if (targets.length === 0) {
    console.log('[sections] no Forestry methods found');
    return;
  }
  for (const methodDir of targets) {
    try {
      await runExtractor(methodDir);
    } catch (err) {
      console.error(err.message || err);
      if (args.strict === 'true') {
        process.exit(1);
      }
    }
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function parseMethodsArg(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.startsWith('methodologies/')) {
        return path.resolve(repoRoot, entry);
      }
      const [idPart, version = ''] = entry.split('@');
      if (entry.includes('/')) {
        const segments = entry.split('/');
        return path.resolve(repoRoot, 'methodologies', ...segments);
      }
      if (!idPart || !version) {
        throw new Error(`[sections] unable to parse method identifier "${entry}"`);
      }
      const [org, sector, code] = idPart.split('.');
      return path.resolve(repoRoot, 'methodologies', org, sector, code, version);
    });
}

function discoverMethods() {
  const forestryRoot = path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry');
  if (!fs.existsSync(forestryRoot)) {
    return [];
  }
  const codes = fs.readdirSync(forestryRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const targets = [];
  for (const code of codes) {
    const codeDir = path.join(forestryRoot, code);
    const entries = fs.readdirSync(codeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/^v\d{2}-\d+$/.test(entry.name)) continue;
      targets.push(path.join(codeDir, entry.name));
    }
  }
  return targets;
}

async function runExtractor(methodDir) {
  const metaPath = path.join(methodDir, 'META.json');
  if (!fs.existsSync(metaPath)) {
    console.warn(`[sections] skipping ${methodDir} (no META.json)`);
    return;
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const sourceEntry = meta?.provenance?.source_pdfs?.[0];
  if (!sourceEntry) {
    console.warn(`[sections] skipping ${methodDir} (no provenance.source_pdfs)`);
    return;
  }
  const pdfPath = path.resolve(repoRoot, sourceEntry.path);
  if (!fs.existsSync(pdfPath)) {
    console.warn(`[sections] skipping ${methodDir} (missing PDF ${sourceEntry.path})`);
    return;
  }
  const methodLabel = path.relative(repoRoot, methodDir);
  const outPath = path.join(methodDir, 'sections.json');
  await extractSections({ pdfPath, outPath, methodId: methodLabel });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
