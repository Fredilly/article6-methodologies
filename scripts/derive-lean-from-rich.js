#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function readJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function writeJSON(p, data){ fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8'); }

function listDirs(root){
  const out = [];
  (function walk(d){
    if (!fs.existsSync(d)) return;
    const ents = fs.readdirSync(d, { withFileTypes: true });
    let has = 0;
    for (const e of ents) if (e.isFile() && (e.name === 'sections.rich.json' || e.name === 'rules.rich.json')) has++;
    if (has >= 2) out.push(d);
    for (const e of ents) if (e.isDirectory()) walk(path.join(d, e.name));
  }) (root);
  return out;
}

function splitSecId(id){
  // Expect forms like 'S-1', 'S-1-2', etc.
  const m = String(id).match(/^S-(\d+(?:-\d+)*)/);
  if (!m) return [];
  return m[1].split('-').map(n=>parseInt(n,10)).filter(Number.isFinite);
}
function cmpSections(a,b){
  const A = splitSecId(a.id), B = splitSecId(b.id);
  const L = Math.max(A.length, B.length);
  for (let i=0;i<L;i++){ const x=A[i]||0, y=B[i]||0; if (x!==y) return x-y; }
  return 0;
}
function parseRuleId(id){
  // Rich rule id like 'S-1.R-0001' or 'S-1-2.R-0001'
  const m = String(id).match(/^S-(\d+(?:-\d+)*)\.R-(\d{4})$/);
  if (!m) throw new Error(`Bad rule id: ${id}`);
  return { sec: m[1], serial: m[2] };
}
function cmpRules(a,b){
  const s = cmpSections({id: a.section_id},{id: b.section_id});
  if (s !== 0) return s;
  const ma = String(a.id).match(/^R-\d+(?:-\d+)*-(\d{4})$/);
  const mb = String(b.id).match(/^R-\d+(?:-\d+)*-(\d{4})$/);
  if (ma && mb) return parseInt(ma[1],10) - parseInt(mb[1],10);
  return String(a.id).localeCompare(String(b.id));
}

function derive(dir){
  const secR = path.join(dir, 'sections.rich.json');
  const ruleR = path.join(dir, 'rules.rich.json');
  if (!fs.existsSync(secR) || !fs.existsSync(ruleR)) return false;
  const sectionsRich = readJSON(secR);
  const sectionsLean = sectionsRich.map(s=>({ id: s.id, title: s.title, anchor: s.anchor ?? undefined })).sort(cmpSections);
  const rulesRich = readJSON(ruleR);
  const rulesLean = rulesRich.map(r => {
    if (!r.summary || !r.refs || !Array.isArray(r.refs.sections) || !r.refs.sections[0]) {
      throw new Error(`Missing summary/refs.sections: ${r.id}`);
    }
    const { sec, serial } = parseRuleId(r.id);
    const tags = Array.from(new Set([r.type, ...(r.tags||[])]));
    return { id: `R-${sec}-${serial}`, section_id: r.refs.sections[0], tags: tags.filter(Boolean), text: r.summary };
  }).sort(cmpRules);
  writeJSON(path.join(dir,'sections.json'), { sections: sectionsLean });
  writeJSON(path.join(dir,'rules.json'), { rules: rulesLean });
  return true;
}

const base = path.resolve(process.argv[2] || path.join(process.cwd(), 'methodologies'));
let n = 0; for (const d of listDirs(base)) if (derive(d)) n++;
console.log(`OK: derived lean JSON for ${n} method folder(s).`);

