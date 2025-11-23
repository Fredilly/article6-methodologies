#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function main() {
  const methods = discoverMethods();
  if (methods.length === 0) {
    console.log('[sections] no Forestry methods found for gate');
    return;
  }
  const failures = [];
  for (const methodDir of methods) {
    const sectionsPath = path.join(methodDir, 'sections.json');
    if (!fs.existsSync(sectionsPath)) {
      failures.push(`${path.relative(repoRoot, methodDir)} missing sections.json`);
      continue;
    }
    try {
      const raw = fs.readFileSync(sectionsPath, 'utf8');
      const parsed = JSON.parse(raw);
      validateSections(parsed, sectionsPath, failures);
    } catch (err) {
      failures.push(`${path.relative(repoRoot, sectionsPath)} parse error: ${err.message}`);
    }
  }
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(`[sections:gate] ${failure}`));
    process.exit(1);
  }
  console.log('[sections:gate] Forestry sections passed sanity checks');
}

function discoverMethods() {
  const forestryRoot = path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry');
  if (!fs.existsSync(forestryRoot)) {
    return [];
  }
  const results = [];
  for (const codeEntry of fs.readdirSync(forestryRoot, { withFileTypes: true })) {
    if (!codeEntry.isDirectory()) continue;
    const codeDir = path.join(forestryRoot, codeEntry.name);
    for (const versionEntry of fs.readdirSync(codeDir, { withFileTypes: true })) {
      if (!versionEntry.isDirectory()) continue;
      if (!/^v\d{2}-\d+$/.test(versionEntry.name)) continue;
      results.push(path.join(codeDir, versionEntry.name));
    }
  }
  return results;
}

function validateSections(payload, sectionsPath, failures) {
  const sections = Array.isArray(payload?.sections) ? payload.sections : [];
  const methodLabel = path.relative(repoRoot, path.dirname(sectionsPath));
  if (sections.length < 5) {
    failures.push(`${methodLabel} has ${sections.length} sections (minimum 5 required)`);
    return;
  }
  sections.forEach((section, index) => {
    const title = (section?.title || '').trim();
    const body = (section?.content || '').trim();
    const anchor = (section?.anchor || '').trim();
    const hasStub = /\b(TODO|TBD)\b/i.test(`${title}\n${body}\n${anchor}`);
    if (hasStub) {
      failures.push(`${methodLabel} sections[${index}] contains TODO/TBD text`);
    }
  });
}

main();
