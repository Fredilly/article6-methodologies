#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const MROOT = path.join(ROOT, 'methodologies');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function* walk(dir) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const p=path.join(dir,e.name); if (e.isDirectory()) yield* walk(p); else if (e.isFile() && e.name==='META.json') yield p; } }

function readPointer(filePath) {
  const buf = fs.readFileSync(filePath, 'utf8');
  if (!buf.startsWith('version https://git-lfs.github.com/spec/v1')) return null;
  const oidMatch = buf.match(/oid sha256:([0-9a-f]{64})/);
  if (!oidMatch) return null;
  const sizeMatch = buf.match(/size (\d+)/);
  return { sha256: oidMatch[1], size: sizeMatch ? Number(sizeMatch[1]) : null };
}

let failed = 0;
for (const metaPath of walk(MROOT)) {
  let meta; try { meta = JSON.parse(fs.readFileSync(metaPath,'utf8')); } catch (e) { console.error(`✖ META invalid JSON: ${metaPath} — ${e.message}`); failed=1; continue; }
  const tools = (((meta||{}).references||{}).tools)||[];
  if (!Array.isArray(tools) || tools.length===0) { console.log(`ℹ No tool refs in ${metaPath}`); continue; }
  const issues = [];
  const key = (tool) => String(tool.path || tool.pointer || '');
  for (const t of tools.slice().sort((a,b)=>key(a).localeCompare(key(b)))) {
    const relPath = t.path || t.pointer;
    if (!relPath) { issues.push({kind:'missing', path:'<unset>'}); continue; }
    const absPath = t.path
      ? path.join(ROOT, relPath)
      : path.join(path.dirname(metaPath), relPath);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) { issues.push({kind:'missing', path:relPath}); continue; }
    const pointer = readPointer(absPath);
    let actual = sha256(fs.readFileSync(absPath));
    if (pointer && pointer.sha256) actual = pointer.sha256;
    if (String(t.sha256) !== actual) issues.push({kind:'mismatch', path:relPath, recorded:String(t.sha256), actual});
  }
  if (issues.length) { console.error(`✖ META tool hash failures: ${metaPath}`); for (const it of issues){ if (it.kind==='missing') console.error(`  - MISSING: ${it.path}`); else console.error(`  - MISMATCH: ${it.path}\n    recorded: ${it.recorded}\n    actual  : ${it.actual}`);} failed=1; }
}
process.exit(failed?1:0);
