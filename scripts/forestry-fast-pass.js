#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const METHODOLOGIES_DIR = path.join(ROOT, 'methodologies');

const METHOD_CONFIG = {
  'UNFCCC/Forestry/AR-ACM0003/v02-0': {
    sections: ['S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-5', 'S-5', 'S-5'],
    toolHints: [
      ['UNFCCC/AR-ACM0003@v02-0'],
      ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL02@v1.0'],
      ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL08@v4.0.0'],
      ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL14@v4.2'],
      ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL15@v2.0'],
      ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL16@v1.1.0'],
      ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL12@v3.1'],
      ['UNFCCC/AR-ACM0003@v02-0']
    ]
  },
  'UNFCCC/Forestry/AR-AM0014/v03-0': {
    sections: ['S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-5', 'S-5', 'S-5'],
    toolHints: [
      ['UNFCCC/AR-AM0014@v03-0'],
      ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL02@v1.0'],
      ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL08@v4.0.0'],
      ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL14@v4.2'],
      ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL15@v2.0'],
      ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL08@v4.0.0'],
      ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL12@v3.1'],
      ['UNFCCC/AR-AM0014@v03-0']
    ]
  },
  'UNFCCC/Forestry/AR-AMS0003/v01-0': {
    sections: ['S-1', 'S-8', 'S-8', 'S-3', 'S-8', 'S-12', 'S-5', 'S-6', 'S-7', 'S-9', 'S-3', 'S-12', 'S-7'],
    toolHints: Array.from({ length: 13 }, () => ['UNFCCC/AR-AMS0003@v01-0'])
  },
  'UNFCCC/Forestry/AR-AMS0007/v03-1': {
    sections: ['S-1', 'S-8', 'S-8', 'S-3', 'S-8', 'S-12', 'S-5', 'S-6', 'S-7', 'S-9', 'S-3', 'S-12', 'S-7'],
    toolHints: [
      ['UNFCCC/AR-AMS0007@v03-1'],
      ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL14@v4.2'],
      ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL14@v4.2'],
      ['UNFCCC/AR-AMS0007@v03-1'],
      ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL14@v4.2'],
      ['UNFCCC/AR-AMS0007@v03-1'],
      ['UNFCCC/AR-AMS0007@v03-1'],
      ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL14@v4.2'],
      ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL16@v1.1.0'],
      ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL12@v3.1'],
      ['UNFCCC/AR-AMS0007@v03-1'],
      ['UNFCCC/AR-AMS0007@v03-1'],
      ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL16@v1.1.0']
    ]
  }
};

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeysDeep(value[key]);
    }
    return out;
  }
  return value;
}

function writeJSON(filePath, data) {
  const sorted = sortKeysDeep(data);
  fs.writeFileSync(filePath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

function normalizeToolDoc(toolPath) {
  const parts = toolPath.split('/');
  const idx = parts.indexOf('tools');
  if (idx === -1 || idx + 3 >= parts.length) return null;
  const domain = parts[idx + 1];
  const method = parts[idx + 2];
  const version = parts[idx + 3];
  const filename = parts[parts.length - 1];

  const toolMatch = filename.match(/^ar-am-tool-(\d+)-v([\d]+(?:[.-][\d]+)*)\.(pdf|docx)$/i);
  if (toolMatch) {
    const toolNumber = toolMatch[1].padStart(2, '0');
    const rawVersion = toolMatch[2].replace(/-/g, '.');
    const versionString = rawVersion.includes('.') ? rawVersion : `${rawVersion}.0`;
    return `${domain}/AR-TOOL${toolNumber}@v${versionString}`;
  }

  if (/source\.(pdf|docx)$/i.test(filename) || /meth_booklet\.pdf$/i.test(filename)) {
    return `${domain}/${method}@${version}`;
  }

  return null;
}

function normalizeDocAlias(doc, methodRelPath) {
  if (!doc) return doc;
  const parts = methodRelPath.split('/');
  if (parts.length < 4) return doc;
  const methodId = `${parts[0]}/${parts[2]}`;
  const version = parts[3];
  if (doc.startsWith(`${methodId}@`)) {
    return `${methodId}@${version}`;
  }
  return doc;
}

function ensureMetaTools(methodRelPath) {
  const metaPath = path.join(METHODOLOGIES_DIR, methodRelPath, 'META.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const tools = (((meta || {}).references || {}).tools) || [];
  let changed = false;

  for (const tool of tools) {
    const normalized = normalizeToolDoc(tool.path || '');
    if (normalized && tool.doc !== normalized) {
      tool.doc = normalized;
      changed = true;
    }
    if (!Object.prototype.hasOwnProperty.call(tool, 'url')) {
      tool.url = null;
      changed = true;
    }
  }

  if (changed) writeJSON(metaPath, meta);
}

function updateRules(methodRelPath) {
  const config = METHOD_CONFIG[methodRelPath];
  if (!config) return;
  const rulesPath = path.join(METHODOLOGIES_DIR, methodRelPath, 'rules.rich.json');
  if (!fs.existsSync(rulesPath)) return;
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

  const toUniqueSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort();

  rules.forEach((rule, idx) => {
    const hints = (config.toolHints[idx] || []);
    if (!rule.refs) rule.refs = {};

    const existingTools = Array.isArray(rule.refs.tools) ? rule.refs.tools : [];
    const combined = existingTools.concat(hints).map((doc) => normalizeDocAlias(doc, methodRelPath));
    rule.refs.tools = toUniqueSorted(combined);

    const targetSection = config.sections[idx];
    if (targetSection) {
      rule.refs.sections = [targetSection];
    }
  });

  writeJSON(rulesPath, rules);
}

function main() {
  for (const methodRelPath of Object.keys(METHOD_CONFIG)) {
    ensureMetaTools(methodRelPath);
    updateRules(methodRelPath);
  }
}

if (require.main === module) {
  main();
}
