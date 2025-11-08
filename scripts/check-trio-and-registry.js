#!/usr/bin/env node
// Verify every methodologies/**/v*/ contains META.json, sections.json, rules.json
// and registry.json lists each version exactly once with matching path+version.
const fs = require('fs');
const path = require('path');

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
  if (isPreviousDir(d)) continue;
  for (const f of ['META.json','sections.json','rules.json']){
    const p = path.join(d, f);
    if (!fs.existsSync(p)) { console.error(`✖ MISSING ${f} in ${d}`); failed = 1; }
  }
}
if (!failed) console.log('✓ All version dirs contain META.json, sections.json, rules.json');

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
