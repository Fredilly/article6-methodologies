#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CACHE_PATH = path.join(REPO_ROOT, 'codes', 'index', 'unfccc-cache.json');

const INDEX_URLS = [
  'https://cdm.unfccc.int/methodologies/SSCmethodologies/approved',
  'https://cdm.unfccc.int/methodologies/PAmethodologies/approved',
  'https://cdm.unfccc.int/methodologies/ARmethodologies/approved',
];

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(
    [
      'Usage:',
      '  node scripts/discover-unfccc.js --codes <CODE...>',
      '  node scripts/discover-unfccc.js --codes-file <path>',
      '',
      'Output: one URL per line (sorted, unique).',
    ].join('\n') + '\n',
  );
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(readUtf8(filePath));
}

function stableStringify(value) {
  function sortKeysDeep(obj) {
    if (Array.isArray(obj)) return obj.map(sortKeysDeep);
    if (obj && typeof obj === 'object') {
      const out = {};
      Object.keys(obj)
        .sort()
        .forEach((key) => {
          out[key] = sortKeysDeep(obj[key]);
        });
      return out;
    }
    return obj;
  }
  return JSON.stringify(sortKeysDeep(value), null, 2) + '\n';
}

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function readCodesFromFile(filePath) {
  const content = readUtf8(filePath);
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function parseArgs(argv) {
  const out = { codes: [], codesFile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--codes') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        out.codes.push(argv[i + 1]);
        i += 1;
      }
    } else if (arg === '--codes-file') {
      out.codesFile = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      usage(`Unknown arg: ${arg}`);
      process.exit(2);
    }
  }
  return out;
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, '');
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractAnchors(html) {
  const anchors = [];
  const regex = /<a\b[^>]*href\s*=\s*"(.*?)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1] || '';
    const rawText = match[2] || '';
    const text = decodeEntities(stripTags(rawText)).replace(/\s+/g, ' ').trim();
    anchors.push({ href, text });
  }
  return anchors;
}

function extractSelectOptions(html) {
  const options = [];
  const regex = /<option\b[^>]*value\s*=\s*"([A-Za-z0-9]+)"[^>]*>([\s\S]*?)<\/option>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const value = (match[1] || '').trim();
    const label = decodeEntities(stripTags(match[2] || '')).replace(/\s+/g, ' ').trim();
    if (!value || !label) continue;
    options.push({ value, label });
  }
  return options;
}

function toAbsoluteUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function uniqueSorted(list) {
  return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

function isUnfcccMethodologyDbUrl(url) {
  return /^https:\/\/cdm\.unfccc\.int\/methodologies\/DB\/[A-Z0-9]+\/view\.html$/i.test(url);
}

function isToolPdfUrl(url) {
  if (typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (!lower.startsWith('https://cdm.unfccc.int/')) return false;
  if (lower.includes('/usermanagement/filestorage/')) return true;
  return lower.endsWith('.pdf');
}

async function loadIndexes(cache) {
  const missing = INDEX_URLS.filter((url) => !cache.index_pages?.[url]?.anchors);
  if (missing.length === 0) return cache;

  const next = { ...cache, index_pages: { ...(cache.index_pages || {}) } };
  for (const url of missing) {
    const html = await fetchText(url);
    const anchors = extractAnchors(html)
      .map((a) => ({ href: a.href, text: a.text }))
      .filter((a) => a.href && a.text);
    const options = extractSelectOptions(html);
    next.index_pages[url] = {
      anchors: anchors
        .map((a) => ({
          href: toAbsoluteUrl(url, a.href),
          text: a.text,
        }))
        .filter((a) => a.href),
      options: options
        .map((o) => {
          let code = o.label;
          while (code.endsWith('.')) code = code.slice(0, -1);
          return {
            code: normalizeCode(code),
            url: `https://cdm.unfccc.int/methodologies/DB/${o.value}/view.html`,
          };
        })
        .filter((o) => o.code && isUnfcccMethodologyDbUrl(o.url))
        .sort((a, b) => a.code.localeCompare(b.code) || a.url.localeCompare(b.url)),
    };
    next.index_pages[url].anchors.sort((a, b) => a.href.localeCompare(b.href) || a.text.localeCompare(b.text));
  }
  return next;
}

function resolveCodeToMethodPage(code, cache) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  const candidates = [];
  for (const indexUrl of INDEX_URLS) {
    const page = cache.index_pages?.[indexUrl];
    const options = Array.isArray(page?.options) ? page.options : [];
    for (const opt of options) {
      if (opt.code === normalized) {
        candidates.push({ indexUrl, url: opt.url });
      }
    }

    const anchors = Array.isArray(page?.anchors) ? page.anchors : [];
    for (const anchor of anchors) {
      const anchorText = normalizeCode(anchor.text);
      if (!anchorText.includes(normalized)) continue;
      const href = anchor.href;
      if (isUnfcccMethodologyDbUrl(href)) {
        candidates.push({ indexUrl, url: href });
      }
    }
  }

  candidates.sort((a, b) => {
    const ai = INDEX_URLS.indexOf(a.indexUrl);
    const bi = INDEX_URLS.indexOf(b.indexUrl);
    if (ai !== bi) return ai - bi;
    return a.url.localeCompare(b.url);
  });

  if (candidates.length === 0) return null;
  return candidates[0].url;
}

function extractDbViewUrls(html, baseUrl) {
  const anchors = extractAnchors(html);
  const urls = [];
  for (const a of anchors) {
    const abs = toAbsoluteUrl(baseUrl, a.href);
    if (abs && isUnfcccMethodologyDbUrl(abs)) urls.push(abs);
  }
  return uniqueSorted(urls);
}

function extractToolUrls(html, baseUrl) {
  const anchors = extractAnchors(html);
  const urls = [];
  for (const a of anchors) {
    const abs = toAbsoluteUrl(baseUrl, a.href);
    if (!abs) continue;
    if (isToolPdfUrl(abs)) urls.push(abs);
  }
  return uniqueSorted(urls);
}

async function discoverForCode(code, cache) {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return { ok: false, code, error: 'empty code' };
  }

  if (cache.codes?.[normalized]?.resolved) {
    return { ok: true, code: normalized, fromCache: true, data: cache.codes[normalized] };
  }

  const methodUrl = resolveCodeToMethodPage(normalized, cache);
  if (!methodUrl) {
    return { ok: false, code: normalized, error: 'unable to resolve code to UNFCCC approved page entry' };
  }

  const latestHtml = await fetchText(methodUrl);
  const versionUrls = uniqueSorted([methodUrl].concat(extractDbViewUrls(latestHtml, methodUrl)));
  const toolsByVersion = {};
  for (const versionUrl of versionUrls) {
    const html = versionUrl === methodUrl ? latestHtml : await fetchText(versionUrl);
    toolsByVersion[versionUrl] = extractToolUrls(html, versionUrl);
  }

  const allToolUrls = uniqueSorted(Object.values(toolsByVersion).flat());

  const resolved = {
    latest_version_page_url: methodUrl,
    version_page_urls: versionUrls,
    tool_urls: allToolUrls,
  };

  return { ok: true, code: normalized, fromCache: false, data: resolved };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const codes = []
    .concat(args.codes || [])
    .concat(args.codesFile ? readCodesFromFile(args.codesFile) : [])
    .map(normalizeCode)
    .filter(Boolean);

  if (codes.length === 0) {
    usage('No codes provided.');
    process.exit(2);
  }

  const uniqueCodes = uniqueSorted(codes);

  let cache = readJsonIfExists(CACHE_PATH) || {};
  cache = { index_pages: cache.index_pages || {}, codes: cache.codes || {} };
  cache = await loadIndexes(cache);

  const discovered = [];
  const failures = [];

  for (const code of uniqueCodes) {
    try {
      const result = await discoverForCode(code, cache);
      if (!result.ok) {
        failures.push({ code: result.code, error: result.error });
        continue;
      }
      cache.codes[result.code] = result.data;
      discovered.push({ code: result.code, data: result.data });
    } catch (err) {
      failures.push({ code, error: err && err.message ? err.message : String(err) });
    }
  }

  const outUrls = [];
  for (const entry of discovered) {
    outUrls.push(...(entry.data.version_page_urls || []));
    outUrls.push(...(entry.data.tool_urls || []));
  }

  process.stdout.write(uniqueSorted(outUrls).join('\n') + '\n');

  const stableCache = {
    index_pages: cache.index_pages,
    codes: cache.codes,
  };
  ensureDir(path.dirname(CACHE_PATH));
  fs.writeFileSync(CACHE_PATH, stableStringify(stableCache), 'utf8');

  if (failures.length > 0) {
    failures
      .sort((a, b) => a.code.localeCompare(b.code))
      .forEach((f) => process.stderr.write(`[discover-unfccc] FAIL ${f.code}: ${f.error}\n`));
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`[discover-unfccc] FATAL: ${err && err.stack ? err.stack : String(err)}\n`);
  process.exit(1);
});
