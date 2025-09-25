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

function send(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

module.exports = async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    send(res, 405, { error: 'MethodNotAllowed', message: 'Use GET' });
    return;
  }

  let searchParam = '';
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    searchParam = (url.searchParams.get('q') || '').trim().toLowerCase();
  } catch (err) {
    send(res, 400, { error: 'InvalidRequest', message: 'Malformed URL' });
    return;
  }

  const engineInstance = ensureEngine();
  const docs = (engineInstance.documents || []).map((doc) => ({
    doc_id: doc.key,
    methodology_id: doc.methodology_id,
    version: doc.version,
    rule_id: doc.rule_id,
    section_id: doc.section_id,
    section_title: doc.section_title,
    tags: doc.tags,
    text: doc.text
  }));

  const query = searchParam;
  const filtered = query
    ? docs.filter((entry) => {
        const inText = entry.text && entry.text.toLowerCase().includes(query);
        const inTags = Array.isArray(entry.tags) && entry.tags.some((tag) => String(tag).toLowerCase().includes(query));
        const inVersion = entry.version && String(entry.version).toLowerCase().includes(query);
        const inMethod = entry.methodology_id && entry.methodology_id.toLowerCase().includes(query);
        const inRule = entry.rule_id && entry.rule_id.toLowerCase().includes(query);
        return inText || inTags || inVersion || inMethod || inRule;
      })
    : docs;

  send(res, 200, { rules: filtered, total: filtered.length });
};
