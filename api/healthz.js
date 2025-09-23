'use strict';

const { URL } = require('url');
const { createEngine } = require('../bin/http-engine-adapter');

let engine;

function ensureEngine() {
  if (!engine) {
    engine = createEngine();
  }
  return engine;
}

module.exports = async function handler(req, res) {
  const engineInstance = ensureEngine();
  const count = engineInstance.audit?.bm25?.documents || 0;

  let badgeRequested = false;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    badgeRequested = url.searchParams.has('badge');
  } catch (_) {
    badgeRequested = false;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const payload = badgeRequested
    ? {
        schemaVersion: 1,
        label: 'engine',
        message: `ok • ${count} docs`,
        color: 'brightgreen'
      }
    : {
        status: 'ok',
        documents: count
      };

  const body = JSON.stringify(payload);
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
};
