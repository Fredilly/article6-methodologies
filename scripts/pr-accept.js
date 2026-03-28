#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = process.cwd();
const allowedProfileKeys = new Set([
  'name',
  'proof_tests',
  'validators',
  'rerun_commands',
  'must_be_zero_diff_after_rerun',
  'must_not_change',
]);

function fail(message, details, exitCode = 1) {
  process.stderr.write(`FAIL ${message}\n`);
  if (details) {
    process.stderr.write(`${details.endsWith('\n') ? details : `${details}\n`}`);
  }
  process.exit(exitCode);
}

function parseArgs(argv) {
  let allowDirty = false;
  let profileName = '';

  for (const arg of argv) {
    if (arg === '--allow-dirty') {
      allowDirty = true;
      continue;
    }
    if (arg.startsWith('--')) {
      fail(`unknown flag ${arg}`);
    }
    if (profileName) {
      fail(`unexpected extra argument ${arg}`);
    }
    profileName = arg;
  }

  if (!profileName) {
    fail('missing profile name', 'usage: node scripts/pr-accept.js <profile-name> [--allow-dirty]');
  }

  return { allowDirty, profileName };
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed`, `${result.stdout || ''}${result.stderr || ''}`.trim(), result.status || 1);
  }
  return result.stdout;
}

function ensureCleanTree(allowDirty) {
  if (allowDirty) return;
  const status = runGit(['status', '--porcelain']);
  if (status.trim()) {
    fail('working tree is dirty', 'rerun with --allow-dirty to scope checks to configured paths only');
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`could not parse ${path.relative(repoRoot, filePath)}`, error.message);
  }
}

function requireStringArray(profile, key) {
  const value = profile[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`profile field ${key} must be an array of non-empty strings`);
  }
  return value;
}

function loadProfile(profileName) {
  const profilePath = path.join(repoRoot, 'config', 'pr-accept', `${profileName}.json`);
  if (!fs.existsSync(profilePath)) {
    fail(`missing profile ${profileName}`, path.relative(repoRoot, profilePath));
  }

  const profile = readJson(profilePath);
  for (const key of Object.keys(profile)) {
    if (!allowedProfileKeys.has(key)) {
      fail(`profile ${profileName} contains unsupported key ${key}`);
    }
  }

  if (typeof profile.name !== 'string' || !profile.name.trim()) {
    fail(`profile ${profileName} must define name`);
  }

  return {
    path: profilePath,
    name: profile.name,
    proofTests: requireStringArray(profile, 'proof_tests'),
    validators: requireStringArray(profile, 'validators'),
    rerunCommands: requireStringArray(profile, 'rerun_commands'),
    zeroDiffPaths: requireStringArray(profile, 'must_be_zero_diff_after_rerun'),
    mustNotChangePaths: requireStringArray(profile, 'must_not_change'),
  };
}

function runCommand(command, phase, index) {
  const result = spawnSync('sh', ['-lc', command], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    const details = [
      `phase: ${phase}[${index + 1}]`,
      `command: ${command}`,
      result.stdout ? `stdout:\n${result.stdout.trimEnd()}` : '',
      result.stderr ? `stderr:\n${result.stderr.trimEnd()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    fail(`${phase} command failed`, details, result.status || 1);
  }
}

function hashConfiguredPath(relPath) {
  const absPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(absPath)) {
    return 'missing';
  }
  const stat = fs.statSync(absPath);
  if (!stat.isFile()) {
    fail(`configured path must be a file`, relPath);
  }
  const bytes = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function recordPathState(relPaths) {
  const state = new Map();
  for (const relPath of relPaths) {
    state.set(relPath, hashConfiguredPath(relPath));
  }
  return state;
}

function findChangedPaths(relPaths, beforeState) {
  return relPaths.filter((relPath) => hashConfiguredPath(relPath) !== beforeState.get(relPath));
}

function uniqueStrings(values) {
  return Array.from(new Set(values));
}

function main() {
  const { allowDirty, profileName } = parseArgs(process.argv.slice(2));
  ensureCleanTree(allowDirty);

  const profile = loadProfile(profileName);

  profile.proofTests.forEach((command, index) => runCommand(command, 'proof_tests', index));
  profile.validators.forEach((command, index) => runCommand(command, 'validators', index));

  const trackedPaths = uniqueStrings([...profile.zeroDiffPaths, ...profile.mustNotChangePaths]);
  const baselineState = recordPathState(trackedPaths);

  profile.rerunCommands.forEach((command, index) => runCommand(command, 'rerun_commands', index));

  const rerunChanges = findChangedPaths(profile.zeroDiffPaths, baselineState);
  if (rerunChanges.length > 0) {
    fail(
      `${profile.name} rerun drift`,
      `must_be_zero_diff_after_rerun changed: ${rerunChanges.join(', ')}`,
    );
  }

  const mustNotChangeChanges = findChangedPaths(profile.mustNotChangePaths, baselineState);
  if (mustNotChangeChanges.length > 0) {
    fail(
      `${profile.name} protected-path drift`,
      `must_not_change changed: ${mustNotChangeChanges.join(', ')}`,
    );
  }

  process.stdout.write(
    `PASS ${profile.name} proofs=${profile.proofTests.length} validators=${profile.validators.length} reruns=${profile.rerunCommands.length} checked=${trackedPaths.length}\n`,
  );
}

main();
