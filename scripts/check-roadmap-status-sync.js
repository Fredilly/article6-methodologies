#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = process.cwd();
const roadmapStatusPath = 'docs/roadmaps/requirement-coverage-support/phase-status.json';
const implementationTargets = [
  'config/pr-accept/am0073-richer-rule-detail.json',
  'config/pr-accept/am0073-stable-anchor-linkage.json',
  'methodologies/UNFCCC/Agriculture/AM0073/v01-0/',
  'methodologies/UNFCCC/Forestry/AR-AMS0007/v03-1/',
  'schemas/rules.rich.schema.json',
  'schemas/sections.rich.schema.json',
  'scripts/enrich-methodology-outputs.js',
  'scripts/pr-accept.js',
  'scripts/reshape-agriculture.js',
  'tests/am0073-requirement-coverage-proof.test.js',
  'tests/am0073-richer-rule-detail-proof.test.js',
  'tests/ar-ams0007-stable-anchor-linkage-proof.test.js',
];

function fail(message, details, exitCode = 1) {
  process.stderr.write(`FAIL ${message}\n`);
  if (details) process.stderr.write(`${details.endsWith('\n') ? details : `${details}\n`}`);
  process.exit(exitCode);
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed`, `${result.stdout || ''}${result.stderr || ''}`.trim(), result.status || 1);
  }
  return result.stdout.trim();
}

function parseArgs(argv) {
  let baseRef = 'origin/main';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') {
      baseRef = argv[index + 1];
      index += 1;
      continue;
    }
    fail(`unknown argument ${arg}`, 'usage: node scripts/check-roadmap-status-sync.js [--base <git-ref>]');
  }
  if (!baseRef) fail('missing value for --base');
  return { baseRef };
}

function refExists(ref) {
  const result = spawnSync('git', ['rev-parse', '--verify', ref], { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0;
}

function changedFilesSince(baseRef) {
  const mergeBase = runGit(['merge-base', 'HEAD', baseRef]);
  const output = runGit(['diff', '--name-only', `${mergeBase}..HEAD`]);
  return output ? output.split('\n').filter(Boolean).sort() : [];
}

function isImplementationPath(filePath) {
  return implementationTargets.some((target) => (target.endsWith('/') ? filePath.startsWith(target) : filePath === target));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, filePath), 'utf8'));
}

function readJsonAtRef(ref, filePath) {
  const result = spawnSync('git', ['show', `${ref}:${filePath}`], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return JSON.parse(result.stdout);
}

function main() {
  const { baseRef } = parseArgs(process.argv.slice(2));
  if (!refExists(baseRef)) {
    fail(`base ref ${baseRef} not found`);
  }

  const changedFiles = changedFilesSince(baseRef);
  const implementationChanges = changedFiles.filter(isImplementationPath);
  const phaseStatusChanged = changedFiles.includes(roadmapStatusPath);

  if (implementationChanges.length === 0) {
    process.stdout.write('PASS requirement-coverage roadmap status unchanged\n');
    return;
  }

  if (!phaseStatusChanged) {
    fail(
      'requirement-coverage implementation changed without phase-status update',
      implementationChanges.join('\n'),
    );
  }

  const current = readJson(roadmapStatusPath);
  const previous = readJsonAtRef(baseRef, roadmapStatusPath);
  if (!previous) {
    fail(`could not read ${roadmapStatusPath} from ${baseRef}`);
  }
  if (current.last_updated_at === previous.last_updated_at) {
    fail('phase-status changed without refreshing last_updated_at', roadmapStatusPath);
  }

  process.stdout.write(`PASS requirement-coverage roadmap status synced (${implementationChanges.length} implementation file(s))\n`);
}

main();
