#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const tmpRoot = path.join(repoRoot, '.tmp-json-canonical-test');
fs.rmSync(tmpRoot, { recursive: true, force: true });
const methodDir = path.join(
  repoRoot,
  'methodologies',
  'UNFCCC',
  'Agriculture',
  'TMPCANON',
  'v01-0'
);

fs.mkdirSync(methodDir, { recursive: true });

const sectionsPath = path.join(methodDir, 'sections.json');
const rulesPath = path.join(methodDir, 'rules.json');

const sectionsRaw = `${JSON.stringify({
  sections: [
    {
      id: 'S-1',
      title: 'Scope and applicability',
      anchor: 'scope-and-applicability',
      section_number: '1',
      stable_id: 'UNFCCC.Agriculture.TMPCANON.v01-0.S-1'
    }
  ]
}, null, 2)}\n`;

const rulesRaw = `${JSON.stringify({
  rules: [
    {
      id: 'R-1-0001',
      stable_id: 'UNFCCC.Agriculture.TMPCANON.v01-0.R-1-0001',
      title: 'Rule title',
      logic: 'Rule logic',
      section_anchor: 'scope-and-applicability',
      section_id: 'S-1',
      section_number: '1',
      section_stable_id: 'UNFCCC.Agriculture.TMPCANON.v01-0.S-1',
      tools: ['UNFCCC/TMPCANON@v01-0']
    }
  ]
}, null, 2)}\n`;

fs.writeFileSync(sectionsPath, sectionsRaw, 'utf8');
fs.writeFileSync(rulesPath, rulesRaw, 'utf8');

const result = spawnSync(
  'node',
  ['scripts/json-canonical-check.sh', '--fix', sectionsPath, rulesPath],
  { cwd: repoRoot, encoding: 'utf8' }
);

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.equal(fs.readFileSync(sectionsPath, 'utf8'), sectionsRaw, 'lean sections key order changed');
assert.equal(fs.readFileSync(rulesPath, 'utf8'), rulesRaw, 'lean rules key order changed');
fs.rmSync(methodDir, { recursive: true, force: true });

console.log('ok json canonical check preserves lean contract order');
