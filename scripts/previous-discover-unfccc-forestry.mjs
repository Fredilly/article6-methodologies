#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { compareVersionsDesc, deterministicGeneratedAt, writeJson } from './utils/cli.mjs';

function listForestryMethodsFromRepoTree() {
  const baseDir = path.resolve(process.cwd(), 'methodologies/UNFCCC/Forestry');
  if (!fs.existsSync(baseDir)) {
    console.error(`[previous:discover] missing directory: ${path.relative(process.cwd(), baseDir)}`);
    process.exit(2);
  }

  const methods = [];
  const codeEntries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const codeEntry of codeEntries) {
    if (!codeEntry.isDirectory()) continue;
    const code = codeEntry.name;
    const codeDir = path.join(baseDir, code);
    const versionEntries = fs.readdirSync(codeDir, { withFileTypes: true });
    const versionSet = new Set();
    for (const e of versionEntries) {
      if (!e.isDirectory()) continue;
      const v = e.name;
      if (!/^v\d+-\d+$/.test(v)) continue;
      versionSet.add(v);

      const prevDir = path.join(codeDir, v, 'previous');
      if (!fs.existsSync(prevDir)) continue;
      const prevStat = fs.statSync(prevDir);
      if (!prevStat.isDirectory()) continue;
      const prevEntries = fs.readdirSync(prevDir, { withFileTypes: true });
      for (const pe of prevEntries) {
        if (!pe.isDirectory()) continue;
        const pv = pe.name;
        if (!/^v\d+-\d+$/.test(pv)) continue;
        versionSet.add(pv);
      }
    }

    const versions = Array.from(versionSet).sort(compareVersionsDesc);

    if (versions.length === 0) continue;
    methods.push({ code, versions });
  }

  methods.sort((a, b) => a.code.localeCompare(b.code, 'en', { sensitivity: 'variant' }));
  return methods;
}

async function main() {
  const outPath = 'registry/UNFCCC/Forestry/previous-versions.json';
  const payload = {
    generated_at: deterministicGeneratedAt(),
    program: 'UNFCCC',
    sector: 'Forestry',
    methods: listForestryMethodsFromRepoTree()
  };
  writeJson(path.resolve(process.cwd(), outPath), payload);
  console.log(`[previous:discover] wrote ${outPath}`);
}

await main();
