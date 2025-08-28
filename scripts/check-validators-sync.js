#!/usr/bin/env node
// Guard: ensure schemas/** hash matches recorded value in scripts/validators/schemas.sha256
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

function sha256(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
function list(dir){
  const out = [];
  (function walk(d){
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })){
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && p.endsWith('.json')) out.push(p);
    }
  })(dir);
  return out.sort();
}

const schemaDir = path.join(ROOT, 'schemas');
const files = list(schemaDir).filter(p => /\.(schema\.json)$/.test(p));
const concat = files.map(p => p + '\n' + fs.readFileSync(p)).join('\n');
const current = sha256(concat);
const recPath = path.join(ROOT, 'scripts/validators/schemas.sha256');
if (!fs.existsSync(recPath)){
  console.error('validators sync: missing record file', path.relative(ROOT, recPath));
  process.exit(2);
}
const recorded = fs.readFileSync(recPath, 'utf8').trim();
if (recorded !== current){
  console.error('✖ Schemas changed but validators were not regenerated.');
  console.error('  recorded:', recorded);
  console.error('  current :', current);
  console.error('Run the validator generation workflow or rebuild validators and update schemas.sha256');
  process.exit(1);
}
console.log('✓ Validators in sync with schemas');

