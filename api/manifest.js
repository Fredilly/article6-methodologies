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
  if ((req.method || 'GET').toUpperCase() !== 'GET') {
    send(res, 405, { error: 'MethodNotAllowed', message: 'Use GET' });
    return;
  }

  let query = '';
  let returnAll = false;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    query = (url.searchParams.get('q') || '').trim().toLowerCase();
    const allParam = (url.searchParams.get('all') || '').trim().toLowerCase();
    returnAll = allParam === '1' || allParam === 'true' || allParam === 'yes';
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

  send(res, 200, { rules: output, total: output.length });
};
