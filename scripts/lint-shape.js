#!/usr/bin/env node
/**
 * Domain-specific lints for rules.rich.json files.
 * - boundary zeroing rule must exist
 * - CF defaults require AR-TOOL14 reference
 * - 44/12 conversion must be noted
 * - refs.sections >=1; refs.tools >=1
 * - notes min length; when min items
 * - inputs[].source required
 */
const fs = require('fs');
const path = require('path');

function walk(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, fn);
    else fn(p);
  }
}

function lintRules(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(data) || data.length === 0) return true;
  let hasZero = false;
  const errs = [];
  for (const r of data) {
    if (!r.provenance || !r.provenance.source_ref || !r.provenance.source_hash) {
      errs.push(`${file}: missing provenance fields in ${r.id}`);
    }
    if (!r.refs || !Array.isArray(r.refs.sections) || r.refs.sections.length < 1) {
      errs.push(`${file}: refs.sections missing or empty in ${r.id}`);
    }
    if (!r.refs || !Array.isArray(r.refs.tools) || r.refs.tools.length < 1) {
      errs.push(`${file}: refs.tools missing or empty in ${r.id}`);
    }
    if (!r.notes || r.notes.length < 5) {
      errs.push(`${file}: notes too short in ${r.id}`);
    }
    if (!Array.isArray(r.when) || r.when.length < 1) {
      errs.push(`${file}: when missing in ${r.id}`);
    }
    if (Array.isArray(r.inputs)) {
      for (const i of r.inputs) {
        if (!i.source) errs.push(`${file}: input ${i.name || '?'} missing source in ${r.id}`);
      }
    }
    if (r.logic && /\u0394CO2e\s*:=\s*0/.test(r.logic)) hasZero = true;
    if (Array.isArray(r.inputs)) {
      const cf = r.inputs.find(i => i.name === 'CF' && Object.prototype.hasOwnProperty.call(i, 'default'));
      if (cf && (!r.refs.tools.some(t => /^UNFCCC\/AR-TOOL14@/.test(t)))) {
        errs.push(`${file}: CF default without AR-TOOL14 reference in ${r.id}`);
      }
    }
    if (r.logic && /44\s*\/\s*12/.test(r.logic) && (!r.notes || !/44\s*\/\s*12/.test(r.notes))) {
      errs.push(`${file}: 44/12 logic without note in ${r.id}`);
    }
  }
  if (!hasZero) errs.push(`${file}: missing boundary zeroing rule`);
  if (errs.length) {
    for (const e of errs) console.error('LINT', e);
    return false;
  }
  return true;
}

let ok = true;
walk(path.resolve('methodologies/UNFCCC/Forestry'), p => {
  if (p.endsWith('rules.rich.json')) ok = lintRules(p) && ok;
});
if (!ok) process.exit(1);
