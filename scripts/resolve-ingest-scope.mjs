#!/usr/bin/env node
/*
Usage:
  node scripts/resolve-ingest-scope.mjs --source [ingest|issue|project] \
    --issue 123 --project 1 --token $GITHUB_TOKEN \
    --in ingest.yml --out ./.tmp/ingest.scoped.yml \
    --codes batches/2024-01-01.codes.txt [--force]
*/
import fs from 'node:fs';
import path from 'node:path';

const args = (() => {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key.slice(2)] = next;
      i += 1;
    } else {
      out[key.slice(2)] = 'true';
    }
  }
  return out;
})();

const SRC = (args.source || 'ingest').toLowerCase();
const INGEST_IN = path.resolve(args.in || 'ingest.yml');
const OUT = path.resolve(args.out || '.tmp/ingest.scoped.yml');
const ISSUE = Number(args.issue || 0);
const PROJECT = Number(args.project || 0);
const TOKEN = process.env.GITHUB_TOKEN || args.token || process.env.GH_TOKEN || '';
const FORCE = parseBoolean(args.force);
const rawCodesArg = args.codes || '';
const CODES_ARG = rawCodesArg && rawCodesArg !== 'true' ? path.resolve(rawCodesArg) : '';

const repoFull = process.env.GITHUB_REPOSITORY || '';
const [owner = '', repo = ''] = repoFull.split('/');

const ID_RE = /\b[A-Z0-9.-]*UNFCCC\.[A-Za-z]+\.[A-Z0-9.-]+|UNFCCC\.[A-Za-z]+\.[A-Z0-9.-]+\b/g;

