#!/usr/bin/env node
// Build a single-file validator bundle from existing standalone validators.
// Output: scripts/validators/bundle.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const VDIR = path.join(__dirname, 'validators');
const OUT = path.join(VDIR, 'bundle.cjs');

function read(p){ return fs.readFileSync(p, 'utf8'); }
function jsonStringLiteral(s){ return JSON.stringify(String(s)); }

const files = {
  META: path.join(VDIR, 'meta.cjs'),
  sections: path.join(VDIR, 'sections.cjs'),
  rules: path.join(VDIR, 'rules.cjs'),
};

for (const [key, p] of Object.entries(files)){
  if (!fs.existsSync(p)) {
    console.error(`ERROR: missing validator file: ${p}`);
    process.exit(2);
  }
}

const parts = [];
parts.push('"use strict";');
parts.push('const vm = require("vm");');
parts.push('function load(code, filename){ const module={exports:{}}; const exports=module.exports; const require=(m)=>{ throw new Error("bundle has no external require: "+m); }; vm.runInNewContext(code, {module, exports, require}, {filename}); return module.exports; }');
for (const [name, p] of Object.entries(files)){
  const code = read(p);
  parts.push(`const ${name} = load(${jsonStringLiteral(code)}, ${jsonStringLiteral(path.basename(p))});`);
}
parts.push('module.exports = { META, sections, rules };');

fs.writeFileSync(OUT, parts.join('\n') + '\n', 'utf8');
console.log('OK: wrote', path.relative(ROOT, OUT));

