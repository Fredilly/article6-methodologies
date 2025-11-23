#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const KEYWORD_TYPES = [
  { type: 'eligibility', regex: /eligib/i },
  { type: 'baseline', regex: /baseline/i },
  { type: 'monitoring', regex: /qa\s*\/?\s*qc/i },
  { type: 'monitoring', regex: /monitor/i },
  { type: 'leakage', regex: /leakage/i },
  { type: 'uncertainty', regex: /uncertain/i },
];

const repoRoot = path.resolve(__dirname, '..');

function normalizeWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim();
}

function summarize(text) {
  const clean = normalizeWhitespace(text);
  if (clean.length <= 240) return clean;
  return `${clean.slice(0, 237)}...`;
}

function splitCandidates(content) {
  if (!content) return [];
  const normalized = content.replace(/\r/g, '\n');
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => normalizeWhitespace(p))
    .filter(Boolean);
  const candidates = [];
  paragraphs.forEach((paragraph) => {
    const sentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
    if (sentences.length <= 1) {
      candidates.push(paragraph);
    } else {
      sentences
        .map((sentence) => normalizeWhitespace(sentence))
        .filter(Boolean)
        .forEach((sentence) => candidates.push(sentence));
    }
  });
  return candidates;
}

function classify(sentence) {
  for (const { type, regex } of KEYWORD_TYPES) {
    if (regex.test(sentence)) return type;
  }
  return null;
}

function formatRuleId(sectionId, index) {
  return `${sectionId}.R-${String(index).padStart(4, '0')}`;
}

function isPreviousDir(dir) {
  return dir.split(path.sep).includes('previous');
}

function listMethods(root) {
  const methods = [];
  (function walk(current) {
    if (!fs.existsSync(current)) return;
    const stat = fs.statSync(current);
    if (!stat.isDirectory()) return;
    if (current !== root && isPreviousDir(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === 'sections.json')) {
      methods.push(current);
      return;
    }
    entries
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => walk(path.join(current, entry.name)));
  })(root);
  return methods;
}

function loadSections(methodDir) {
  const sectionsPath = path.join(methodDir, 'sections.json');
  if (!fs.existsSync(sectionsPath)) {
    throw new Error(`missing sections.json for ${methodDir}`);
  }
  const data = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'));
  const sections = Array.isArray(data.sections) ? data.sections : [];
  return sections;
}

function deriveRulesForMethod(methodDir, strictMode) {
  const sections = loadSections(methodDir);
  const rules = [];
  sections.forEach((section) => {
    const content = section.content || '';
    const candidates = splitCandidates(content);
    if (!candidates.length) return;
    let idx = 0;
    candidates.forEach((sentence) => {
      const type = classify(sentence);
      if (!type) return;
      idx += 1;
      rules.push({
        id: formatRuleId(section.id, idx),
        type,
        summary: summarize(sentence),
        logic: sentence,
        refs: { sections: [section.id] },
      });
    });
  });
  if (!rules.length) {
    const message = `[rules-rich] ${path.relative(repoRoot, methodDir)} produced 0 rules`;
    if (strictMode) {
      throw new Error(message);
    }
    console.warn(message);
    return false;
  }
  const dest = path.join(methodDir, 'rules.rich.json');
  fs.writeFileSync(dest, `${JSON.stringify(rules, null, 2)}\n`);
  console.log(`[rules-rich] wrote ${path.relative(repoRoot, dest)}`);
  return true;
}

function collectTargets(args) {
  if (args.length === 0) {
    return listMethods(path.join(repoRoot, 'methodologies'));
  }
  return args.map((arg) => path.resolve(arg));
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.length > 0;
  const targets = collectTargets(args);
  if (!targets.length) {
    console.warn('[rules-rich] no method directories found');
    return;
  }
  let success = 0;
  targets.forEach((dir) => {
    try {
      const processed = deriveRulesForMethod(dir, strict);
      if (processed) success += 1;
    } catch (err) {
      console.error(`[rules-rich] ${err.message}`);
      if (strict) process.exit(2);
    }
  });
  if (!strict) {
    console.log(`[rules-rich] derived rules for ${success} method(s)`);
  }
}

main();
