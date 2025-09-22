#!/usr/bin/env node
/**
 * Wrapper for the deterministic TF-IDF/linear param extraction baseline.
 * Runs the existing baseline script, parses stdout metrics, and writes
 * a reproducible JSON manifest under outputs/mvp/params.linear.<tag>.json.
 */
const { spawnSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const seed = process.env.SEED || '42';

const baseline = spawnSync(process.execPath, [path.join(__dirname, 'param-extraction-linear.js')], {
  cwd: repoRoot,
  env: { ...process.env, SEED: seed },
  encoding: 'utf8'
});

if (baseline.error) {
  throw baseline.error;
}
if (baseline.status !== 0) {
  process.stderr.write(baseline.stdout || '');
  process.stderr.write(baseline.stderr || '');
  throw new Error(`param-extraction-linear exited with status ${baseline.status}`);
}

const lines = baseline.stdout.trim().split(/\r?\n/).filter(Boolean);
const parseLine = (line, label) => {
  const match = line.match(/^(variables|units) microF1=([0-9.]+) \(P=([0-9.]+) R=([0-9.]+)\)$/);
  if (!match) {
    throw new Error(`Unable to parse ${label} line: ${line}`);
  }
  return {
    micro_f1: Number(match[2]),
    precision: Number(match[3]),
    recall: Number(match[4])
  };
};

const variableLine = lines.find((l) => l.startsWith('variables '));
const unitLine = lines.find((l) => l.startsWith('units '));

if (!variableLine || !unitLine) {
  throw new Error(`Unexpected baseline output:\n${baseline.stdout}`);
}

const metrics = {
  variables: parseLine(variableLine, 'variables'),
  units: parseLine(unitLine, 'units')
};

const commit = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
const shortCommit = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
const commitTimestamp = execSync('git show -s --format=%cI HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
const tag = `${shortCommit}-seed${seed}`;

const manifest = {
  tag: 'params.linear',
  commit_sha: commit,
  generated_at: commitTimestamp,
  dataset: 'datasets/param-extraction/v1',
  seed: Number.isNaN(Number(seed)) ? seed : Number(seed),
  metrics,
  stdout: lines
};

const outDir = path.join(repoRoot, 'outputs', 'mvp');
fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, `params.linear.${tag}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(outPath);
