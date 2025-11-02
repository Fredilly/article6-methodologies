#!/usr/bin/env node
/**
 * Discover UNFCCC methodology pages and asset links from codes and/or index pages.
 *
 * Usage examples:
 *   node scripts/discover-unfccc.js --codes ACM0010 AM0073 AMS-III.D AR-AMS0007 > batches/$(date +%F).links.txt
 *   node scripts/discover-unfccc.js --index https://cdm.unfccc.int/methodologies/PAmethodologies/approved.html > batches/$(date +%F).links.txt
 *   node scripts/discover-unfccc.js \
 *     --index https://cdm.unfccc.int/methodologies/SSCmethodologies/approved.html \
 *     --index https://cdm.unfccc.int/methodologies/ARmethodologies/approved.html \
 *     --codes-file batches/2025-10-17.codes.txt > batches/$(date +%F).links.txt
 */

const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { get: httpsGet } = require('https');
const { get: httpGet } = require('http');

const USER_AGENT = 'article6-discover/1.0 (+https://github.com/Fredilly/article6-methodologies)';
const DEFAULT_INDICES = [
  'https://cdm.unfccc.int/methodologies/PAmethodologies/approved.html',
  'https://cdm.unfccc.int/methodologies/SSCmethodologies/approved.html',
  'https://cdm.unfccc.int/methodologies/ARmethodologies/approved.html',
];

function usage() {
  const lines = [
    'Usage: node scripts/discover-unfccc.js [--codes <CODE ...>] [--codes-file <file>] [--index <url> ...]',
    '',
    'Options:',
    '  --codes <CODE ...>        One or more methodology codes (e.g., ACM0010 AMS-III.D).',
    '  --codes-file <file>       Text file containing one code per line (comments starting with # ignored).',
    '  --index <url>             Explicit approved index page(s). Defaults to PA, SSC and AR approved lists.',
    '  --help                    Show this message.',
  ];
  process.stderr.write(`${lines.join('\n')}\n`);
}

function parseArgs(argv) {
  const codes = [];
  const indexUrls = [];
  const codeFiles = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (token === '--help' || token === '-h') {
      usage();
      process.exit(0);
    }
    if (token === '--codes') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        codes.push(argv[i + 1]);
        i += 1;
      }
      continue;
    }
    if (token === '--index') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new Error('--index requires a URL argument');
      }
      indexUrls.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--codes-file' || token.startsWith('--codes-file=')) {
      if (token.includes('=')) {
        const [, value] = token.split('=', 2);
        if (!value) throw new Error('--codes-file requires a non-empty path');
        codeFiles.push(value);
      } else {
        if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
          throw new Error('--codes-file requires a path argument');
        }
        codeFiles.push(argv[i + 1]);
        i += 1;
      }
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  for (const filePath of codeFiles) {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`codes file not found: ${absPath}`);
    }
    const fileCodes = fs
      .readFileSync(absPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    if (!fileCodes.length) {
      console.warn(`[discover-unfccc] codes file ${absPath} was empty`);
    }
    codes.push(...fileCodes);
  }

  return {
    codes: codes.map((code) => code.trim()).filter(Boolean),
    indexUrls,
  };
}

