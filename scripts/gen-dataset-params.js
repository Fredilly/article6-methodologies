#!/usr/bin/env node
/**
 * Deterministic dataset generator for parameter/variable extraction v1.
 * Example record:
 * { id, text, variables: [..], units: [..] }
 *
 * - Source: methodologies/[glob]/rules.rich.json (inputs[*].name, inputs[*].unit)
 * - Text: rule.summary (fallback: rule.logic)
 * - Split: stable via sha256(id) mod 5 (val when == 0)
 * - Output: datasets/param-extraction/v1/{train.jsonl,val.jsonl,labelspaces.json}
 * - Manifest: merge into datasets_manifest.json with SHA-256 for files
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeJSONL } = require('./utils/jsonl');

const REPO = path.resolve(__dirname, '..');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function stableSplit(id) { const h = sha256(Buffer.from(String(id))); return (parseInt(h.slice(0,8),16) % 5) === 0 ? 'val' : 'train'; }

function listMethodDirs() {
  // MVP scope: include AR-AMS0007/v3-1 and AR-AMS0003/v1-0
  const dirs = [
    path.join(REPO, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AMS0007', 'v3-1'),
    path.join(REPO, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AMS0003', 'v1-0'),
  ];
  return dirs.filter(p => fs.existsSync(p));
}

function uniqSorted(arr) { return Array.from(new Set(arr.filter(Boolean))).sort(); }

function buildDataset(dirs) {
  const recs = [];
  for (const d of dirs.sort()) {
    const ruleR = path.join(d, 'rules.rich.json');
    if (!fs.existsSync(ruleR)) continue;
    const rulesRich = loadJSON(ruleR);
    for (const r of rulesRich) {
      const inputs = Array.isArray(r.inputs) ? r.inputs : [];
      const variables = uniqSorted(inputs.map(x => x && x.name ? String(x.name) : null));
      const units = uniqSorted(inputs.map(x => x && x.unit ? String(x.unit) : null));
      if (variables.length === 0 && units.length === 0) continue; // skip rules without supervision
      const text = String(r.summary || r.logic || '');
      if (!text) continue;
      recs.push({ id: r.id, text, variables, units });
    }
  }
  // Deterministic order
  recs.sort((a,b) => a.id.localeCompare(b.id));
  const train = [], val = [];
  for (const r of recs) (stableSplit(r.id) === 'val' ? val : train).push(r);

  const labels = {
    variables: uniqSorted(train.flatMap(r => r.variables)),
    units:     uniqSorted(train.flatMap(r => r.units)),
  };

  const outDir = path.join(REPO, 'datasets', 'param-extraction', 'v1');
  fs.mkdirSync(outDir, { recursive: true });
  writeJSONL(path.join(outDir, 'train.jsonl'), train);
  writeJSONL(path.join(outDir, 'val.jsonl'), val);
  fs.writeFileSync(path.join(outDir, 'labelspaces.json'), JSON.stringify(labels, null, 2) + '\n', 'utf8');

  const files = [
    path.join(outDir, 'train.jsonl'),
    path.join(outDir, 'val.jsonl'),
    path.join(outDir, 'labelspaces.json'),
  ];
  updateManifest(files);
  console.log('OK: wrote param-extraction dataset and updated manifest');
}

function updateManifest(files) {
  const manifestPath = path.join(REPO, 'datasets_manifest.json');
  let current = { datasets: [] };
  if (fs.existsSync(manifestPath)) {
    try { current = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { current = { datasets: [] }; }
  }
  const map = new Map();
  for (const e of (current.datasets || [])) map.set(e.path, e.sha256);
  for (const p of files) {
    const rel = path.relative(REPO, p).split(path.sep).join('/');
    const hash = sha256(fs.readFileSync(p));
    map.set(rel, hash);
  }
  const merged = Array.from(map.entries()).map(([pathKey, sha]) => ({ path: pathKey, sha256: sha }))
    .sort((a,b) => a.path.localeCompare(b.path));
  fs.writeFileSync(manifestPath, JSON.stringify({ datasets: merged }, null, 2) + '\n', 'utf8');
}

function main() {
  const dirs = listMethodDirs();
  if (dirs.length === 0) { console.error('No source methods found'); process.exit(2); }
  buildDataset(dirs);
}

if (require.main === module) main();
