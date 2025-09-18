#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 3030;
const DEFAULT_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MiB
const BM25_PARAMS = { k1: 1.2, b: 0.75 };

const METHOD_CONFIGS = [
  { methodology_id: 'AR-AMS0003', version: 'v01-0', relDir: 'methodologies/UNFCCC/Forestry/AR-AMS0003/v01-0' },
  { methodology_id: 'AR-AMS0007', version: 'v03-1', relDir: 'methodologies/UNFCCC/Forestry/AR-AMS0007/v03-1' }
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readJSON(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  return JSON.parse(raw);
}

function toPosixRelative(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

function tokenize(text) {
  return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function buildCorpus() {
  const documents = [];
  const perMethodAudit = [];
  for (const cfg of METHOD_CONFIGS) {
    const methodRoot = path.join(ROOT, cfg.relDir);
    const metaPath = path.join(methodRoot, 'META.json');
    const leanSectionsPath = path.join(methodRoot, 'sections.json');
    const leanRulesPath = path.join(methodRoot, 'rules.json');

    const meta = readJSON(metaPath);
    const sectionsRaw = fs.readFileSync(leanSectionsPath);
    const rulesRaw = fs.readFileSync(leanRulesPath);

    const sectionsHash = sha256(sectionsRaw);
    const rulesHash = sha256(rulesRaw);

    const expectedSectionsHash = (((meta || {}).audit_hashes || {}).sections_json_sha256) || null;
    const expectedRulesHash = (((meta || {}).audit_hashes || {}).rules_json_sha256) || null;

    if (expectedSectionsHash && expectedSectionsHash !== sectionsHash) {
      throw new Error(`${cfg.methodology_id} sections.json hash mismatch: expected ${expectedSectionsHash}, got ${sectionsHash}`);
    }
    if (expectedRulesHash && expectedRulesHash !== rulesHash) {
      throw new Error(`${cfg.methodology_id} rules.json hash mismatch: expected ${expectedRulesHash}, got ${rulesHash}`);
    }

    const sectionsLean = readJSON(leanSectionsPath);
    const rulesLean = readJSON(leanRulesPath);

    const sectionById = new Map();
    const sectionArr = Array.isArray(sectionsLean.sections) ? sectionsLean.sections : [];
    for (const section of sectionArr) {
      if (section && section.id) {
        sectionById.set(String(section.id), {
          id: String(section.id),
          title: section.title ? String(section.title) : ''
        });
      }
    }

    const ruleArr = Array.isArray(rulesLean.rules) ? rulesLean.rules : [];
    for (const rule of ruleArr) {
      const ruleId = String(rule.id || '');
      const sectionId = String(rule.section_id || '');
      const section = sectionById.get(sectionId) || { id: sectionId, title: '' };
      const ruleText = String(rule.text || '');
      const compositeText = section.title ? `${section.title} - ${ruleText}` : ruleText;
      const tokens = tokenize(compositeText);
      const docKey = `${cfg.methodology_id}@${cfg.version}:${ruleId}`;
      documents.push({
        key: docKey,
        methodology_id: cfg.methodology_id,
        version: cfg.version,
        rule_id: ruleId,
        section_id: sectionId,
        section_title: section.title,
        text: ruleText,
        tokens,
        tags: Array.isArray(rule.tags) ? rule.tags.map(String) : []
      });
    }

    const references = (((meta || {}).references || {}).tools) || [];
    const toolRefs = references.map((ref) => ({
      doc: ref && ref.doc ? String(ref.doc) : null,
      kind: ref && ref.kind ? String(ref.kind) : null,
      path: ref && ref.path ? String(ref.path) : null,
      sha256: ref && ref.sha256 ? String(ref.sha256) : null
    })).filter((r) => r.doc && r.path && r.sha256);

    perMethodAudit.push({
      methodology_id: cfg.methodology_id,
      version: cfg.version,
      rules: {
        path: toPosixRelative(leanRulesPath),
        sha256: rulesHash
      },
      sections: {
        path: toPosixRelative(leanSectionsPath),
        sha256: sectionsHash
      },
      tool_references: toolRefs
    });
  }

  documents.sort((a, b) => a.key.localeCompare(b.key));

  return {
    documents,
    audit: {
      bm25: {
        tokenizer: 'lowercase-ascii-nonalnum-split',
        params: BM25_PARAMS,
        documents: documents.length
      },
      inputs: perMethodAudit
    }
  };
}

function buildBM25(documents) {
  const N = documents.length;
  const df = new Map();
  const docLen = new Map();
  const tf = new Map();
  const postings = new Map();
  const docIndex = new Map();
  let totalLen = 0;

  for (const doc of documents) {
    docIndex.set(doc.key, doc);
    const tokens = doc.tokens;
    const len = tokens.length;
    docLen.set(doc.key, len);
    totalLen += len;
    const termFreq = new Map();
    for (const t of tokens) {
      termFreq.set(t, (termFreq.get(t) || 0) + 1);
    }
    tf.set(doc.key, termFreq);
    for (const [term, freq] of termFreq.entries()) {
      df.set(term, (df.get(term) || 0) + 1);
      if (!postings.has(term)) postings.set(term, new Map());
      postings.get(term).set(doc.key, freq);
    }
  }

  const avgdl = N ? totalLen / N : 0;

  function score(query) {
    const queryTokens = Array.from(new Set(tokenize(query)));
    if (!queryTokens.length || !N) return [];
    const scores = new Map();
    for (const term of queryTokens) {
      const posting = postings.get(term);
      if (!posting) continue;
      const n = df.get(term) || 0;
      if (!n) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      for (const [docKey, freq] of posting.entries()) {
        const length = docLen.get(docKey) || 0;
        const denom = freq + BM25_PARAMS.k1 * (1 - BM25_PARAMS.b + BM25_PARAMS.b * (length / (avgdl || 1)));
        const partial = idf * (freq * (BM25_PARAMS.k1 + 1)) / (denom || 1);
        scores.set(docKey, (scores.get(docKey) || 0) + partial);
      }
    }

    const ranked = Array.from(scores.entries()).map(([docKey, value]) => ({
      doc: docIndex.get(docKey),
      score: value
    }));

    ranked.sort((a, b) => b.score - a.score || a.doc.key.localeCompare(b.doc.key));
    return ranked;
  }

  return { score };
}

function createEngine() {
  const { documents, audit } = buildCorpus();
  const bm25 = buildBM25(documents);

  function search(query, opts = {}) {
    const limit = Number.isInteger(opts.topK) && opts.topK > 0 ? Math.min(opts.topK, 50) : 5;
    if (typeof query !== 'string' || !query.trim()) {
      return { results: [], audit, topK: limit };
    }
    const ranked = bm25.score(query).slice(0, limit);
    const results = ranked.map((entry) => ({
      doc_id: entry.doc.key,
      methodology_id: entry.doc.methodology_id,
      version: entry.doc.version,
      rule_id: entry.doc.rule_id,
      section_id: entry.doc.section_id,
      section_title: entry.doc.section_title,
      score: Number(entry.score.toFixed(6)),
      text: entry.doc.text,
      tags: entry.doc.tags
    }));
    return { results, audit, topK: limit };
  }

  return { search, audit };
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('PayloadTooLarge'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

async function handleQuery(engine, req, res) {
  try {
    const rawBody = await readRequestBody(req);
    let parsed;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch (err) {
      sendJSON(res, 400, { error: 'InvalidJSON', message: 'Body must be valid JSON' });
      return;
    }
    if (!parsed || typeof parsed.query !== 'string') {
      sendJSON(res, 400, { error: 'InvalidRequest', message: 'Body must include string field "query"' });
      return;
    }
    const requestedTopK = parsed.top_k;
    const { results, audit, topK } = engine.search(parsed.query, { topK: requestedTopK });
    sendJSON(res, 200, {
      query: parsed.query,
      top_k: topK,
      results,
      audit
    });
  } catch (err) {
    if (err && err.message === 'PayloadTooLarge') {
      sendJSON(res, 413, { error: 'PayloadTooLarge', message: 'Request body exceeds limit' });
      return;
    }
    console.error('http-engine-adapter error:', err);
    sendJSON(res, 500, { error: 'InternalError', message: 'Unexpected error' });
  }
}

function startServer(engine, options = {}) {
  const port = options.port || DEFAULT_PORT;
  const host = options.host || DEFAULT_HOST;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/query') {
      handleQuery(engine, req, res);
      return;
    }
    if (req.method === 'GET' && req.url === '/healthz') {
      sendJSON(res, 200, { status: 'ok', documents: engine.audit.bm25.documents });
      return;
    }
    sendJSON(res, 404, { error: 'NotFound' });
  });
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`http-engine-adapter listening on http://${host}:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

function parseArgs(argv) {
  const opts = { port: DEFAULT_PORT, host: DEFAULT_HOST };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && i + 1 < argv.length) {
      const next = parseInt(argv[++i], 10);
      if (!Number.isNaN(next) && next > 0) opts.port = next;
    } else if (arg === '--host' && i + 1 < argv.length) {
      opts.host = argv[++i];
    }
  }
  if (process.env.PORT) {
    const envPort = parseInt(process.env.PORT, 10);
    if (!Number.isNaN(envPort) && envPort > 0) opts.port = envPort;
  }
  if (process.env.HOST) {
    opts.host = process.env.HOST;
  }
  return opts;
}

if (require.main === module) {
  (async () => {
    try {
      const engine = createEngine();
      const opts = parseArgs(process.argv.slice(2));
      await startServer(engine, opts);
    } catch (err) {
      console.error('Failed to start http-engine-adapter:', err);
      process.exit(1);
    }
  })();
}

module.exports = {
  createEngine,
  startServer,
  tokenize
};
