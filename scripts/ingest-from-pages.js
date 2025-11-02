#!/usr/bin/env node
/**
 * Ingest UNFCCC methodology pages into versioned assets and batch ingest.yml entries.
 *
 * Usage:
 *   node scripts/ingest-from-pages.js --links batches/2025-10-17.links.txt --out batches/2025-10-17.ingest.yml
 *   node scripts/ingest-from-pages.js batches/links.txt batches/ingest.yml
 */

const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { pipeline } = require('node:stream');
const { promisify } = require('node:util');

const streamPipeline = promisify(pipeline);

const USER_AGENT = 'article6-ingest/1.0 (+https://github.com/Fredilly/article6-methodologies)';

function usage() {
  const lines = [
    'Usage: node scripts/ingest-from-pages.js [--links <links.txt>] [--out <ingest.yml>]',
    '       node scripts/ingest-from-pages.js <links.txt> <ingest.yml>',
    '',
    'Options:',
    '  --links <path>   Links file (one URL per line).',
    '  --out <path>     Path for generated ingest.yml.',
    '  --dry-run        Parse pages but skip downloads and file writes.',
    '  --help           Show this message.',
  ];
  process.stderr.write(`${lines.join('\n')}\n`);
}

function parseArgs(argv) {
  let linksPath = '';
  let outPath = '';
  let dryRun = false;
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (token === '--help' || token === '-h') {
      usage();
      process.exit(0);
    }
    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (token === '--links') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error('--links requires a path');
      linksPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--out') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error('--out requires a path');
      outPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith('-')) {
      throw new Error(`Unknown flag: ${token}`);
    }
    positional.push(token);
  }

  if (!linksPath && positional.length) linksPath = positional.shift();
  if (!outPath && positional.length) outPath = positional.shift();

  if (!linksPath) throw new Error('links.txt path is required');
  if (!outPath) throw new Error('output ingest.yml path is required');

  return {
    linksPath: path.resolve(linksPath),
    outPath: path.resolve(outPath),
    dryRun,
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function downloadBinary(url, destPath, dryRun = false) {
  if (dryRun) return 'skipped';
  if (fs.existsSync(destPath)) return 'cached';
  ensureDir(path.dirname(destPath));
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.1',
    },
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const tmpPath = `${destPath}.download`;
  await streamPipeline(res.body, fs.createWriteStream(tmpPath));
  fs.renameSync(tmpPath, destPath);
  return 'downloaded';
}