function fetchText(url, redirectDepth = 0) {
  const MAX_REDIRECTS = 5;
  return new Promise((resolve, reject) => {
    const getter = url.startsWith('https') ? httpsGet : httpGet;
    const req = getter(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectDepth >= MAX_REDIRECTS) {
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          const redirected = new URL(res.headers.location, url).toString();
          resolve(fetchText(redirected, redirectDepth + 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.setEncoding('utf8');
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
  });
}

function abs(base, href) {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch (err) {
    return href;
  }
}

function stripTags(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function anchorize(html, base) {
  if (!html) return [];
  const anchors = [];
  const regex = /<a\b([^>]*?)>(.*?)<\/a>/gis;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1] || '';
    const textRaw = match[2] || '';
    const hrefMatch = attrs.match(/\bhref\s*=\s*(['"])(.*?)\1/i);
    if (!hrefMatch) continue;
    const href = abs(base, hrefMatch[2]);
    if (!href || !href.startsWith('http')) continue;
    anchors.push({
      href,
      text: stripTags(textRaw),
    });
  }
  return anchors;
}

function isPdf(href) {
  return /\.pdf(?:$|\?)/i.test(href);
}

function isWord(candidate) {
  if (!candidate) return false;
  return /\.docx?(?:$|\?)/i.test(candidate) || /word version/i.test(candidate);
}

function isClarification(text, href) {
  const haystack = `${text || ''} ${href || ''}`.toLowerCase();
  return (
    haystack.includes('clarification') ||
    haystack.includes('meth panel') ||
    haystack.includes('meeting report') ||
    haystack.includes('ssc panel') ||
    haystack.includes('mp report') ||
    haystack.includes('eb ') ||
    /ssc[-_\s]*\d+/i.test(haystack)
  );
}

function looksLikeMethodPage(anchor) {
  if (!anchor || !anchor.href) return false;
  const href = anchor.href;
  return (
    /\/methodologies\/DB\/[A-Z0-9]{20,}(?:\/view\.html)?$/i.test(href) ||
    /\/(PA|SSC|AR)methodologies\/[^/]+\/view\.html$/i.test(href)
  );
}

function normaliseCode(code) {
  return code.toUpperCase().replace(/\s+/g, '');
}

function pickMethodPageForCode(code, anchors) {
  if (!code) return null;
  const target = normaliseCode(code);
  const byText = anchors.find((anchor) => {
    const text = (anchor.text || '').toUpperCase().replace(/\s+/g, '');
    return looksLikeMethodPage(anchor) && text.includes(target);
  });
  if (byText) return byText.href;

  const byHref = anchors.find(
    (anchor) => looksLikeMethodPage(anchor) && anchor.href.toUpperCase().includes(target),
  );
  if (byHref) return byHref.href;

  const fallback = anchors.find(looksLikeMethodPage);
  return fallback ? fallback.href : null;
}

async function harvestMethodPage(url, visitedPages) {
  const queue = [url];
  const harvested = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || visitedPages.has(current)) continue;
    visitedPages.add(current);

    const html = await fetchText(current).catch((err) => {
      console.warn(`[discover-unfccc] failed to fetch ${current}: ${err.message}`);
      return '';
    });
    if (!html) continue;

    harvested.add(current);
    const anchors = anchorize(html, current);

    for (const anchor of anchors) {
      if (!anchor.href) continue;
      if (isPdf(anchor.href) && !isWord(anchor.href) && !isWord(anchor.text) && !isClarification(anchor.text, anchor.href)) {
        harvested.add(anchor.href);
        continue;
      }
      const follow =
        /previous versions?/i.test(anchor.text || '') ||
        (/view\.html/i.test(anchor.href) && /(version|ver\.)/i.test(anchor.text || '')) ||
        (/\/methodologies\/DB\/[A-Z0-9]{20,}(?:\/view\.html)?$/i.test(anchor.href) &&
          anchor.href !== current);
      if (follow) queue.push(anchor.href);
    }
  }

  return harvested;
}

async function main() {
  const argv = process.argv.slice(2);
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    console.error(`[discover-unfccc] ${err.message}`);
    usage();
    process.exit(1);
  }

  const codes = Array.from(new Set(parsed.codes.map(normaliseCode))).filter(Boolean);
  const indexUrls = Array.from(
    new Set((parsed.indexUrls.length ? parsed.indexUrls : DEFAULT_INDICES).map((u) => u.trim()).filter(Boolean)),
  );

  if (!codes.length && !indexUrls.length) {
    usage();
    process.exit(1);
  }

  const indexAnchors = [];
  for (const url of indexUrls) {
    const html = await fetchText(url).catch((err) => {
      console.warn(`[discover-unfccc] failed to fetch index ${url}: ${err.message}`);
      return '';
    });
    if (!html) continue;
    indexAnchors.push(...anchorize(html, url));
  }

  const out = new Set();
  const visitedPages = new Set();

  if (codes.length) {
    for (const code of codes) {
      const page = pickMethodPageForCode(code, indexAnchors);
      if (!page) {
        console.warn(`[discover-unfccc] could not resolve page for code ${code}`);
        continue;
      }
      const harvested = await harvestMethodPage(page, visitedPages);
      harvested.forEach((href) => out.add(href));
    }
  }

  const methodAnchors = indexAnchors.filter(looksLikeMethodPage);
  for (const anchor of methodAnchors) {
    const harvested = await harvestMethodPage(anchor.href, visitedPages);
    harvested.forEach((href) => out.add(href));
  }

  if (!out.size) {
    console.warn('[discover-unfccc] no URLs discovered');
  }

  const lines = Array.from(out);
  lines.sort((a, b) => a.localeCompare(b));
  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch((err) => {
  console.error(`[discover-unfccc] fatal: ${err.message}`);
  process.exit(1);
});
