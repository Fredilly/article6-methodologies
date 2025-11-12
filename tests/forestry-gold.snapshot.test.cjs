#!/usr/bin/env node
/**
 * Snapshot test for Forestry gold fixtures.
 * Compares manual Forestry trio JSON against the current repo output.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const equal = require('fast-deep-equal');

const TARGET_METHOD = 'UNFCCC/Forestry/AR-AMS0007/v03-1';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const FIXTURE_ROOT = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'forestry-gold');
const ACTUAL_ROOT = path.resolve(
  process.env.FORESTRY_GOLD_ACTUAL_ROOT || path.join(PROJECT_ROOT, 'methodologies')
);

const files = ['META.json', 'sections.json', 'rules.rich.json'];
const fixtureMethodDir = path.join(FIXTURE_ROOT, 'methodologies', TARGET_METHOD);
const actualMethodDir = path.join(ACTUAL_ROOT, TARGET_METHOD);

const expectMismatch = process.argv.includes('--expect-mismatch');
const diffs = [];

for (const file of files) {
  const fixturePath = path.join(fixtureMethodDir, file);
  const actualPath = path.join(actualMethodDir, file);
  if (!fs.existsSync(actualPath)) {
    diffs.push({
      file,
      reason: 'missing-actual',
      fixturePath,
      actualPath
    });
    continue;
  }

  const fixtureJson = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const actualJson = JSON.parse(fs.readFileSync(actualPath, 'utf8'));
  if (!equal(actualJson, fixtureJson)) {
    diffs.push({
      file,
      reason: 'content-mismatch',
      fixturePath,
      actualPath,
      fixtureHash: hashJson(fixtureJson),
      actualHash: hashJson(actualJson),
      missingPaths: listMissingPaths(fixtureJson, actualJson)
    });
  }
}

if (diffs.length === 0) {
  console.log(`[forestry-gold] ${TARGET_METHOD} matches fixture trio.`);
  if (expectMismatch) {
    console.error('[forestry-gold] expected mismatch but found none.');
    process.exit(1);
  }
  process.exit(0);
}

console.error(`[forestry-gold] Found ${diffs.length} mismatch(es) for ${TARGET_METHOD}`);
for (const diff of diffs) {
  if (diff.reason === 'missing-actual') {
    console.error(`• ${diff.file}: missing actual file at ${path.relative(PROJECT_ROOT, diff.actualPath)}`);
    continue;
  }
  console.error(
    `• ${diff.file}: fixture=${diff.fixtureHash} actual=${diff.actualHash}`
  );
  if (diff.missingPaths.length > 0) {
    console.error(`  missing in actual: ${diff.missingPaths.slice(0, 5).join(', ')}${diff.missingPaths.length > 5 ? ', ...' : ''}`);
  }
}

if (expectMismatch) {
  console.error('[forestry-gold] mismatch expected (P0 parity).');
  process.exit(0);
}

process.exit(1);

function hashJson(value) {
  const json = JSON.stringify(sortDeep(value));
  return crypto.createHash('sha256').update(json).digest('hex');
}

function sortDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function listMissingPaths(expected, actual, base = '') {
  const missing = [];
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      missing.push(base || '(root)');
      return missing;
    }
    const length = Math.min(expected.length, actual.length);
    for (let i = 0; i < length; i += 1) {
      missing.push(...listMissingPaths(expected[i], actual[i], `${base}[${i}]`));
    }
    if (expected.length > actual.length) {
      missing.push(`${base}[${actual.length}…${expected.length - 1}]`);
    }
    return missing;
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      missing.push(base || '(root)');
      return missing;
    }
    for (const key of Object.keys(expected)) {
      const nextBase = base ? `${base}.${key}` : key;
      if (!(key in actual)) {
        missing.push(nextBase);
        continue;
      }
      missing.push(...listMissingPaths(expected[key], actual[key], nextBase));
    }
    return missing;
  }
  if (expected !== actual && (actual === undefined || actual === null || actual === '')) {
    missing.push(base || '(root)');
  }
  return missing;
}
