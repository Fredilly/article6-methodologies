#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG = {
  'UNFCCC/Forestry/AR-ACM0003/v02-0': {
    sections: ['S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-5', 'S-5', 'S-5'],
    toolHints: [
      ['UNFCCC/AR-ACM0003@v02-0'],
      ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL02@v1'],
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
      ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL02@v1'],
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
    toolHints: Array(13).fill().map(() => ['UNFCCC/AR-AMS0003@v01-0'])
  },
  'UNFCCC/Forestry/AR-AMS0007/v03-1': {
    sections: ['S-1', 'S-8', 'S-8', 'S-3', 'S-8', 'S-12', 'S-5', 'S-6', 'S-7', 'S-9', 'S-3', 'S-12', 'S-7'],
    toolHints: [
      ['UNFCCC/AR-AMS0007@v03.1'],
      ['UNFCCC/AR-AMS0007@v03.1', 'UNFCCC/AR-TOOL14@v4.2'],
      ['UNFCCC/AR-AMS0007@v03.1', 'UNFCCC/AR-TOOL14@v4.2'],
      ['UNFCCC/AR-AMS0007@v03.1'],
      ['UNFCCC/AR-AMS0007@v03.1', 'UNFCCC/AR-TOOL14@v4.2'],
      ['UNFCCC/AR-AMS0007@v03.1'],
      ['UNFCCC/AR-AMS0007@v03.1'],
      ['UNFCCC/AR-AMS0007@v03.1', 'UNFCCC/AR-TOOL14@v4.2'],
      ['UNFCCC/AR-AMS0007@v03.1', 'UNFCCC/AR-TOOL16@v1.1.0'],
      ['UNFCCC/AR-AMS0007@v03.1', 'UNFCCC/AR-TOOL12@v3.1'],
      ['UNFCCC/AR-AMS0007@v03.1'],
      ['UNFCCC/AR-AMS0007@v03.1'],
      ['UNFCCC/AR-AMS0007@v03.1', 'UNFCCC/AR-TOOL16@v1.1.0']
    ]
  }
};

function normalizeToolIdFromPath(pth, fallbackDoc) {
  if (!pth) return fallbackDoc || null;
  const parts = pth.split('/');
  const idx = parts.indexOf('tools');
  if (idx === -1) return fallbackDoc || null;
  const domain = parts[idx + 1];
  const method = parts[idx + 2];
  const version = parts[idx + 3];
  const file = parts[parts.length - 1];
  const toolMatch = file.match(/ar-am-tool-(\d+)-v([\d.]+)\.(pdf|docx)$/i);
  if (toolMatch) {
    const tool = toolMatch[1].padStart(2, '0');
    return `${domain}/AR-TOOL${tool}@v${toolMatch[2]}`;
  }
  if (/AR-TOOL(\d+)_v([\d-]+)\.(pdf|docx)$/i.test(file)) {
    const m = file.match(/AR-TOOL(\d+)_v([\d-]+)\.(pdf|docx)$/i);
    if (m) {
      const ver = m[2].replace(/-/g, '.');
      return `${domain}/AR-TOOL${m[1]}@v${ver}`;
    }
  }
  if (/source\.(pdf|docx)$/i.test(file) || /meth_booklet\.pdf$/i.test(file)) {
    return `${domain}/${method}@${version}`;
  }
  return fallbackDoc || `${domain}/${method}@${version}`;
}

function ensureMetaToolDocs(metaPath) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const tools = (((meta || {}).references || {}).tools) || [];
  let changed = false;
  for (const tool of tools) {
    if (!tool.doc || !tool.doc.trim()) {
      const docId = normalizeToolIdFromPath(tool.path, null);
      if (docId) {
        tool.doc = docId;
        changed = true;
      }
    }
  }
  if (changed) {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  }
  return tools.map((tool) => tool.doc).filter(Boolean);
}

function padRuleIndex(idx) {
  return String(idx + 1).padStart(4, '0');
}

function toSimpleId(idx) {
  return `R-1-${padRuleIndex(idx)}`;
}

function rewriteMethod(methodRelPath) {
  const methodDir = path.join('methodologies', methodRelPath);
  const metaPath = path.join(methodDir, 'META.json');
  const leanPath = path.join(methodDir, 'rules.json');
  const richPath = path.join(methodDir, 'rules.rich.json');
  if (!fs.existsSync(leanPath) || !fs.existsSync(richPath) || !fs.existsSync(metaPath)) {
    return;
  }

  const allowedDocs = new Set(ensureMetaToolDocs(metaPath));
  const config = CONFIG[methodRelPath];
  const lean = JSON.parse(fs.readFileSync(leanPath, 'utf8'));
  const rich = JSON.parse(fs.readFileSync(richPath, 'utf8'));
  const leanRules = Array.isArray(lean.rules) ? lean.rules : [];
  const richRules = Array.isArray(rich) ? rich : [];
  const richByKey = new Map();
  richRules.forEach((rule) => {
    const key = (rule.summary || rule.logic || '').trim();
    if (key) {
      if (!richByKey.has(key)) richByKey.set(key, []);
      richByKey.get(key).push(rule);
    }
  });

  const rewrittenRich = [];

  const maxLen = leanRules.length;
  for (let i = 0; i < maxLen; i += 1) {
    const leanRule = leanRules[i];
    const simpleId = toSimpleId(i);
    const targetSection = (config && config.sections && config.sections[i]) || leanRule.section_id;
    const toolHints = ((config && config.toolHints && config.toolHints[i]) || []).filter((doc) => allowedDocs.has(doc));

    const key = (leanRule.text || '').trim();
    const richCandidates = key && richByKey.get(key) ? richByKey.get(key) : [];
    const richRule = richCandidates.length ? richCandidates.shift() : (richRules[i] || null);
    if (!richRule) continue;
    rewrittenRich.push(richRule);
    leanRule.id = simpleId;
    if (targetSection) {
      leanRule.section_id = targetSection;
    }
    const prefix = richRule.id.split('.').slice(0, -1).join('.');
    richRule.id = `${prefix}.${simpleId}`;

    const summary = richRule.summary || richRule.logic || leanRule.text;
    leanRule.title = summary;
    leanRule.inputs = Array.isArray(richRule.inputs) ? richRule.inputs : [];
    leanRule.when = Array.isArray(richRule.when) ? richRule.when : [];
    // Tools parity
    const existingRichTools = new Set(Array.isArray(richRule.refs && richRule.refs.tools) ? richRule.refs.tools : []);
    const existingLeanTools = new Set(Array.isArray(leanRule.tools) ? leanRule.tools : []);
    for (const doc of toolHints) {
      existingRichTools.add(doc);
      existingLeanTools.add(doc);
    }
    const richToolsArray = Array.from(existingRichTools).filter((doc) => allowedDocs.has(doc));
    if (!richRule.refs) richRule.refs = {};
    richRule.refs.tools = richToolsArray;
    leanRule.tools = Array.from(existingLeanTools).filter((doc) => allowedDocs.has(doc));

    // Align section references in rich rule
    if (!richRule.refs) richRule.refs = {};
    richRule.refs.sections = targetSection ? [targetSection] : (richRule.refs.sections || []);
  }

  lean.rules = leanRules;
  fs.writeFileSync(leanPath, JSON.stringify(lean, null, 2) + '\n', 'utf8');
  fs.writeFileSync(richPath, JSON.stringify(rewrittenRich, null, 2) + '\n', 'utf8');
}

function main() {
  for (const methodRelPath of Object.keys(CONFIG)) {
    rewriteMethod(methodRelPath);
  }
}

if (require.main === module) {
  main();
}