function parseBoolean(value) {
  if (value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
}

function scopeError(exitCode, message) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

function mustAllow({ code, id, allowCodes, allowListEmpty }) {
  if (allowListEmpty) return;
  if (!code) {
    throw scopeError(12, `[resolve-ingest] unable to derive method code from id=${id}`);
  }
  if (!allowCodes.has(code)) {
    const allowedList = Array.from(allowCodes).join(', ') || '(none)';
    throw scopeError(12, `[resolve-ingest] method code ${code} not in allow-list (${allowedList})`);
  }
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function stripQuotes(str) {
  return str.replace(/^\"/, '').replace(/\"$/, '');
}

function parseInlineList(value) {
  const inner = value.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((entry) => stripQuotes(entry.trim()))
    .filter(Boolean);
}

function parseYaml(yaml) {
  const lines = yaml.split(/\r?\n/);
  const out = { version: '', methods: [] };
  let cur = null;
  let listKey = null;

  for (const rawLine of lines) {
    const ln = rawLine.replace(/\r$/, '');
    const trimmed = ln.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      if (!trimmed) listKey = null;
      continue;
    }
    if (ln.startsWith('version:')) {
      out.version = ln.split(':')[1].trim();
      continue;
    }
    if (/^\s*-\s+id:/.test(ln)) {
      const id = ln.replace(/^\s*-\s+id:\s*/, '').trim();
      cur = { id, include_text: [], exclude_text: [] };
      out.methods.push(cur);
      listKey = null;
      continue;
    }
    if (!cur) continue;

    const propMatch = ln.match(/^\s*([A-Za-z_]+):\s*(.*)$/);
    if (propMatch) {
      const [, key, valueRaw] = propMatch;
      const value = valueRaw.trim();
      if (key === 'include_text') {
        cur.include_text = [];
        listKey = 'include_text';
        if (value.startsWith('[')) {
          cur.include_text.push(...parseInlineList(value));
          listKey = null;
        }
        continue;
      }
      if (key === 'exclude_text') {
        cur.exclude_text = [];
        listKey = 'exclude_text';
        if (value.startsWith('[')) {
          cur.exclude_text.push(...parseInlineList(value));
          listKey = null;
        }
        continue;
      }
      cur[key] = stripQuotes(value);
      listKey = null;
      continue;
    }

    const listMatch = ln.match(/^\s*-\s*\"?(.*?)\"?\s*$/);
    if (listMatch && listKey && cur[listKey]) {
      cur[listKey].push(listMatch[1]);
      continue;
    }

    if (/^\S/.test(ln)) listKey = null;
  }
  return out;
}

function quote(str) {
  return `"${str.replace(/\"/g, '\\"')}"`;
}

function dumpYaml(doc) {
  const lines = [];
  lines.push(`version: ${doc.version}`);
  lines.push('methods:');
  for (const m of doc.methods) {
    lines.push(`  - id: ${m.id}`);
    if (m.version) lines.push(`    version: ${m.version}`);
    if (m.sector) lines.push(`    sector: ${m.sector}`);
    if (m.source_page) lines.push(`    source_page: ${quote(m.source_page)}`);
    if (m.include_text?.length) {
      lines.push('    include_text:');
      for (const t of m.include_text) lines.push(`      - ${quote(t)}`);
    }
    if (m.exclude_text?.length) {
      lines.push(`    exclude_text: [${m.exclude_text.map((t) => quote(t)).join(', ')}]`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function extractCode(id) {
  const parts = `${id || ''}`.split('.');
  if (parts.length <= 2) return parts[parts.length - 1] || '';
  return parts.slice(2).join('.');
}

function normalizeId(value) {
  return (value || '').trim().toUpperCase();
}

function parseIssueField(body, heading) {
  const lines = (body || '').split(/\r?\n/);
  const headerRegex = new RegExp(`^###\\s*${heading}\\b`, 'i');
  for (let i = 0; i < lines.length; i += 1) {
    if (!headerRegex.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].startsWith('### ')) break;
      const value = lines[j].trim();
      if (value) return value;
    }
    break;
  }
  return '';
}

function loadCodesFromFile(filePath) {
  if (!filePath) return [];
  if (!fs.existsSync(filePath)) {
    console.warn(`[resolve-ingest] codes file ${filePath} not found; skipping file scope`);
    return [];
  }
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

async function gh(pathname) {
  if (!TOKEN) throw new Error('GITHUB_TOKEN is required to resolve issue or project scopes');
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'resolve-ingest-scope-script',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${pathname} → ${res.status}`);
  return res.json();
}

async function collectIdsFromIssue() {
  if (!ISSUE) return [];
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY not set');

  const issue = await gh(`/repos/${owner}/${repo}/issues/${ISSUE}`);
  const scoped = new Set();

  const codesField = parseIssueField(issue.body || '', 'codes_file');
  if (codesField) {
    const sanitized = codesField.replace(/`/g, '').trim();
    const codesPath = sanitized ? path.resolve(sanitized) : '';
    const codes = loadCodesFromFile(codesPath);
    if (codes.length) {
      console.log(`[resolve-ingest] issue #${ISSUE} codes_file → ${codes.length} entries`);
      codes.forEach((value) => scoped.add(normalizeId(value)));
    } else {
      console.warn(`[resolve-ingest] issue #${ISSUE} codes_file empty: ${codesField}`);
    }
  }

  try {
    const comments = await gh(`/repos/${owner}/${repo}/issues/${ISSUE}/comments`);
    const text = [issue.title || '', issue.body || '', ...comments.map((c) => c.body || '')].join('\n');
    (text.match(ID_RE) || [])
      .map((s) => s.replace(/^.*?(UNFCCC\.[A-Za-z]+\.[A-Z0-9.-]+).*$/, '$1'))
      .filter(Boolean)
      .forEach((value) => scoped.add(normalizeId(value)));
  } catch (err) {
    console.warn(`[resolve-ingest] failed to inspect issue comments: ${err.message}`);
  }

  return Array.from(scoped);
}

async function collectIdsFromProject() {
  // Placeholder for future project scoping.
  return [];
}

(async () => {
  ensureDir(OUT);
  if (SRC === 'txt') {
    if (!args.in) throw new Error('--in path is required when source=txt');
    if (!fs.existsSync(INGEST_IN)) throw new Error(`txt source file ${INGEST_IN} not found`);
    const codes = fs
      .readFileSync(INGEST_IN, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    const lines = [];
    if (codes.length) {
      lines.push('include:');
      for (const code of codes) {
        lines.push(`  - code: ${quote(code)}`);
        lines.push('    version: "latest"');
      }
    } else {
      lines.push('include: []');
    }
    fs.writeFileSync(OUT, `${lines.join('\n')}\n`);
    console.log(`[ok] scoped ${codes.length} codes from ${INGEST_IN}`);
    return;
  }
  if (!fs.existsSync(INGEST_IN)) throw new Error(`input file ${INGEST_IN} not found`);

  if (rawCodesArg === 'true') {
    console.warn('[resolve-ingest] --codes flag provided without a path; ignoring');
  }

  const full = parseYaml(fs.readFileSync(INGEST_IN, 'utf8'));

  let ids = [];
  if (SRC === 'issue' && ISSUE) ids = await collectIdsFromIssue();
  else if (SRC === 'project' && PROJECT) ids = await collectIdsFromProject();

  if (CODES_ARG) {
    const codesFromArg = loadCodesFromFile(CODES_ARG);
    if (codesFromArg.length) {
      console.log(`[resolve-ingest] --codes ${CODES_ARG} → ${codesFromArg.length} entries`);
      ids = ids.concat(codesFromArg);
    } else {
      console.warn(`[resolve-ingest] --codes ${CODES_ARG} empty`);
    }
  }

  const idset = new Set();
  const allowCodes = new Set();

  for (const value of ids) {
    const normalized = normalizeId(value);
    if (normalized) idset.add(normalized);
    const code = normalizeId(extractCode(value));
    if (code) {
      idset.add(code);
      allowCodes.add(code);
    }
  }

  const allowListEmpty = allowCodes.size === 0;
  if (allowListEmpty && !FORCE) {
    throw scopeError(11, '[resolve-ingest] allow-list is empty; provide codes or re-run with --force to include all methods');
  }
  if (allowListEmpty && FORCE) {
    console.warn('[resolve-ingest] allow-list empty; --force set → including all methods');
  }

  const scoped = { version: full.version, methods: [] };
  const selected = [];
  const hasScopedIds = idset.size > 0;

  for (const method of full.methods) {
    const fullId = normalizeId(method.id);
    const code = normalizeId(extractCode(method.id));
    let inScope = false;
    if (hasScopedIds) {
      inScope = idset.has(fullId) || idset.has(code);
    } else if (!allowListEmpty) {
      inScope = allowCodes.has(code);
    } else {
      inScope = true;
    }
    if (!inScope) continue;
    mustAllow({ code, id: method.id, allowCodes, allowListEmpty });
    selected.push(method);
  }

  if (!selected.length) {
    throw scopeError(12, `[resolve-ingest] allow-list matched 0 methods from ingest.yml (ids=${ids.join(', ') || '(none)'})`);
  }

  scoped.methods = selected;
  console.log(`[resolve-ingest] scoped → ${scoped.methods.length} methods`);

  fs.writeFileSync(OUT, dumpYaml(scoped));
  console.log(`scope=${SRC} ids=${ids.join(',') || '(all)'} → ${OUT}`);
})().catch((err) => {
  const exitCode = Number.isInteger(err.exitCode) ? err.exitCode : 1;
  const tag = exitCode ? `fatal(${exitCode})` : 'fatal';
  console.error(`[resolve-ingest] ${tag}: ${err.message}`);
  process.exit(exitCode);
});
