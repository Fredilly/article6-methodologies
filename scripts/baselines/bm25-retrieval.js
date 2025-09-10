#!/usr/bin/env node
/**
 * Offline BM25 baseline for section-retrieval.
 * Deterministic tokenization, fixed params, stable tie-breakers.
 * Prints metrics and writes run artifact JSON under outputs/mvp/section-retrieval.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function readJSONL(p) { return fs.readFileSync(p, 'utf8').split(/\n/).filter(Boolean).map(l => JSON.parse(l)); }

function tok(s) {
  return String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function buildBM25(corpus) {
  const k1 = 1.2, b = 0.75;
  const N = corpus.length;
  const docs = corpus.map(d => ({ id: d.doc_id, section_id: d.section_id, tokens: tok(d.text) }));
  const df = new Map();
  const tf = new Map(); // doc_id -> term -> count
  let totalLen = 0;
  for (const d of docs) {
    const tmap = new Map();
    for (const t of d.tokens) tmap.set(t, (tmap.get(t) || 0) + 1);
    tf.set(d.id, tmap);
    totalLen += d.tokens.length;
    for (const term of new Set(d.tokens)) df.set(term, (df.get(term) || 0) + 1);
  }
  const avgdl = totalLen / Math.max(1, N);
  function score(queryTokens) {
    const q = Array.from(new Set(queryTokens));
    const scores = new Map();
    for (const term of q) {
      const n = df.get(term) || 0;
      if (n === 0) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      for (const d of docs) {
        const f = (tf.get(d.id).get(term) || 0);
        if (f === 0) continue;
        const denom = f + k1 * (1 - b + b * (d.tokens.length / avgdl));
        const s = idf * (f * (k1 + 1)) / denom;
        scores.set(d.id, (scores.get(d.id) || 0) + s);
      }
    }
    // Return ranked list of doc ids
    return docs
      .map(d => ({ id: d.id, section_id: d.section_id, score: scores.get(d.id) || 0 }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }
  return { score };
}

function evaluate(runDir) {
  const corpus = readJSONL(path.join(runDir, 'corpus.jsonl'));
  const queries = readJSONL(path.join(runDir, 'queries.val.jsonl'));
  const bm25 = buildBM25(corpus);
  let correctAt1 = 0;
  let mrr5 = 0;
  const predictions = [];
  for (const q of queries) {
    const ranked = bm25.score(tok(q.text));
    const top5 = ranked.slice(0, 5);
    const gold = q.answers[0];
    const top1 = top5[0];
    if (top1 && top1.section_id === gold) correctAt1++;
    let rr = 0;
    for (let i = 0; i < top5.length; i++) {
      if (top5[i].section_id === gold) { rr = 1 / (i + 1); break; }
    }
    mrr5 += rr;
    predictions.push({ qid: q.qid, predicted: top1 ? top1.section_id : null, gold });
  }
  const acc1 = queries.length ? correctAt1 / queries.length : 0;
  const mrr = queries.length ? mrr5 / queries.length : 0;

  return { acc1, mrr5: mrr, n: queries.length, predictions };
}

function commitInfo(root) {
  try {
    const cp = require('child_process');
    const commit = cp.execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
    const ts = cp.execSync(`git show -s --format=%ct ${commit}`, { cwd: root, encoding: 'utf8' }).trim();
    const iso = new Date(Number(ts) * 1000).toISOString();
    return { commit, generated_at: iso };
  } catch {
    return { commit: null, generated_at: null };
  }
}

function main() {
  const runDir = path.resolve(process.argv[2] || path.join(process.cwd(), 'datasets/section-retrieval/v1'));
  const { acc1, mrr5, n, predictions } = evaluate(runDir);
  const repo = path.resolve(__dirname, '..', '..');
  const meta = commitInfo(repo);
  const outDir = path.join(repo, 'outputs', 'mvp', 'section-retrieval');
  fs.mkdirSync(outDir, { recursive: true });
  const artifact = {
    task: 'section-retrieval',
    dataset: path.relative(repo, runDir).split(path.sep).join('/'),
    metrics: { acc1, mrr5, n },
    meta,
  };
  const artPath = path.join(outDir, 'bm25-run.json');
  fs.writeFileSync(artPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
  // Deterministic predictions file for inspection
  const predPath = path.join(outDir, 'bm25-predictions.jsonl');
  fs.writeFileSync(predPath, predictions.map(p => JSON.stringify(p)).join('\n') + (predictions.length ? '\n' : ''), 'utf8');
  const h1 = sha256(fs.readFileSync(artPath));
  const h2 = sha256(fs.readFileSync(predPath));
  console.log(`acc@1=${acc1.toFixed(4)} mrr@5=${mrr5.toFixed(4)} n=${n}`);
  console.log('ARTIFACTS:');
  console.log('-', path.relative(repo, artPath), h1);
  console.log('-', path.relative(repo, predPath), h2);
}

if (require.main === module) main();
