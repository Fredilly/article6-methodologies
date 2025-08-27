#!/usr/bin/env node
const fs = require('fs'), path = require('path');
function sortDeep(o){ if(Array.isArray(o)) return o.map(sortDeep);
  if(o && typeof o==='object'){ return Object.keys(o).sort()
    .reduce((a,k)=> (a[k]=sortDeep(o[k]), a),{}); }
  return o; }
function walk(dir){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const p = path.join(dir,e.name);
  if(e.isDirectory()) walk(p);
  else if(e.isFile() && e.name==='META.json'){
    const raw = fs.readFileSync(p,'utf8'); const data = JSON.parse(raw);
    const out = JSON.stringify(sortDeep(data), null, 2) + '\n';
    if(out !== raw){ fs.writeFileSync(p, out, 'utf8'); console.log('fixed', p); }
  } } }
walk(path.resolve('methodologies'));
