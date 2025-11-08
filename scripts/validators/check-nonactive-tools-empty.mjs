#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'tools', 'UNFCCC', 'Forestry');
const VERSION_RE = /^v(\d{2})-(\d)$/;
const ALLOWED_BASENAMES = new Set([
  'META.json',
  'meta.json',
  'README.md',
  'readme.md',
  '.keep',
  '.gitkeep'
]);

function parseVersion(name) {
  const match = VERSION_RE.exec(name);
  if (!match) return null;
  return { name, major: Number(match[1]), minor: Number(match[2]) };
}

function pickActive(versions) {
  return versions
    .map(parseVersion)
    .filter(Boolean)
    .sort((a, b) => (a.major === b.major ? a.minor - b.minor : a.major - b.major))
    .pop();
}

function isAllowedFile(basename) {
  if (ALLOWED_BASENAMES.has(basename)) return true;
  return /^source\.(pdf|doc|docx|txt)$/i.test(basename);
}

function main() {
  let hadError = false;
  let inspected = 0;

  let methodologies = [];
  try {
    methodologies = readdirSync(ROOT, { withFileTypes: true }).filter(entry => entry.isDirectory());
  } catch (err) {
    console.error(`[tools] Unable to read Forestry tools root: ${err.message}`);
    process.exit(2);
  }

  for (const meth of methodologies) {
    const methPath = join(ROOT, meth.name);
    let versions = [];
    try {
      versions = readdirSync(methPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && VERSION_RE.test(entry.name))
        .map(entry => entry.name);
    } catch (err) {
      console.error(`[tools] Unable to read methodology folder ${methPath}: ${err.message}`);
      hadError = true;
      continue;
    }
    if (versions.length === 0) continue;
    const active = pickActive(versions);
    if (!active) continue;

    for (const version of versions) {
      if (version === active.name) continue;
      const versionPath = join(methPath, version);
      inspected += 1;
      let entries = [];
      try {
        entries = readdirSync(versionPath, { withFileTypes: true });
      } catch (err) {
        console.error(`[tools] Unable to read version folder ${versionPath}: ${err.message}`);
        hadError = true;
        continue;
      }
      for (const entry of entries) {
        const entryPath = join(versionPath, entry.name);
        if (entry.isDirectory()) {
          console.error(`[tools] directory in non-active version: ${entryPath}`);
          hadError = true;
          continue;
        }
        if (!isAllowedFile(entry.name)) {
          console.error(`[tools] disallowed file in non-active version (${versionPath}): ${entry.name}`);
          hadError = true;
        }
      }
    }
  }

  if (hadError) {
    console.error('[tools] Non-active Forestry versions contain redundant files. Remove them or move to the active version.');
    process.exit(1);
  }
  console.log(`[tools] Non-active Forestry versions are clean (${inspected} inspected).`);
}

main();
