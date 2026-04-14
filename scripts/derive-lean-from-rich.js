#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function readJSON(p){
  try { return JSON.parse(fs.readFileSync(p,'utf8')); }
  catch (err) { throw new Error(`[derive] failed to read ${path.relative(process.cwd(), p)}: ${err.message}`); }
}
function writeJSON(p, data){
  const payload = JSON.stringify(data, null, 2) + '\n';
  if (fs.existsSync(p)) { if (fs.readFileSync(p, 'utf8') === payload) return; }
  fs.writeFileSync(p, payload, 'utf8');
}

const PREV = `${path.sep}previous${path.sep}`;

function isPreviousDir(p){ return p.includes(PREV); }

function listDirs(root, allowPrevious){
  const out = [];
  (function walk(d){
    if (!fs.existsSync(d)) return;
    if (!allowPrevious && d !== root && isPreviousDir(d)) return;
    const ents = fs.readdirSync(d, { withFileTypes: true });
    let has = 0;
    for (const e of ents) if (e.isFile() && (e.name === 'sections.rich.json' || e.name === 'rules.rich.json')) has++;
    if (has >= 2 && (allowPrevious || !isPreviousDir(d))) out.push(d);
    for (const e of ents) if (e.isDirectory()) walk(path.join(d, e.name));
  })(root);
  return out;
}

function splitSecId(id){
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

function derive(dir){
  const secR = path.join(dir, 'sections.rich.json');
  const ruleR = path.join(dir, 'rules.rich.json');
  if (!fs.existsSync(secR) || !fs.existsSync(ruleR)) {
    console.warn(`[derive] skip ${path.relative(process.cwd(), dir)} (missing rich)`);
    return false;
  }

  const sectionsRich = readJSON(secR);
  const sectionLookup = new Map();

  // Derive lean sections (unchanged shape)
  const sectionsLean = sectionsRich.map(s => {
    const lean = {
      id: s.id,
      title: s.title,
      anchor: s.anchor ?? undefined,
      section_number: s.section_number ?? undefined,
      stable_id: s.stable_id ?? undefined
    };
    sectionLookup.set(s.id, lean);
    return lean;
  }).sort(cmpSections);

  const rulesRich = readJSON(ruleR);

  // Canonical base contract:
  // { id, stable_id, title, logic, type, refs: { methodology, primary_section, section_anchor, section_number, section_stable_id, sections, tools }, tags? }
  const rulesLean = rulesRich.map(r => {
    const refs = r.refs || {};
    const primarySection = refs.sections?.[0] || refs.primary_section || '';
    const section = sectionLookup.get(primarySection) || {};

    // Extract short rule ID (e.g., R-1-0001) from stable_id
    const shortIdMatch = (r.stable_id || r.id || '').match(/\.(R-\d+(?:-\d+)*-\d{4})$/);
    const shortId = shortIdMatch ? shortIdMatch[1] : r.id;

    return {
      id: shortId,
      stable_id: r.stable_id,
      title: r.summary || r.display?.title || '',
      logic: typeof r.logic === 'string' ? r.logic : undefined,
      type: r.type || (Array.isArray(r.tags) ? r.tags[0] : undefined),
      refs: {
        methodology: refs.methodology,
        primary_section: primarySection,
        section_anchor: refs.section_anchor ?? section.anchor,
        section_number: refs.section_number ?? section.section_number,
        section_stable_id: refs.section_stable_id ?? section.stable_id,
        sections: refs.sections || [primarySection],
        tools: Array.isArray(refs.tools) ? refs.tools : undefined
      },
      tags: Array.isArray(r.tags) && r.tags.length ? r.tags : undefined
    };
  }).sort((a, b) => {
    const sa = a.refs.primary_section, sb = b.refs.primary_section;
    if (sa !== sb) return (sa || '').localeCompare(sb || '');
    return (a.id || '').localeCompare(b.id || '');
  });

  // Clean refs: remove undefined values
  for (const r of rulesLean) {
    for (const k of Object.keys(r.refs)) {
      if (r.refs[k] === undefined) delete r.refs[k];
    }
    if (Object.keys(r.tags || {}).length === 0) delete r.tags;
  }

  writeJSON(path.join(dir, 'sections.json'), { sections: sectionsLean });
  writeJSON(path.join(dir, 'rules.json'), { rules: rulesLean });
  return true;
}

const rawArgs = process.argv.slice(2);
const allowPrevious = rawArgs.includes('--include-previous');
const positional = rawArgs.filter(a => a !== '--include-previous');
const base = path.resolve(positional[0] || path.join(process.cwd(), 'methodologies'));

let n = 0;
for (const d of listDirs(base, allowPrevious)) if (derive(d)) n++;
console.log(`OK: derived lean JSON for ${n} method folder(s).`);
