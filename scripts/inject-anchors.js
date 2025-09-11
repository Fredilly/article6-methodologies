#!/usr/bin/env node
/**
 * Inject non-empty provenance anchors (text + optional pages) into rich JSON.
 * Usage: node scripts/inject-anchors.js <method_dir> <anchors.json>
 *
 * anchors.json shape:
 * {
 *   "sections": { "S-1": [ {"type":"text_anchor","quote":"Scope","hint":"Section 1","pages":[3]} ] },
 *   "rules":    { "<rule-id>": [ {"type":"text_anchor","quote":"CF","hint":"Defaults","pages":[10]} ] }
 * }
 *
 * Rules:
 * - Never write pages:[]; omit pages if none.
 * - Deterministic: sort by id; stable JSON ordering.
 */
const fs = require('fs');
const path = require('path');

function readJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function writeJSON(p, obj){ fs.writeFileSync(p, JSON.stringify(obj, null, 2)+'\n', 'utf8'); }
function validLoc(l){ if (!l || l.type !== 'text_anchor' || !l.quote) return false; if (Array.isArray(l.pages) && l.pages.length === 0) delete l.pages; return true; }

function mergeLocators(existing, toAdd){
  const add = (toAdd||[]).filter(validLoc);
  if (add.length === 0) return existing||[];
  const key = (x)=>JSON.stringify({t:x.type,q:x.quote,h:x.hint||null,p:Array.isArray(x.pages)?x.pages:undefined});
  const seen = new Set((existing||[]).map(key));
  for (const loc of add){ const k=key(loc); if (!seen.has(k)) { (existing=existing||[]).push(loc); seen.add(k);} }
  return existing||[];
}

function inject(methodDir, anchors){
  const secPath = path.join(methodDir,'sections.rich.json');
  const rulePath = path.join(methodDir,'rules.rich.json');
  let changed = false;
  if (fs.existsSync(secPath)){
    const sections = readJSON(secPath);
    for (const s of sections){
      const locs = (anchors.sections||{})[s.id];
      if (locs && Array.isArray(locs)){
        s.refs = s.refs || {};
        s.refs.locators = mergeLocators(s.refs.locators, locs);
        changed = true;
      }
    }
    if (changed) writeJSON(secPath, sections);
  }
  changed = false;
  if (fs.existsSync(rulePath)){
    const rules = readJSON(rulePath);
    for (const r of rules){
      const locs = (anchors.rules||{})[r.id];
      if (locs && Array.isArray(locs)){
        r.refs = r.refs || {};
        r.refs.locators = mergeLocators(r.refs.locators, locs);
        changed = true;
      }
    }
    if (changed) writeJSON(rulePath, rules);
  }
}

function main(){
  const dir = process.argv[2]; const ap = process.argv[3];
  if (!dir || !ap){ console.error('Usage: node scripts/inject-anchors.js <method_dir> <anchors.json>'); process.exit(2); }
  const anchors = readJSON(ap);
  inject(path.resolve(dir), anchors);
  console.log('OK: injected anchors into', dir);
}

if (require.main === module) main();

