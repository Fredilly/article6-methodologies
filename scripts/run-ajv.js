#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const Ajv = (require('ajv').default ?? require('ajv'));
const addFormats = require('ajv-formats');

function expandGlob(pattern, cwd = process.cwd()) {
  const parts = pattern.split('/').filter(Boolean);
  function walk(dir, i) {
    if (i === parts.length) return [dir];
    const part = parts[i];
    if (part === '**') {
      let out = walk(dir, i + 1);
      for (const e of fs.readdirSync(dir)) {
        const p = path.join(dir, e);
        if (fs.statSync(p).isDirectory()) out = out.concat(walk(p, i));
      }
      return out;
    }
    const isWildcard = part.includes('*');
    const rx = isWildcard
      ? new RegExp('^' + part.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g, '.*') + '$')
      : null;
    const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    let out = [];
    for (const e of entries) {
      if (isWildcard ? rx.test(e) : e === part) {
        const p = path.join(dir, e);
        const st = fs.statSync(p);
        const last = i === parts.length - 1;
        if (last && st.isFile()) out.push(p);
        if (st.isDirectory()) out = out.concat(walk(p, i + 1));
      }
    }
    return out;
  }
  return walk(cwd, 0).filter(f => fs.statSync(f).isFile());
}

function usage() {
  console.log('Usage: node scripts/run-ajv.js validate -s <schema> -d <glob>');
  process.exit(2);
}

const args = process.argv.slice(2);
if (args[0] !== 'validate') usage();
const sIdx = args.indexOf('-s');
const dIdx = args.indexOf('-d');
if (sIdx === -1 || dIdx === -1) usage();

const schemaPath = args[sIdx + 1];
const dataGlob  = args[dIdx + 1];

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const files = expandGlob(dataGlob);
let failed = 0;
for (const file of files) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`${file} invalid JSON: ${e.message}`);
    failed++; continue;
  }
  if (validate(data)) {
    console.log(`${file} valid`);
  } else {
    failed++;
    console.log(`${file} invalid`);
    console.log(JSON.stringify(validate.errors, null, 2));
  }
}
process.exit(failed ? 1 : 0);
