'use strict';

const { URL } = require('url');
const { createEngine } = require('../bin/http-engine-adapter');
const { recordRequest } = require('../core/metrics/request-metrics');

let engine;

function ensureEngine() {
  if (!engine) {
    engine = createEngine();
  }
  return engine;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      if (!chunks.length) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed);
      } catch (err) {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function parseQueryFromUrl(reqUrl) {
  try {
    const u = new URL(reqUrl, 'http://localhost');
    return {
      text: u.searchParams.get('text') || u.searchParams.get('query') || '',
      topK: u.searchParams.get('top_k') || u.searchParams.get('topK') || null
    };
  } catch {
    return { text: '', topK: null };
  }
}

module.exports = async function handler(req, res) {
  const started = process.hrtime.bigint();
  const method = (req.method || 'GET').toUpperCase();
  const engineInstance = ensureEngine();

  try {
    if (method === 'GET') {
      const { text, topK } = parseQueryFromUrl(req.url || '');
      if (!text) {
        send(res, 400, { error: 'InvalidRequest', message: 'Provide ?text= query string' });
        return;
      }
      const { results, audit, topK: effectiveTopK } = engineInstance.search(text, { topK: topK ? Number(topK) : undefined });
      send(res, 200, { query: text, top_k: effectiveTopK, results, audit });
      return;
    }

    if (method === 'POST') {
      const body = await parseBody(req);
      if (!body || typeof body.query !== 'string') {
        send(res, 400, { error: 'InvalidRequest', message: 'Body must include string "query"' });
        return;
      }
      const topK = Number.isInteger(body.top_k) ? body.top_k : body.topK;
      const { results, audit, topK: effectiveTopK } = engineInstance.search(body.query, { topK });
      send(res, 200, { query: body.query, top_k: effectiveTopK, results, audit });
      return;
    }

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Allow', 'GET,POST,OPTIONS');
      res.end();
      return;
    }

    send(res, 405, { error: 'MethodNotAllowed', message: 'Use GET or POST' });
  } catch (err) {
    const statusCode = err && err.statusCode ? err.statusCode : 500;
    send(res, statusCode, { error: 'ServerError', message: 'Unexpected error' });
  } finally {
    try {
      const elapsedNs = process.hrtime.bigint() - started;
      const durationMs = Number(elapsedNs) / 1e6;
      recordRequest(durationMs);
    } catch (metricsErr) {
      console.warn('[engine] metrics capture failed', metricsErr && metricsErr.message ? metricsErr.message : metricsErr);
    }
  }
};
