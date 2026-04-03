#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const methodPaths = [
  'methodologies/UNFCCC/Forestry/AR-ACM0003/v02-0/rules.rich.json',
  'methodologies/UNFCCC/Forestry/AR-AM0014/v01-0-0/rules.rich.json',
  'methodologies/UNFCCC/Forestry/AR-AM0014/v02-0-0/rules.rich.json',
  'methodologies/UNFCCC/Forestry/AR-AM0014/v03-0/rules.rich.json',
  'methodologies/UNFCCC/Forestry/AR-AMS0003/v01-0/rules.rich.json',
  'methodologies/UNFCCC/Forestry/AR-AMS0007/v03-1/rules.rich.json',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  for (const relPath of methodPaths) {
    const rules = readJson(path.join(repoRoot, relPath));
    for (const rule of rules) {
      const display = rule.display || {};
      assert.notStrictEqual(
        display.logic,
        rule.logic,
        `${relPath} ${rule.id}: display.logic should be omitted when it duplicates logic`,
      );
      assert.notStrictEqual(
        display.notes,
        rule.notes,
        `${relPath} ${rule.id}: display.notes should be omitted when it duplicates notes`,
      );
      assert.notDeepStrictEqual(
        display.when,
        rule.when,
        `${relPath} ${rule.id}: display.when should be omitted when it duplicates when`,
      );

      const hasCollapsedTitleSummary =
        typeof display.title === 'string' &&
        typeof display.summary === 'string' &&
        display.title === display.summary &&
        display.summary === rule.summary;
      assert.ok(
        !hasCollapsedTitleSummary,
        `${relPath} ${rule.id}: display.title/display.summary/summary should not collapse to the same text`,
      );

      if (typeof display.title === 'string') {
        assert.notStrictEqual(
          display.title,
          rule.summary,
          `${relPath} ${rule.id}: display.title should be omitted when it duplicates summary`,
        );
      }
      if (typeof display.summary === 'string') {
        assert.notStrictEqual(
          display.summary,
          rule.summary,
          `${relPath} ${rule.id}: display.summary should be omitted when it duplicates summary`,
        );
      }
    }
  }

  console.log('ok');
}

main();
