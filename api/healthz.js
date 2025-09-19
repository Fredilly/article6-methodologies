'use strict';

const { createEngine } = require('../bin/http-engine-adapter');

let engine;

function ensureEngine() {
  if (!engine) {
    engine = createEngine();
  }
  return engine;
}

module.exports = async function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const engineInstance = ensureEngine();
  const count = engineInstance.audit?.bm25?.documents || 0;
  const body = JSON.stringify({ status: 'ok', documents: count });
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
};
