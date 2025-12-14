import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function findRootCausePath() {
  const candidates = [
    path.join(REPO_ROOT, 'ROOT_CAUSE.md'),
    path.join(REPO_ROOT, 'docs', 'projects', 'phase-1-ingestion', 'ROOT_CAUSE.md'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function parseEntries(markdown) {
  const lines = markdown.split('\n');
  const entries = [];
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^###\s+(.*)$/);
    if (heading) {
      if (current) entries.push(current);
      current = { title: heading[1].trim(), tags: [] };
      continue;
    }
    if (!current) continue;
    const tagLine = line.match(/^\s*-\s*Tags:\s*\[(.*)\]\s*$/);
    if (tagLine) {
      const raw = tagLine[1].trim();
      const tags = raw
        ? raw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      current.tags = tags;
    }
  }

  if (current) entries.push(current);
  return entries;
}

function buildIndex(entries) {
  const byTag = new Map();
  const untagged = [];

  for (const entry of entries) {
    const title = entry.title;
    if (!entry.tags || entry.tags.length === 0) {
      untagged.push(title);
      continue;
    }
    for (const tag of entry.tags) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(title);
    }
  }

  const tags = Array.from(byTag.keys()).sort((a, b) => a.localeCompare(b));
  for (const tag of tags) {
    byTag.get(tag).sort((a, b) => a.localeCompare(b));
  }
  untagged.sort((a, b) => a.localeCompare(b));

  let out = '# Root Cause Index\n\n';
  out += 'Generated from Root Cause entries and their optional `Tags: [...]` lines.\n\n';

  for (const tag of tags) {
    out += `## ${tag}\n\n`;
    for (const title of byTag.get(tag)) out += `- ${title}\n`;
    out += '\n';
  }

  out += '## untagged\n\n';
  if (untagged.length === 0) {
    out += '- (none)\n';
  } else {
    for (const title of untagged) out += `- ${title}\n`;
  }

  return out;
}

const rootCausePath = findRootCausePath();
if (!rootCausePath) {
  throw new Error('Could not find ROOT_CAUSE.md (repo root) or docs/projects/phase-1-ingestion/ROOT_CAUSE.md');
}

const docsDir = path.join(REPO_ROOT, 'docs');
const outputPath = fs.existsSync(docsDir)
  ? path.join(docsDir, 'ROOT_CAUSE_INDEX.md')
  : path.join(REPO_ROOT, 'ROOT_CAUSE_INDEX.md');

const markdown = readText(rootCausePath);
const entries = parseEntries(markdown);
const index = buildIndex(entries);
writeText(outputPath, index);

