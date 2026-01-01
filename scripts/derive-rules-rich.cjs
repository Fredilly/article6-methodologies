#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const KEYWORD_TYPES = [
  // Must be in the enum:
  // "eligibility", "parameter", "equation", "calc",
  // "monitoring", "leakage", "uncertainty", "reporting"
  { type: 'eligibility', regex: /eligib/i },
  // Treat "baseline" language as parameters
  { type: 'parameter', regex: /baseline/i },
  { type: 'monitoring', regex: /qa\s*\/?\s*qc/i },
  { type: 'monitoring', regex: /monitor/i },
  { type: 'leakage', regex: /leakage/i },
  { type: 'uncertainty', regex: /uncertain/i },
];

const repoRoot = path.resolve(__dirname, '..');

function normalizeWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim();
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        out[key] = sortKeysDeep(value[key]);
      });
    return out;
  }
  return value;
}

function stableStringify(value) {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

function containsTodo(value) {
  return typeof value === 'string' && /todo/i.test(value);
}

function hasTodoDeep(value) {
  if (containsTodo(value)) return true;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => hasTodoDeep(entry));
  return Object.values(value).some((entry) => hasTodoDeep(entry));
}

function isGoodRulesRichJson(rulesPath) {
  if (!fs.existsSync(rulesPath)) return false;
  try {
    const raw = fs.readFileSync(rulesPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 1) return false;
    return !hasTodoDeep(parsed);
  } catch {
    return false;
  }
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

/* ------------------------------------------------------------------
   Canonical UNFCCC rule IDs derived from folder path
   ------------------------------------------------------------------ */

/** Build UNFCCC.<Sector>.<Code>.<vXX-X> from disk path */
function getMethodKeyFromDir(methodDir) {
  const parts = methodDir.split(path.sep);
  const previousIndex = parts.lastIndexOf('previous');
  if (previousIndex !== -1) {
    // Expects: methodologies/UNFCCC/Agriculture/ACM0010/v03-0/previous/v02-0
    const versionTag = parts[previousIndex + 1];
    const rawCode = parts[previousIndex - 2];
    const code = rawCode.replace(/\./g, '-');
    const sector = parts[previousIndex - 3];
    const program = parts[previousIndex - 4];
    return `${program}.${sector}.${code}.${versionTag}`;
  }

  // Expects: methodologies/UNFCCC/Agriculture/ACM0010/v03-0
  const n = parts.length;
  const versionTag = parts[n - 1]; // v03-0
  const rawCode = parts[n - 2]; // ACM0010, AM0073, AMS-III.D, AMS-III.R
  const code = rawCode.replace(/\./g, '-'); // normalize dots → dashes
  const sector = parts[n - 3]; // Agriculture / Forestry / ...
  const program = parts[n - 4]; // UNFCCC

  // Final: UNFCCC.Agriculture.ACM0010.v03-0
  return `${program}.${sector}.${code}.${versionTag}`;
}

/** Correct rule ID: UNFCCC.<Sector>.<Code>.<vXX-X>.R-0001-0001 */
function buildRuleId(methodDir, ruleIndex, sectionId) {
  const methodKey = getMethodKeyFromDir(methodDir);

  // R-0001, R-0002, ...
  const R = String(ruleIndex + 1).padStart(4, '0');

  // S-0001 → 0001
  const S = String(
    (sectionId || '').replace(/^S-/, '') || '1'
  ).padStart(4, '0');

  // UNFCCC.Agriculture.ACM0010.v03-0.R-0001-0001
  return `${methodKey}.R-${R}-${S}`;
}

/* ------------------------------------------------------------------ */

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
  return Array.isArray(data.sections) ? data.sections : [];
}

function deriveRulesForMethod(methodDir, strictMode, isUsablePdf) {
  const dest = path.join(methodDir, 'rules.rich.json');
  const existingGoodRules = isGoodRulesRichJson(dest);

  if (strictMode) {
    const rel = path.relative(repoRoot, methodDir);
    const relParts = rel.split(path.sep);
    const toolsParts = relParts[0] === 'methodologies' ? ['tools', ...relParts.slice(1)] : [...relParts];
    const pdfPath = toolsParts.includes('previous')
      ? path.join(repoRoot, ...toolsParts, 'tools', 'source.pdf')
      : path.join(repoRoot, ...toolsParts, 'source.pdf');
    if (typeof isUsablePdf === 'function' && !isUsablePdf(pdfPath)) {
      if (existingGoodRules) {
        console.log('[rules-rich] source.pdf unusable; keeping existing rules.rich.json (skip-safe)');
        return true;
      }
      throw new Error(
        [
          '[rules-rich] source.pdf unusable and no valid rules.rich.json to keep (missing/placeholder/TODO/empty).',
          '[rules-rich] cannot derive rules.rich.json; ensure git-lfs pulled the real PDF or commit a valid rules.rich.json.',
        ].join('\n'),
      );
    }
  }

  const sections = loadSections(methodDir);
  const contentfulSections = sections.filter(
    (section) => typeof section.content === 'string' && section.content.trim().length > 0,
  ).length;
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

      const sectionId =
        (section.id && section.id.startsWith('S-') && section.id) ||
        section.id ||
        'S-0001';

      rules.push({
        id: buildRuleId(methodDir, idx - 1, sectionId),
        type,
        summary: summarize(sentence),
        logic: sentence,
        refs: { sections: [sectionId] },
      });
    });
  });

  if (!rules.length) {
    if (strictMode && existingGoodRules) {
      console.log('[rules-rich] generated 0 rules; keeping existing rules.rich.json (skip-safe)');
      return true;
    }
    const rel = path.relative(repoRoot, methodDir);
    const message = `[rules-rich] ${rel} produced 0 rules (contentful_sections=${contentfulSections})`;
    if (strictMode) {
      throw new Error(
        [
          message,
          contentfulSections === 0
            ? '[rules-rich] sections.json contains no extractable content; re-run scripts/extract-sections.cjs and verify text extraction (image-only PDFs require OCR).'
            : null,
          '[rules-rich] strict mode requires at least 1 rule; update classifier inputs (sections.json) or provide a valid rules.rich.json.',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    console.warn(message);
    return false;
  }

  const payload = stableStringify(rules);
  if (fs.existsSync(dest)) {
    const before = fs.readFileSync(dest, 'utf8');
    if (before === payload) {
      console.log(`[rules-rich] unchanged ${path.relative(repoRoot, dest)}`);
      return true;
    }
  }
  fs.writeFileSync(dest, payload);
  console.log(`[rules-rich] wrote ${path.relative(repoRoot, dest)} (canonical)`);
  return true;
}

function collectTargets(args) {
  if (args.length === 0) {
    return listMethods(path.join(repoRoot, 'methodologies'));
  }
  return args.map((arg) => path.resolve(arg));
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.length > 0;
  const targets = collectTargets(args);

  if (!targets.length) {
    console.warn('[rules-rich] no method directories found');
    return;
  }

  let isUsablePdf = null;
  try {
    ({ isUsablePdf } = await import('./pdf-preflight.mjs'));
  } catch {
    isUsablePdf = null;
  }

  let success = 0;

  targets.forEach((dir) => {
    try {
      const processed = deriveRulesForMethod(dir, strict, isUsablePdf);
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
