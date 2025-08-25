#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, d) {
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
}

function splitSecId(id) {
  return (id || '')
    .replace(/^S-/, '')
    .split('-')
    .map((x) => parseInt(x, 10))
    .filter(Number.isFinite);
}

function cmpSections(a, b) {
  const A = splitSecId(a.id);
  const B = splitSecId(b.id);
  const L = Math.max(A.length, B.length);
  for (let i = 0; i < L; i++) {
    const x = A[i] || 0;
    const y = B[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function parseRuleId(id) {
  const m = id.match(/\.R-(\d+(?:-\d+)*)-(\d{4})$/);
  if (!m) throw new Error(`Bad rule id: ${id}`);
  return { sec: m[1], serial: m[2] };
}

function cmpRules(a, b) {
  const s = cmpSections({ id: a.section_id }, { id: b.section_id });
  if (s !== 0) return s;
  const ma = a.id.match(/^R-\d+(?:-\d+)*-(\d{4})$/);
  const mb = b.id.match(/^R-\d+(?:-\d+)*-(\d{4})$/);
  if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
  return a.id.localeCompare(b.id);
}

function compileMethod(dir) {
  const secR = path.join(dir, 'sections.rich.json');
  const ruleR = path.join(dir, 'rules.rich.json');
  if (!fs.existsSync(secR) || !fs.existsSync(ruleR)) return false;
  const secL = path.join(dir, 'sections.json');
  const ruleL = path.join(dir, 'rules.json');
  const sectionsRich = readJson(secR);
  const sectionsLean = sectionsRich
    .map((s) => ({ id: s.id, title: s.title, anchor: s.anchor ?? undefined }))
    .sort(cmpSections);
  const rulesRich = readJson(ruleR);
  const rulesLean = rulesRich
    .map((r) => {
      if (!r.summary || !r.refs || !Array.isArray(r.refs.sections) || !r.refs.sections[0]) {
        throw new Error(`Missing summary/refs.sections: ${r.id}`);
      }
      const { sec, serial } = parseRuleId(r.id);
      return {
        id: `R-${sec}-${serial}`,
        tags: Array.from(new Set([r.type, ...(r.tags || [])])).filter(Boolean),
        text: r.summary,
        section_id: r.refs.sections[0]
      };
    })
    .sort(cmpRules);
  writeJson(secL, { sections: sectionsLean });
  writeJson(ruleL, { rules: rulesLean });
  return true;
}

function walk(root) {
  let n = 0;
  const st = [root];
  while (st.length) {
    const d = st.pop();
    const es = fs.readdirSync(d, { withFileTypes: true });
    const c = compileMethod(d);
    if (c) n++;
    for (const e of es) if (e.isDirectory()) st.push(path.join(d, e.name));
  }
  return n;
}

const base = process.argv[2] || path.join(process.cwd(), 'methodologies');
if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
  console.error(`ERROR: not a directory: ${base}`);
  process.exit(1);
}
const n = walk(base);
console.log(`OK: compiled ${n} method folder(s).`);
