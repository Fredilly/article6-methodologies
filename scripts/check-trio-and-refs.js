#!/usr/bin/env node
const fs = require('fs'), path = require('path');
let fail = 0;

function listVersionDirs() {
  const root = 'methodologies', out = [];
  (function walk(d){
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d,{withFileTypes:true})) {
      const p = path.join(d,e.name);
      if (e.isDirectory()) {
        if (/^v\d/.test(e.name)) out.push(p);
        walk(p);
      }
    }
  }) (root);
  return out;
}
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };

function grepToolTokens(txt){
  const m = txt.match(/"([A-Za-z]+\/[A-Za-z0-9\-]+@v[0-9][0-9.\-]*)"/g) || [];
  return [...new Set(m.map(s=>s.slice(1,-1)))];
}
function toolFileExists(token){
  const [std, rest] = token.split('/');
  const [tool, ver] = rest.split('@v');
  const rx = new RegExp(`${tool.replace(/-/g,'[-_]')}_v${ver.replace(/\./g,'[-.]')}`, 'i');
  let hit = false;
  (function walk(d){
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d,{withFileTypes:true})) {
      const p = path.join(d,e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && /\.pdf$/i.test(e.name) && rx.test(e.name)) hit = true;
    }
  }) ('tools');
  return hit;
}

for (const dir of listVersionDirs()){
  for (const f of ['META.json','sections.json','rules.json']){
    const p = path.join(dir,f);
    if (!exists(p)) { console.error(`✖ MISSING ${p}`); fail = 1; }
  }
  const rpath = path.join(dir,'rules.json');
  if (exists(rpath)) {
    const toks = grepToolTokens(fs.readFileSync(rpath,'utf8'));
    for (const t of toks) if (!toolFileExists(t)) {
      console.error(`✖ Tool ref not found for ${t} (from ${rpath})`); fail = 1;
    }
  }
}
if (fail) process.exit(1); else console.log('✓ Trio + refs OK');
