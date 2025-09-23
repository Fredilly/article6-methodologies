'use strict';

const { URL } = require('url');
const { createEngine } = require('../bin/http-engine-adapter');

function renderBadge(documents) {
  const left = 'engine';
  const right = `ok • ${documents} docs`;
  const leftWidth = 6 * left.length + 40;
  const rightWidth = 6 * right.length + 40;
  const totalWidth = leftWidth + rightWidth;
  const height = 28;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="engine status">`,
    '<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>',
    `<mask id="m"><rect width="${totalWidth}" height="${height}" rx="4" ry="4" fill="#fff"/></mask>`,
    `<g mask="url(#m)">`,
    `<rect width="${leftWidth}" height="${height}" fill="#555"/>`,
    `<rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="#2c974b"/>`,
    `<rect width="${totalWidth}" height="${height}" fill="url(#s)"/></g>`,
    `<g fill="#fff" text-anchor="middle" font-family="'DejaVu Sans',Verdana,Geneva,sans-serif" font-size="14">`,
    `<text x="${leftWidth / 2}" y="20">${left}</text>`,
    `<text x="${leftWidth + rightWidth / 2}" y="20">${right}</text>`,
    '</g></svg>'
  ].join('');
}

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

  if (badgeRequested) {
    const svg = renderBadge(count);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', Buffer.byteLength(svg));
    res.end(svg);
    return;
  }

  const body = JSON.stringify({ status: 'ok', documents: count });
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
};
