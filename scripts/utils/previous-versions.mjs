import fs from 'node:fs';
import path from 'node:path';

export function parseArgs(argv) {
  const out = {};
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
}

export function sectorToken(sector) {
  return String(sector || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function deterministicGeneratedAt() {
  const raw = process.env.SOURCE_DATE_EPOCH;
  const sec = raw ? Number(raw) : 0;
  const ms = Number.isFinite(sec) ? sec * 1000 : 0;
  return new Date(ms).toISOString();
}

export function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, obj) {
  ensureDir(filePath);
  const out = JSON.stringify(obj, null, 2) + '\n';
  fs.writeFileSync(filePath, out);
}

export function extractCodeFromId(id) {
  const parts = String(id || '').trim().split('.');
  if (parts.length < 3) return parts[parts.length - 1] || '';
  return parts.slice(2).join('.');
}

export function compareVersionsDesc(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa && pb) {
    if (pa.major !== pb.major) return pb.major - pa.major;
    if (pa.minor !== pb.minor) return pb.minor - pa.minor;
    return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
  }
  return String(b).localeCompare(String(a), 'en', { sensitivity: 'variant' });
}

function parseVersion(v) {
  const m = String(v || '').match(/^v(\d+)-(\d+)$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

