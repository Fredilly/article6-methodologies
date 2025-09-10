#!/usr/bin/env node
/**
 * Deterministic dataset generator.
 * Task v1: section-retrieval from rules.rich → (query -> section_id)
 *
 * - Corpus: sections (doc_id, section_id, text)
 * - Queries: rules.rich summaries (qid, text, answers=[section_id])
 * - Split: stable hash of qid → train/val (80/20)
 * - Output: datasets/section-retrieval/v1/{corpus.jsonl,queries.train.jsonl,queries.val.jsonl}
 * - Manifest: datasets_manifest.json (sha256 of files)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeJSONL } = require('./utils/jsonl');

const REPO = path.resolve(__dirname, '..');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function stableSplit(id) {
  // 80/20 split via sha256(id) modulo 5
  const h = sha256(Buffer.from(String(id)));
  const bucket = parseInt(h.slice(0, 8), 16) % 5;
  return bucket === 0 ? 'val' : 'train';
}

function buildSectionRetrieval(sourceDirs) {
  const corpus = [];
  const queriesTrain = [];
  const queriesVal = [];

  for (const d of sourceDirs.sort()) {
    const secR = path.join(d, 'sections.rich.json');
    const secL = path.join(d, 'sections.json');
    const ruleR = path.join(d, 'rules.rich.json');
    if (!fs.existsSync(secR) || !fs.existsSync(ruleR)) continue;
    const sectionsRich = loadJSON(secR);
    const sectionsLean = fs.existsSync(secL) ? loadJSON(secL).sections : [];

    // Build section lookup for stable titles
    const titleById = new Map();
    for (const s of sectionsLean) titleById.set(s.id, s.title);

    // Corpus docs: use rich list to ensure full set; fall back to lean for title
    for (const s of sectionsRich) {
      const secId = s.id;
      const title = titleById.get(secId) || s.title || String(secId);
      const doc = {
        doc_id: `${path.basename(d)}:${secId}`,
        section_id: secId,
        text: String(title)
      };
      corpus.push(doc);
    }

    // Queries from rules.rich
    const rulesRich = loadJSON(ruleR);
    for (const r of rulesRich) {
      const qid = r.id;
      const text = String(r.summary || r.logic || '');
      const section = (r.refs && Array.isArray(r.refs.sections) && r.refs.sections[0]) || null;
      if (!text || !section) continue;
      const q = { qid, text, answers: [section] };
      (stableSplit(qid) === 'train' ? queriesTrain : queriesVal).push(q);
    }
  }

  // Deterministic ordering
  corpus.sort((a, b) => a.doc_id.localeCompare(b.doc_id));
  queriesTrain.sort((a, b) => a.qid.localeCompare(b.qid));
  queriesVal.sort((a, b) => a.qid.localeCompare(b.qid));

  const outDir = path.join(REPO, 'datasets', 'section-retrieval', 'v1');
  fs.mkdirSync(outDir, { recursive: true });
  writeJSONL(path.join(outDir, 'corpus.jsonl'), corpus);
  writeJSONL(path.join(outDir, 'queries.train.jsonl'), queriesTrain);
  writeJSONL(path.join(outDir, 'queries.val.jsonl'), queriesVal);

  return {
    outDir,
    files: [
      path.join(outDir, 'corpus.jsonl'),
      path.join(outDir, 'queries.train.jsonl'),
      path.join(outDir, 'queries.val.jsonl'),
    ]
  };
}

function listMethodDirs() {
  // MVP scope: include AR-AMS0007/v03-1 and AR-AMS0003/v01-0
  const dirs = [
    path.join(REPO, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AMS0007', 'v03-1'),
    path.join(REPO, 'methodologies', 'UNFCCC', 'Forestry', 'AR-AMS0003', 'v01-0'),
  ];
  return dirs.filter(p => fs.existsSync(p));
}

function hashDatasets(files) {
  const items = files.map(p => ({ path: path.relative(REPO, p).split(path.sep).join('/'), sha256: sha256(fs.readFileSync(p)) }));
  const manifestPath = path.join(REPO, 'datasets_manifest.json');
  const pkg = {
    datasets: items,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return manifestPath;
}

function main() {
  const task = process.argv[2] || 'section-retrieval';
  if (task !== 'section-retrieval') {
    console.error('Only task supported: section-retrieval');
    process.exit(2);
  }
  const src = listMethodDirs();
  if (src.length === 0) { console.error('No source methods found'); process.exit(2); }
  const { files } = buildSectionRetrieval(src);
  const mf = hashDatasets(files);
  console.log('OK: wrote dataset and manifest', mf);
}

if (require.main === module) main();
