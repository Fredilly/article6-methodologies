#!/usr/bin/env node
/**
 * Offline TF-IDF linear baseline for parameter extraction (variables and units).
 * - Deterministic tokenization and sorting
 * - One-vs-rest by centroid similarity (cosine) with fixed K selection from train
 * - Prints micro-F1 per task and writes artifacts
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function readJSONL(p) { return fs.readFileSync(p, 'utf8').split(/\n/).filter(Boolean).map(l => JSON.parse(l)); }
function tok(s) { return String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

function buildVocab(train) {
  const df = new Map();
  for (const r of train) {
    const tokens = Array.from(new Set(tok(r.text)));
    for (const t of tokens) df.set(t, (df.get(t) || 0) + 1);
  }
  const vocab = Array.from(df.entries()).sort((a,b) => a[0].localeCompare(b[0]));
  const N = train.length || 1;
  const idf = new Map(vocab.map(([t,dfi]) => [t, Math.log((N + 1) / (dfi + 1)) + 1]));
  const index = new Map(vocab.map(([t],i) => [t, i]));
  return { idf, index, size: vocab.length };
}

function vecFromText(text, vocab) {
  const v = new Float64Array(vocab.size);
  const counts = new Map();
  for (const t of tok(text)) counts.set(t, (counts.get(t) || 0) + 1);
  for (const [t, c] of counts.entries()) {
    const j = vocab.index.get(t);
    if (j === undefined) continue;
    const w = (c) * (vocab.idf.get(t) || 0);
    v[j] = w;
  }
  return v;
}

function addTo(acc, v) { for (let i=0;i<acc.length;i++) acc[i]+=v[i]; }
function scale(v, s) { for (let i=0;i<v.length;i++) v[i]*=s; }
function dot(a,b){ let s=0; for (let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; }
function norm(a){ return Math.sqrt(dot(a,a)); }
function cosine(a,b){ const na=norm(a), nb=norm(b); if (na===0||nb===0) return 0; return dot(a,b)/(na*nb); }

function avgLabelsPerExample(train, key) {
  const n = train.length || 1;
  const sum = train.reduce((s,r) => s + (Array.isArray(r[key]) ? r[key].length : 0), 0);
  return Math.max(1, Math.round(sum / n));
}

function fitCentroids(train, vocab, allLabels) {
  const zero = () => new Float64Array(vocab.size);
  const sums = new Map(allLabels.map(l => [l, zero()]));
  const counts = new Map(allLabels.map(l => [l, 0]));
  for (const r of train) {
    const v = vecFromText(r.text, vocab);
    for (const l of r){}
  }
}

function fitOneVsRest(train, vocab, labelKey, labels) {
  const zero = () => new Float64Array(vocab.size);
  const sums = new Map(labels.map(l => [l, zero()]));
  const counts = new Map(labels.map(l => [l, 0]));
  for (const r of train) {
    const vec = vecFromText(r.text, vocab);
    for (const l of (r[labelKey] || [])) {
      addTo(sums.get(l), vec);
      counts.set(l, (counts.get(l) || 0) + 1);
    }
  }
  const centroids = new Map();
  for (const l of labels) {
    const c = sums.get(l).slice();
    const n = counts.get(l) || 1;
    scale(c, 1 / n);
    centroids.set(l, c);
  }
  return { centroids };
}

function predict(vec, centroids, K) {
  const scored = Array.from(centroids.entries()).map(([l, c]) => ({ l, s: cosine(vec, c) }));
  scored.sort((a,b) => b.s - a.s || a.l.localeCompare(b.l));
  return scored.slice(0, K).map(x => x.l);
}

function f1Micro(golds, preds) {
  let tp=0, fp=0, fn=0;
  for (let i=0;i<golds.length;i++) {
    const g = new Set(golds[i]);
    const p = new Set(preds[i]);
    for (const x of p) { if (g.has(x)) tp++; else fp++; }
    for (const x of g) { if (!p.has(x)) fn++; }
  }
  const prec = tp ? tp/(tp+fp) : 0;
  const rec = tp ? tp/(tp+fn) : 0;
  const f1 = (prec+rec) ? (2*prec*rec)/(prec+rec) : 0;
  return { precision: prec, recall: rec, f1 };
}

function main() {
  const root = path.resolve(process.cwd(), 'datasets/param-extraction/v1');
  const train = readJSONL(path.join(root, 'train.jsonl'));
  const val = readJSONL(path.join(root, 'val.jsonl'));
  const labels = JSON.parse(fs.readFileSync(path.join(root, 'labelspaces.json'), 'utf8'));

  const vocab = buildVocab(train);
  const Kvar = avgLabelsPerExample(train, 'variables');
  const Kunit = avgLabelsPerExample(train, 'units');
  const varModel = fitOneVsRest(train, vocab, 'variables', labels.variables);
  const unitModel = fitOneVsRest(train, vocab, 'units', labels.units);

  const varPreds = [], varGolds = [];
  const unitPreds = [], unitGolds = [];
  for (const r of val) {
    const v = vecFromText(r.text, vocab);
    varPreds.push(predict(v, varModel.centroids, Kvar));
    unitPreds.push(predict(v, unitModel.centroids, Kunit));
    varGolds.push(r.variables);
    unitGolds.push(r.units);
  }
  const varM = f1Micro(varGolds, varPreds);
  const unitM = f1Micro(unitGolds, unitPreds);
  const metrics = { variables: varM, units: unitM, n: val.length, Kvar, Kunit };

  const repo = path.resolve(__dirname, '..', '..');
  const outDir = path.join(repo, 'outputs', 'mvp', 'param-extraction');
  fs.mkdirSync(outDir, { recursive: true });
  const runPath = path.join(outDir, 'tfidf-run.json');
  fs.writeFileSync(runPath, JSON.stringify({ task: 'param-extraction', dataset: 'datasets/param-extraction/v1', metrics }, null, 2) + '\n', 'utf8');
  const predsPath = path.join(outDir, 'tfidf-predictions.jsonl');
  const emit = (id, g, p) => JSON.stringify({ id, variables_gold: g[0], variables_pred: p[0], units_gold: g[1], units_pred: p[1] });
  const lines = val.map((r, i) => emit(r.id, [varGolds[i], unitGolds[i]], [varPreds[i], unitPreds[i]]));
  fs.writeFileSync(predsPath, (lines.join('\n') + (lines.length ? '\n' : '')), 'utf8');
  const h1 = sha256(fs.readFileSync(runPath));
  const h2 = sha256(fs.readFileSync(predsPath));
  console.log(`variables microF1=${metrics.variables.f1.toFixed(4)} units microF1=${metrics.units.f1.toFixed(4)} n=${metrics.n}`);
  console.log('ARTIFACTS:');
  console.log('-', path.relative(repo, runPath), h1);
  console.log('-', path.relative(repo, predsPath), h2);
}

if (require.main === module) main();

