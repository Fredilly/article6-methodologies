#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function readJson(relPath) {
  const abs = path.join(repoRoot, relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function assertNonEmptyRules(leanPath, richPath) {
  const lean = readJson(leanPath);
  const rich = readJson(richPath);
  assert.ok(Array.isArray(lean?.rules), `${leanPath}: missing rules array`);
  assert.ok(Array.isArray(rich), `${richPath}: expected array`);
  assert.ok(lean.rules.length > 0, `${leanPath}: expected non-empty rules`);
  assert.ok(rich.length > 0, `${richPath}: expected non-empty rules`);
  assert.ok(typeof rich[0]?.id === 'string' && rich[0].id.length > 0, `${richPath}: expected rule id`);
}

function main() {
  const targets = [
    // Previously empty
    {
      lean: 'methodologies/UNFCCC/Agriculture/AMS-III.A/v03-0/previous/v01-0/rules.json',
      rich: 'methodologies/UNFCCC/Agriculture/AMS-III.A/v03-0/previous/v01-0/rules.rich.json',
    },
    {
      lean: 'methodologies/UNFCCC/Agriculture/AMS-III.AU/v04-0/previous/v01-0/rules.json',
      rich: 'methodologies/UNFCCC/Agriculture/AMS-III.AU/v04-0/previous/v01-0/rules.rich.json',
    },
    {
      lean: 'methodologies/UNFCCC/Agriculture/AMS-III.BF/v02-0/previous/v01-0/rules.json',
      rich: 'methodologies/UNFCCC/Agriculture/AMS-III.BF/v02-0/previous/v01-0/rules.rich.json',
    },
    {
      lean: 'methodologies/UNFCCC/Agriculture/AMS-III.BK/v02-0/previous/v01-0/rules.json',
      rich: 'methodologies/UNFCCC/Agriculture/AMS-III.BK/v02-0/previous/v01-0/rules.rich.json',
    },
  ];
  for (const t of targets) assertNonEmptyRules(t.lean, t.rich);
  console.log('ok');
}

main();