function stripTags(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toAbsolute(base, href) {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function anchorize(html, base) {
  if (!html) return [];
  const anchors = [];
  const regex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1] || '';
    const text = stripTags(match[2]);
    const hrefMatch = attrs.match(/\bhref\s*=\s*(['"])(.*?)\1/i);
    if (!hrefMatch) continue;
    const href = toAbsolute(base, hrefMatch[2]);
    if (!href || !href.startsWith('http')) continue;
    anchors.push({ href, text, html: match[0] });
  }
  return anchors;
}

function isPdf(url, anchorHtml = '') {
  if (/\.pdf(?:$|\?)/i.test(url)) return true;
  if (/\bcontentType=application\/pdf\b/i.test(url)) return true;
  if (/\/FileStorage\//i.test(url) && /pdf\.gif/i.test(anchorHtml || '')) return true;
  return false;
}

function isWordCandidate(candidate) {
  if (!candidate) return false;
  return /\.docx?(?:$|\?)/i.test(candidate) || /word version/i.test(candidate);
}

function looksLikeTool(url) {
  return /\/tools\//i.test(url);
}

function isClarification(text, url) {
  const haystack = `${text || ''} ${url || ''}`.toLowerCase();
  return (
    haystack.includes('clarification') ||
    haystack.includes('meeting report') ||
    haystack.includes('meth panel') ||
    haystack.includes('ssc panel') ||
    haystack.includes('approval history') ||
    /am_cla|am_rev|mp_|eb_/i.test(haystack)
  );
}

function extractField(tableHtml, labelPattern) {
  if (!tableHtml) return '';
  const expr = `<tr[^>]*>\\s*<th[^>]*>${labelPattern}<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`;
  const regex = new RegExp(expr, 'i');
  const match = tableHtml.match(regex);
  return match ? match[1] : '';
}

function parseHeader(html) {
  const headerMatch = html.match(/<div[^>]*class=["']mH header["'][^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/i);
  if (!headerMatch) throw new Error('method header not found');
  const text = stripTags(headerMatch[1]);
  const match = text.match(/^([A-Z0-9.\-]+)\s*:\s*(.*?)\s*---\s*Version\s*([0-9.]+)/i);
  if (!match) throw new Error(`unable to parse header line "${text}"`);
  const [, codeRaw, titleRaw, versionRaw] = match;
  return {
    code: codeRaw.trim(),
    title: titleRaw.trim(),
    version: versionRaw.trim(),
    headerText: text,
  };
}

function pickPrimaryPdf(titleHtml, baseUrl) {
  const anchors = anchorize(titleHtml, baseUrl);
  for (const anchor of anchors) {
    if (!isPdf(anchor.href, anchor.html)) continue;
    if (looksLikeTool(anchor.href)) continue;
    if (isWordCandidate(anchor.href) || isWordCandidate(anchor.text) || /word\.gif/i.test(anchor.html || '')) continue;
    if (/summary/i.test(anchor.text || '') || /booklet/i.test(anchor.text || '')) continue;
    return anchor.href;
  }
  return null;
}

function extractTools(titleHtml, baseUrl) {
  const anchors = anchorize(titleHtml, baseUrl);
  const out = [];
  for (const anchor of anchors) {
    if (!isPdf(anchor.href, anchor.html)) continue;
    if (!looksLikeTool(anchor.href)) continue;
    if (isWordCandidate(anchor.href) || isWordCandidate(anchor.text) || /word\.gif/i.test(anchor.html || '')) continue;
    if (isClarification(anchor.text, anchor.href)) continue;
    out.push(anchor.href);
  }
  return out;
}

function extractVersion(valueHtml, fallback) {
  const text = stripTags(valueHtml);
  const match = text.match(/(\d+(?:\.\d+){0,2})/);
  if (match) return match[1];
  return fallback;
}

function extractStatus(valueHtml) {
  const text = stripTags(valueHtml);
  return text || '';
}

function extractValidity(valueHtml) {
  const text = stripTags(valueHtml);
  if (!text) return { from: null, to: null };
  const fromMatch = text.match(/Valid from\s+([^,;]+?)(?:\s+to|\s+onwards|$)/i);
  const toMatch = text.match(/Valid from\s+[^,;]+?\s+to\s+([^,;]+?)(?:\s|$)/i);
  const onwards = /onwards/i.test(text);
  return {
    from: fromMatch ? fromMatch[1].trim() : null,
    to: onwards ? null : toMatch ? toMatch[1].trim() : null,
  };
}

function extractScopes(valueHtml) {
  const anchors = anchorize(valueHtml, 'https://cdm.unfccc.int/');
  if (anchors.length) return anchors.map((anchor) => stripTags(anchor.text || anchor.href)).map((s) => s.replace(/\D+/g, '')).filter(Boolean);
  const text = stripTags(valueHtml);
  return (text.match(/\d+/g) || []).map((s) => s.trim());
}

function toVersionSlug(versionRaw) {
  if (!versionRaw) throw new Error('version number missing');
  const cleaned = versionRaw.trim();
  const parts = cleaned.split(/[^0-9]+/).filter(Boolean).map((part) => Number.parseInt(part, 10));
  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  return `v${String(major).padStart(2, '0')}-${String(minor).padStart(1, '0')}`;
}

function resolveSector(scopes, code) {
  const normalizedScopes = (scopes || []).map((s) => String(s));
  const hasScope = (values) => values.some((value) => normalizedScopes.includes(String(value)));

  if (/^AR-/i.test(code) || hasScope(['14', '16', '17'])) return 'Forestry';
  if (hasScope(['15'])) return 'Agriculture';
  if (hasScope(['13'])) return 'Waste';
  if (hasScope(['7'])) return 'Transport';
  if (hasScope(['3']) && /^AMS-/i.test(code)) return 'Household';
  if (hasScope(['1', '2', '3', '10', '11'])) return 'Energy';
  if (hasScope(['4', '5', '6', '8', '9', '12'])) return 'Industry';
  return 'Other';
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function deriveToolFilename(url, fallbackText) {
  try {
    const { pathname } = new URL(url);
    const base = path.posix.basename(pathname);
    if (base && base !== '/' && /\.pdf$/i.test(base)) return base;
    if (base) return `${base}.pdf`;
  } catch {
    // ignore
  }
  const slug = slugify(fallbackText || 'tool');
  return `${slug || 'tool'}.pdf`;
}

function posixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function buildYaml(doc) {
  const lines = [];
  lines.push('version: 2');
  lines.push('methods:');
  for (const entry of doc.methods) {
    lines.push(`  - id: ${entry.id}`);
    lines.push(`    version: ${entry.version}`);
    lines.push(`    sector: ${entry.sector}`);
    lines.push(`    source_page: "${entry.source_page}"`);
    lines.push('    assets:');
    lines.push(`      primary: "${entry.assets.primary}"`);
    if (entry.assets.tools.length) {
      lines.push('      tools:');
      for (const tool of entry.assets.tools) {
        lines.push(`        - "${tool}"`);
      }
    } else {
      lines.push('      tools: []');
    }
    if (entry.include_text.length) {
      lines.push('    include_text:');
      for (const inc of entry.include_text) {
        lines.push(`      - "${inc.replace(/"/g, '\\"')}"`);
      }
    } else {
      lines.push('    include_text: []');
    }
    if (entry.exclude_text.length) {
      lines.push(`    exclude_text: [${entry.exclude_text.map((ex) => `"${ex.replace(/"/g, '\\"')}"`).join(', ')}]`);
    } else {
      lines.push('    exclude_text: []');
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function ensureToolAsset(url, directory, cache, dryRun) {
  if (cache.has(url)) return cache.get(url);
  const filename = deriveToolFilename(url, url);
  const destPath = path.resolve(directory, filename);
  const status = await downloadBinary(url, destPath, dryRun);
  if (!dryRun) console.log(`[ingest] tool ${status}: ${url} → ${posixPath(path.relative(process.cwd(), destPath))}`);
  const rel = posixPath(path.relative(process.cwd(), destPath));
  cache.set(url, rel);
  return rel;
}

async function processPage(url, opts) {
  const html = await fetchText(url);
  const header = parseHeader(html);
  const titleHtml = extractField(html, 'Title');
  if (!titleHtml) throw new Error('Title row missing');
  const versionHtml = extractField(html, 'Version number');
  const statusHtml = extractField(html, 'Status');
  const validityHtml = extractField(html, 'Validity');
  const scopesHtml = extractField(html, 'Sectoral scope\\(s\\)');

  const versionRaw = extractVersion(versionHtml, header.version);
  const versionSlug = toVersionSlug(versionRaw);
  const primaryPdfUrl = pickPrimaryPdf(titleHtml, url);
  if (!primaryPdfUrl) throw new Error('Primary PDF not located');
  const toolUrls = extractTools(titleHtml, url);
  const scopes = extractScopes(scopesHtml);
  const sector = resolveSector(scopes, header.code);

  const status = extractStatus(statusHtml);
  const validity = extractValidity(validityHtml);

  return {
    code: header.code,
    title: header.title,
    versionRaw,
    versionSlug,
    sector,
    scopes,
    status,
    validity,
    sourcePage: url,
    primaryPdfUrl,
    toolUrls,
  };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[ingest] ${err.message}`);
    usage();
    process.exit(1);
  }

  const { linksPath, outPath, dryRun } = args;

  if (!fs.existsSync(linksPath)) {
    console.error(`[ingest] links file not found: ${linksPath}`);
    process.exit(1);
  }

  const links = fs
    .readFileSync(linksPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (!links.length) {
    console.error('[ingest] links file is empty');
    process.exit(1);
  }

  const uniqueLinks = Array.from(new Set(links));
  const pageLinks = uniqueLinks.filter((link) => !isPdf(link));
  const pdfLinks = uniqueLinks.filter((link) => isPdf(link));

  if (!pageLinks.length) {
    console.error('[ingest] no page URLs detected (only PDFs); provide methodology page links');
    process.exit(1);
  }

  const methods = new Map();
  const processedPages = new Set();
  const toolCache = new Map();

  const sourceAssetsRoot = path.resolve('source-assets/UNFCCC');
  const toolsRoot = path.resolve('tools/UNFCCC/common');

  if (!dryRun) {
    ensureDir(sourceAssetsRoot);
    ensureDir(toolsRoot);
  }

  for (const pageUrl of pageLinks) {
    if (processedPages.has(pageUrl)) continue;
    processedPages.add(pageUrl);

    console.log(`[ingest] parse ${pageUrl}`);
    let meta;
    try {
      meta = await processPage(pageUrl, { dryRun });
    } catch (err) {
      console.error(`[ingest] failed to parse ${pageUrl}: ${err.message}`);
      throw err;
    }

    const key = `${meta.code}#${meta.versionSlug}`;
    if (methods.has(key)) {
      // Prefer canonical source page without /view.html (active version).
      const existing = methods.get(key);
      const preferExisting = !/\/view\.html/i.test(existing.sourcePage) && /\/view\.html/i.test(meta.sourcePage);
      if (preferExisting) {
        continue;
      }
    }

    const sectorDir = path.join(sourceAssetsRoot, meta.sector, meta.code, meta.versionSlug);
    const primaryRelPath = posixPath(path.relative(process.cwd(), path.join(sectorDir, 'source.pdf')));

    if (!dryRun) ensureDir(sectorDir);
    try {
      const status = await downloadBinary(meta.primaryPdfUrl, path.join(sectorDir, 'source.pdf'), dryRun);
      if (!dryRun) {
        console.log(`[ingest] pdf ${status}: ${meta.primaryPdfUrl} → ${primaryRelPath}`);
      }
    } catch (err) {
      console.error(`[ingest] failed to download PDF for ${meta.code} ${meta.versionSlug}: ${err.message}`);
      throw err;
    }

    const toolPaths = [];
    for (const toolUrl of meta.toolUrls) {
      try {
        const rel = await ensureToolAsset(toolUrl, toolsRoot, toolCache, dryRun);
        toolPaths.push(rel);
      } catch (err) {
        console.warn(`[ingest] failed to download tool ${toolUrl}: ${err.message}`);
      }
    }

    methods.set(key, {
      ...meta,
      primaryAsset: primaryRelPath,
      toolAssets: toolPaths,
    });
  }

  if (!methods.size) {
    console.error('[ingest] no methodologies harvested from provided pages');
    process.exit(1);
  }

  if (pdfLinks.length) {
    const unmatched = pdfLinks.filter((link) => !Array.from(methods.values()).some((method) => method.primaryPdfUrl === link));
    if (unmatched.length) {
      console.warn(`[ingest] skipped ${unmatched.length} standalone PDF URLs (handled via page parsing)`);
    }
  }

  const methodEntries = Array.from(methods.values()).sort((a, b) => {
    if (a.code === b.code) return a.versionSlug.localeCompare(b.versionSlug);
    return a.code.localeCompare(b.code);
  });

  const ingestDoc = {
    version: 2,
    methods: methodEntries.map((method) => ({
      id: `UNFCCC.${method.sector}.${method.code}`,
      version: method.versionSlug,
      sector: method.sector,
      source_page: method.sourcePage,
      assets: {
        primary: method.primaryAsset,
        tools: method.toolAssets,
      },
      include_text: [],
      exclude_text: [],
    })),
  };

  if (!dryRun) {
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, buildYaml(ingestDoc), 'utf8');
    console.log(`[ingest] wrote ${outPath}`);
  } else {
    console.log('[ingest] dry-run complete (no files written)');
  }
}

main().catch((err) => {
  console.error(`[ingest] fatal: ${err.message}`);
  process.exit(1);
});
