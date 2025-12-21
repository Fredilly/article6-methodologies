import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_CAUSE_ENTRIES_DIR = path.join(REPO_ROOT, 'docs', 'projects', 'phase-1-ingestion', 'root-causes');
const OUTPUT_REL_PATH = 'docs/projects/phase-1-ingestion/ROOT_CAUSE_INDEX.md';
const OUTPUT_PATH = path.join(REPO_ROOT, ...OUTPUT_REL_PATH.split('/'));

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function listEntryFiles() {
  if (!fs.existsSync(ROOT_CAUSE_ENTRIES_DIR)) {
    throw new Error(`Root-cause entries dir not found: ${ROOT_CAUSE_ENTRIES_DIR}`);
  }
  return fs
    .readdirSync(ROOT_CAUSE_ENTRIES_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function parseTags(lines) {
  for (const line of lines) {
    const tagLine = line.match(/^\s*(?:-\s*)?Tags:\s*\[(.*)\]\s*$/);
    if (!tagLine) continue;
    const raw = tagLine[1].trim();
    return raw
      ? raw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
  }
  return [];
}

function parseDate(lines, rcId) {
  for (const line of lines) {
    const match = line.match(/^\s*-\s*(?:\*\*Date:\*\*|Date:)\s*(.+?)\s*$/);
    if (match) return match[1].trim();
  }
  const ts = rcId.match(/^RC-(\d{4})(\d{2})(\d{2})-\d{6}$/);
  if (ts) return `${ts[1]}-${ts[2]}-${ts[3]}`;
  return '';
}

function parseTitle(lines, rcId) {
  for (const line of lines) {
    const match = line.match(/^\s*-\s*\*\*(Title|Name):\*\*\s*(.+?)\s*$/);
    if (match) return match[2].trim();
  }
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.*)$/);
    if (!h1) continue;
    const raw = h1[1].trim();
    const separators = [' — ', ' – ', ' - '];
    for (const sep of separators) {
      const parts = raw.split(sep);
      if (parts.length >= 2 && parts[0].trim() === rcId) return parts.slice(1).join(sep).trim();
    }
    return raw;
  }
  return '';
}

function buildEntries() {
  const files = listEntryFiles();
  return files.map((fileName) => {
    const rcId = path.basename(fileName, '.md');
    const relPath = path.posix.join('root-causes', fileName);
    const filePath = path.join(ROOT_CAUSE_ENTRIES_DIR, fileName);
    const markdown = readText(filePath);
    const lines = markdown.split('\n');
    const tags = parseTags(lines);
    const date = parseDate(lines, rcId);
    const title = parseTitle(lines, rcId);
    return { rcId, date, title, tags, relPath };
  });
}

function buildIndex(entries) {
  const sorted = entries.slice().sort((a, b) => a.rcId.localeCompare(b.rcId));

  let out = '# Root Cause Index\n\n';
  out += 'Generated from root-cause entry files under `docs/projects/phase-1-ingestion/root-causes/`.\n\n';
  out += '| RC-ID | Date | Title | Link |\n';
  out += '| --- | --- | --- | --- |\n';
  for (const entry of sorted) {
    const tagsSuffix = entry.tags && entry.tags.length > 0 ? ` (tags: ${entry.tags.join(', ')})` : '';
    out += `| ${entry.rcId} | ${entry.date || ''} | ${entry.title || ''}${tagsSuffix} | [${entry.rcId}](${entry.relPath}) |\n`;
  }
  return out;
}

const entries = buildEntries();
const index = buildIndex(entries);
writeText(OUTPUT_PATH, index);
