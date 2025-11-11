#!/usr/bin/env node
/*
Fill provenance blocks for a target methodology version deterministically.

For META.json:
- Add provenance.author and provenance.date (UTC, from automation.repo_commit)
- Ensure provenance.source_pdfs includes {kind,path,sha256} derived from references.tools

For sections.rich.json and rules.rich.json:
- Add provenance per item:
  - source_ref: first refs.tools entry (rules) or primary method id (sections)
  - source_hash: matched from META.references.tools by tool id → path mapping

Deterministic: uses recorded commit epoch for timestamp; no current time.
*/
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function readJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function writeJSON(p,obj){ fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8'); }

function commitDateUTC(commit){
  try {
    const sec = cp.execSync(`git show -s --format=%ct ${commit}`, {encoding: 'utf8'}).trim();
    const iso = new Date(Number(sec)*1000).toISOString();
    return iso;
  } catch(e){ return null; }
}

function normalizeToolIdFromPath(pth){
  // e.g., tools/UNFCCC/Forestry/AR-AMS0007/v3-1/ar-am-tool-14-v4.2.pdf → UNFCCC/AR-TOOL14@v4.2
  const parts = pth.split('/');
  const idx = parts.indexOf('tools');
  if (idx === -1 || idx+1 >= parts.length) return null;
  const standard = parts[idx+1];
  const file = parts[parts.length-1];
  const m = file.match(/^(AR-[A-Z0-9]+)_v(\d+)-(\d+)(?:-(\d+))?\.(pdf|docx)$/);
  if (m){
    const tool = m[1];
    const ver = [m[2], m[3], m[4]].filter(Boolean).join('.');
    return `${standard}/${tool}@v${ver}`;
  }
  // method source e.g. source.pdf belongs to method id (UNFCCC/AR-AMS0007@v3-1)
  if (/source\.(pdf|docx)$/.test(file)){
    const method = parts[idx+2]; // e.g., AR-AMS0007
    const version = parts[idx+3]; // e.g., v3-1
    return `${standard}/${method}@${version}`;
  }
  return null;
}

function buildToolHashMap(meta){
  const map = new Map();
  const tools = (((meta||{}).references||{}).tools)||[];
  for (const t of tools){
    const id = normalizeToolIdFromPath(t.path);
    if (id) map.set(id, t.sha256);
  }
  return map;
}

function ensureMetaProvenance(metaPath){
  const meta = readJSON(metaPath);
  meta.provenance = meta.provenance || {};
  if (!meta.provenance.author) meta.provenance.author = 'Fred Egbuedike';
  if (!meta.provenance.date){
    const c = (((meta||{}).automation)||{}).repo_commit;
    const d = c ? commitDateUTC(c) : null;
    if (d) meta.provenance.date = d;
  }
  // Fill source_pdfs array deterministically from references.tools where kind is pdf/docx and filename indicates method source or booklet
  const src = [];
  const tools = (((meta||{}).references||{}).tools)||[];
  for (const t of tools){
    const base = path.basename(t.path);
    if (/\.(pdf|docx)$/i.test(base) && (/source\.(pdf|docx)$/i.test(base) || /meth_booklet\.(pdf)$/i.test(base))){
      src.push({ kind: t.kind, path: t.path, sha256: t.sha256 });
    }
  }
  if (src.length){
    // sort by path for determinism
    src.sort((a,b)=>a.path.localeCompare(b.path));
    meta.provenance.source_pdfs = src;
  }
  writeJSON(metaPath, meta);
  return buildToolHashMap(meta);
}

function ensureSectionsProvenance(secPath, methodId, toolMap){
  if (!fs.existsSync(secPath)) return;
  const arr = readJSON(secPath);
  let changed = false;
  const hash = toolMap.get(methodId);
  for (const s of arr){
    if (!s.provenance){
      s.provenance = {};
      if (hash){ s.provenance.source_ref = methodId; s.provenance.source_hash = hash; changed = true; }
    }
  }
  if (changed) writeJSON(secPath, arr);
}

function ensureRulesProvenance(rulesPath, toolMap){
  if (!fs.existsSync(rulesPath)) return;
  const arr = readJSON(rulesPath);
  let changed = false;
  for (const r of arr){
    if (!r.provenance){
      const ref = (r.refs && Array.isArray(r.refs.tools) && r.refs.tools[0]) || null;
      const hash = ref ? toolMap.get(ref) : null;
      if (ref && hash){ r.provenance = { source_ref: ref, source_hash: hash }; changed = true; }
    }
  }
  if (changed) writeJSON(rulesPath, arr);
}

function run(targetDir){
  const metaPath = path.join(targetDir, 'META.json');
  const toolMap = ensureMetaProvenance(metaPath);
  // derive method id from metaPath
  const parts = targetDir.split(path.sep);
  const standard = parts[1];
  const method = parts[3];
  const version = parts[4];
  const methodId = `${standard}/${method}@${version}`;
  ensureSectionsProvenance(path.join(targetDir, 'sections.rich.json'), methodId, toolMap);
  ensureRulesProvenance(path.join(targetDir, 'rules.rich.json'), toolMap);
}

if (require.main === module){
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/fill-provenance.js <methodology/version/dir>'); process.exit(2); }
  run(dir);
}
