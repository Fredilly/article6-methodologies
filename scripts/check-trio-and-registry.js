#!/usr/bin/env node
// Verify every methodologies/**/v*/ contains META.json, sections.json, rules.json
// and registry.json lists each version exactly once with matching path+version.
const fs = require('fs');
const path = require('path');

function sourceAssetPath(meta) {
  const provenancePath = (((meta || {}).provenance || {}).source_pdfs || [])[0]?.path;
  if (provenancePath) return provenancePath;
  if (!meta || !meta.id || !meta.version) return null;
  const parts = String(meta.id).split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const publisher = parts[0];
  const middle = parts.slice(1, -1);
  const code = parts[parts.length - 1];
  const segments = ['source-assets', publisher].concat(middle, [code, meta.version, 'source.pdf']);
  return segments.join('/');
}

function *walk(d){
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d,{withFileTypes:true})){
    const p = path.join(d,e.name);
    if (e.isDirectory()) {
      if (/^v\d/.test(e.name)) yield p;
      yield *walk(p);
    }
  }
}

let failed = 0;
const vdirs = [...walk('methodologies')].map(p=>p.split(path.sep).join('/')).sort();
const isPreviousDir = (dir) => dir.includes('/previous/');
for (const d of vdirs){
  const metaPath = path.join(d, 'META.json');
  if (!fs.existsSync(metaPath)) {
    console.error(`✖ MISSING META.json in ${d}`);
    failed = 1;
    continue;
  }
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (err) {
    console.error(`✖ META.json invalid JSON in ${d}: ${err.message}`);
    failed = 1;
    continue;
  }
  const audit = (meta && meta.audit_hashes) || {};
  if (isPreviousDir(d)) {
    const relSource = sourceAssetPath(meta);
    if (!relSource) {
      console.error(`✖ unable to derive source asset path for ${d}`);
      failed = 1;
    } else {
      if (!fs.existsSync(relSource)) {
        console.error(`✖ missing source asset ${relSource} for ${d}`);
        failed = 1;
      }
    }
    if (!audit.source_pdf_sha256) {
      console.error(`✖ audit_hashes.source_pdf_sha256 missing for ${d}`);
      failed = 1;
    }
    continue;
  }
  for (const f of ['sections.json','rules.json']){
    const p = path.join(d, f);
    if (!fs.existsSync(p)) { console.error(`✖ MISSING ${f} in ${d}`); failed = 1; }
  }
  if (!audit.source_pdf_sha256 || !audit.sections_json_sha256 || !audit.rules_json_sha256) {
    console.error(`✖ audit_hashes fields missing for ${d}`);
    failed = 1;
  }
}
if (!failed) console.log('✓ All version dirs contain required artifacts');

// Registry checks
if (!fs.existsSync('registry.json')){
  console.error('✖ registry.json missing');
  process.exit(2);
}
let reg;
try { reg = JSON.parse(fs.readFileSync('registry.json','utf8')); }
catch (e){ console.error('✖ registry.json invalid JSON:', e.message); process.exit(2); }
if (!Array.isArray(reg)) { console.error('✖ registry.json is not an array'); process.exit(2); }

function verFromDir(vdir){ return vdir.slice(1).replace(/-/g,'.'); }

let ok = 1;
for (const v of vdirs){
  if (isPreviousDir(v)) continue;
  const base = v.substring(v.lastIndexOf('/')+1);
  const version = verFromDir(base);
  const matches = reg.filter(e => e.path === v && e.version === version);
  if (matches.length !== 1){
    if (matches.length === 0){ console.error('✖ registry missing entry for', v, 'version', version); }
    else { console.error('✖ registry duplicate/conflict for', v, 'version', version, 'count=', matches.length); }
    ok = 0;
  }
}
for (const e of reg){
  if (!vdirs.includes(e.path)) { console.error('✖ registry lists non-existent path', e.path); ok = 0; }
}
if (ok) console.log('✓ registry.json matches version dirs with correct path + version');

process.exit(failed || !ok ? 1 : 0);
