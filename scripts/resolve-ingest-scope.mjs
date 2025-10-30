#!/usr/bin/env node
/*
Usage:
  node scripts/resolve-ingest-scope.mjs --source [ingest|issue|project] \
    --issue 123 --project 1 --token $GITHUB_TOKEN \
    --in ingest.yml --out ./.tmp/ingest.scoped.yml
*/
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = 'true';
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const SRC = args.source || 'ingest';
const INGEST_IN = args.in || 'ingest.yml';
const OUT = args.out || '.tmp/ingest.scoped.yml';
const ISSUE = Number(args.issue || 0);
const PROJECT = Number(args.project || 0);
const TOKEN = process.env.GITHUB_TOKEN || args.token || process.env.GH_TOKEN || '';

const repoFull = process.env.GITHUB_REPOSITORY || '';
const [owner = '', repo = ''] = repoFull.split('/');

const ID_RE = /\b[A-Z0-9.-]*UNFCCC\.[A-Za-z]+\.[A-Z0-9.-]+|UNFCCC\.[A-Za-z]+\.[A-Z0-9.-]+\b/g;

function ensureTmp(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function stripQuotes(str) {
  return str.replace(/^"/, '').replace(/"$/, '');
}

function parseInlineList(value) {
  const inner = value.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((entry) => stripQuotes(entry.trim()))
    .filter(Boolean);
}

// naive YAML loader (only what we need)
function parseYaml(y) {
  // VERY small parser for the provided structure: version: <num>\nmethods:\n - id: ...
  const lines = y.split(/\r?\n/);
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
    if (!cur) {
      continue;
    }

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

    const listMatch = ln.match(/^\s*-\s+"?(.*?)"?\s*$/);
    if (listMatch && listKey && cur[listKey]) {
      cur[listKey].push(listMatch[1]);
      continue;
    }

    // Reset listKey if indentation drops
    if (/^\S/.test(ln)) {
      listKey = null;
    }
  }
  return out;
}

function quote(str) {
  return `"${str.replace(/"/g, '\\"')}"`;
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
      for (const t of m.include_text) {
        lines.push(`      - ${quote(t)}`);
      }
    }
    if (m.exclude_text?.length) {
      lines.push(`    exclude_text: [${m.exclude_text.map((t) => quote(t)).join(', ')}]`);
    }
  }
  return lines.join('\n') + '\n';
}

async function gh(pathname) {
  if (!TOKEN) {
    throw new Error('GITHUB_TOKEN is required to resolve issue or project scopes');
  }
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'resolve-ingest-scope-script'
    }
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${pathname} → ${res.status}`);
  }
  return res.json();
}

async function collectIdsFromIssue() {
  if (!ISSUE) return [];
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY not set');
  const issue = await gh(`/repos/${owner}/${repo}/issues/${ISSUE}`);
  const comments = await gh(`/repos/${owner}/${repo}/issues/${ISSUE}/comments`);
  const text = [issue.title || '', issue.body || '', ...comments.map((c) => c.body || '')].join('\n');
  return (text.match(ID_RE) || [])
    .map((s) => s.replace(/^.*?(UNFCCC\.[A-Za-z]+\.[A-Z0-9.-]+).*$/, '$1'))
    .filter(Boolean);
}

// Minimal Projects v2 item scrape via search (expects IDs present in titles/notes)
async function collectIdsFromProject() {
  // Placeholder: extend later when project structure stabilises.
  return [];
}

(async () => {
  ensureTmp(OUT);
  const raw = fs.readFileSync(INGEST_IN, 'utf8');
  const full = parseYaml(raw);

  let ids = [];
  if (SRC === 'issue' && ISSUE) ids = await collectIdsFromIssue();
  else if (SRC === 'project' && PROJECT) ids = await collectIdsFromProject();

  const idset = new Set(ids);
  const scoped = { version: full.version, methods: [] };
  if (idset.size) {
    scoped.methods = full.methods.filter((m) => idset.has(m.id));
  } else {
    scoped.methods = full.methods; // fallback to all
  }

  fs.writeFileSync(OUT, dumpYaml(scoped));
  console.log(`scope=${SRC} ids=${[...idset].join(',') || '(all)'} → ${OUT}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
