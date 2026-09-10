#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { createGovernanceRetriever } = require('../lib/governance-retrieval');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 3030;
const DEFAULT_HOST = '127.0.0.1';
const BODY_LIMIT = 1024 * 1024;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeVersion(value) {
  if (value == null) return null;
  return String(value).replace(/_/g, '-');
}

function hashContent(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function walk(dir, visitor) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visitor);
    else visitor(full);
  }
}

function buildCorpus() {
  const documents = [];
  const audit = { methodologies: 0, sections: 0, rules: 0, source_hash: null };
  const root = path.join(ROOT, 'methodologies');

  walk(root, (file) => {
    if (path.basename(file) !== 'META.json') return;
    const dir = path.dirname(file);
    const meta = readJson(file);
    if (!meta) return;
    audit.methodologies += 1;

    const rel = path.relative(ROOT, dir).split(path.sep).join('/');
    const methodologyId = `${meta.standard || ''}/${meta.domain || ''}/${meta.method || meta.title || path.basename(path.dirname(dir))}`;
    const version = normalizeVersion(meta.version || path.basename(dir));

    const sections = readJson(path.join(dir, 'sections.rich.json')) || readJson(path.join(dir, 'sections.json')) || [];
    safeArray(sections).forEach((section) => {
      const text = [section.title, section.summary, section.content, section.text, section.source_span_text]
        .filter(Boolean)
        .join('\n');
      documents.push({
        kind: 'section',
        methodology_id: methodologyId,
        version,
        section_id: section.id || null,
        section_title: section.title || null,
        tags: safeArray(section.tags),
        text,
        path: rel,
        source_hash: meta?.audit_hashes?.source_pdf_sha256 || null
      });
      audit.sections += 1;
    });

    const rules = readJson(path.join(dir, 'rules.rich.json')) || readJson(path.join(dir, 'rules.json')) || [];
    safeArray(rules).forEach((rule) => {
      const text = [rule.summary, rule.logic, rule.source_span_text]
        .filter(Boolean)
        .join('\n');
      documents.push({
        kind: 'rule',
        methodology_id: methodologyId,
        version,
        rule_id: rule.id || rule.stable_id || null,
        tags: safeArray(rule.tags),
        text,
        path: rel,
        source_hash: meta?.audit_hashes?.source_pdf_sha256 || null
      });
      audit.rules += 1;
    });
  });

  audit.source_hash = hashContent(documents.map((doc) => `${doc.path}|${doc.kind}|${doc.section_id || doc.rule_id || ''}|${doc.text}`).join('\n'));
  return { documents, audit };
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildBM25(documents) {
  const tokenized = documents.map((doc) => tokenize(doc.text));
  const avgdl = tokenized.length ? tokenized.reduce((sum, tokens) => sum + tokens.length, 0) / tokenized.length : 1;
  const df = new Map();
  tokenized.forEach((tokens) => {
    const seen = new Set(tokens);
    seen.forEach((token) => df.set(token, (df.get(token) || 0) + 1));
  });
  const N = documents.length || 1;

  function score(queryTokens, index) {
    const tokens = tokenized[index];
    const frequencies = new Map();
    tokens.forEach((token) => frequencies.set(token, (frequencies.get(token) || 0) + 1));
    const k1 = 1.2;
    const b = 0.75;
    let total = 0;
    queryTokens.forEach((token) => {
      const n = df.get(token) || 0;
      if (!n) return;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const tf = frequencies.get(token) || 0;
      if (!tf) return;
      const denom = tf + k1 * (1 - b + b * (tokens.length / avgdl));
      total += idf * ((tf * (k1 + 1)) / denom);
    });
    return total;
  }

  return { score };
}

function createEngine() {
  const { documents, audit } = buildCorpus();
  const bm25 = buildBM25(documents);
  const governance = createGovernanceRetriever(ROOT);

  function search(query, opts = {}) {
    const limit = Number.isInteger(opts.topK) && opts.topK > 0 ? Math.min(opts.topK, 50) : 5;
    const queryTokens = tokenize(query);
    const scored = documents
      .map((doc, index) => ({ doc, score: bm25.score(queryTokens, index) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    const results = scored.map(({ doc, score }) => ({ ...doc, score }));
    return { results, audit, topK: limit };
  }

  return { search, structured: governance.query, audit, documents };
}

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('PayloadTooLarge'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function handleHealth(engine, req, res) {
  sendJSON(res, 200, { ok: true, documents: engine.documents.length, audit: engine.audit });
}

function handleManifest(engine, req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const returnAll = url.searchParams.get('all') === '1' || !query;
    const docs = engine.documents.map((entry) => ({
      methodology_id: entry.methodology_id,
      version: entry.version,
      kind: entry.kind,
      section_id: entry.section_id || null,
      section_title: entry.section_title || null,
      rule_id: entry.rule_id || null,
      tags: entry.tags,
      source_hash: entry.source_hash,
      text: entry.text
    }));
    const filtered = query
      ? docs.filter((entry) => {
          const q = query;
          const textMatch = entry.text && entry.text.toLowerCase().includes(q);
          const tagsMatch = Array.isArray(entry.tags) && entry.tags.some((tag) => String(tag).toLowerCase().includes(q));
          const versionMatch = entry.version && String(entry.version).toLowerCase().includes(q);
          const methodMatch = entry.methodology_id && entry.methodology_id.toLowerCase().includes(q);
          const ruleMatch = entry.rule_id && entry.rule_id.toLowerCase().includes(q);
          const titleMatch = entry.section_title && entry.section_title.toLowerCase().includes(q);
          return textMatch || tagsMatch || versionMatch || methodMatch || ruleMatch || titleMatch;
        })
      : docs;
    const output = returnAll ? docs : filtered;
    sendJSON(res, 200, { rules: output, total: output.length });
  } catch (err) {
    console.warn('[engine] manifest error', err && err.message ? err.message : err);
    sendJSON(res, 400, { error: 'InvalidRequest', message: 'Malformed manifest request' });
  }
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
    if (!parsed || typeof parsed !== 'object') {
      sendJSON(res, 400, { error: 'InvalidRequest', message: 'Body must be a JSON object' });
      return;
    }
    if (typeof parsed.operation === 'string' && parsed.operation.trim()) {
      try {
        const result = engine.structured(parsed);
        sendJSON(res, 200, { mode: 'governance-v1', request: parsed, result });
      } catch (structuredErr) {
        sendJSON(res, 400, { error: 'InvalidStructuredRequest', message: structuredErr.message || 'Invalid structured request' });
      }
      return;
    }
    if (typeof parsed.query !== 'string') {
      sendJSON(res, 400, { error: 'InvalidRequest', message: 'Body must include string field "query" or structured field "operation"' });
      return;
    }
    const requestedTopK = parsed.top_k;
    const { results, audit, topK } = engine.search(parsed.query, { topK: requestedTopK });
    sendJSON(res, 200, { query: parsed.query, top_k: topK, results, audit });
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
  // Nullish coalescing intentionally permits port 0 for an OS-assigned port in
  // integration tests while retaining the production default when omitted.
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/query') {
      handleQuery(engine, req, res);
      return;
    }

    if (req.method === 'GET') {
      try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/healthz' || url.pathname === '/api/healthz') {
          handleHealth(engine, req, res);
          return;
        }
        if (url.pathname === '/manifest' || url.pathname === '/api/manifest') {
          handleManifest(engine, req, res);
          return;
        }
      } catch (err) {
        console.warn('[engine] invalid health request URL', err && err.message ? err.message : err);
      }
    }

    sendJSON(res, 404, { error: 'NotFound' });
  });
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const address = server.address();
      const boundPort = address && typeof address === 'object' ? address.port : port;
      console.log(`http-engine-adapter listening on http://${host}:${boundPort}`);
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
  if (process.env.HOST) opts.host = process.env.HOST;
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

module.exports = { createEngine, startServer, tokenize };
