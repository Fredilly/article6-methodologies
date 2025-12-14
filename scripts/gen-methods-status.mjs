import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, data) {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, json, 'utf8');
}

function listFilesRecursively(rootDir, targetBasename) {
  const results = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === targetBasename) {
        results.push(fullPath);
      }
    }
  }
  results.sort();
  return results;
}

function findRegistryPath() {
  const rootRegistry = path.join(REPO_ROOT, 'registry.json');
  if (fs.existsSync(rootRegistry)) return rootRegistry;
  const altRegistry = path.join(REPO_ROOT, 'registry', 'registry.json');
  if (fs.existsSync(altRegistry)) return altRegistry;
  return null;
}

function canonicalizeMethodPath(methodologyPath) {
  const normalized = methodologyPath.replace(/\\/g, '/');
  if (!normalized.startsWith('methodologies/')) return null;
  const canonical = normalized.replace(/^methodologies\//, '');
  if (canonical.includes('/previous/')) return null;
  return canonical;
}

function parseMethodParts(canonicalPath) {
  const parts = canonicalPath.split('/').filter(Boolean);
  if (parts.length < 4) return null;
  const [program, sector, code, version] = parts;
  return { program, sector, code, version };
}

function requiredHashesForProgram(program) {
  if (program === 'UNFCCC') {
    return ['source_pdf_sha256', 'sections_json_sha256', 'rules_json_sha256'];
  }
  return ['source_pdf_sha256'];
}

function hasAllRequiredHashes(meta, program) {
  const auditHashes = meta?.audit_hashes;
  if (!auditHashes || typeof auditHashes !== 'object') return false;
  return requiredHashesForProgram(program).every(
    (key) => typeof auditHashes[key] === 'string' && auditHashes[key].length > 0,
  );
}

function loadMetaByCanonicalMethodPath() {
  const methodsRoot = path.join(REPO_ROOT, 'methodologies');
  if (!fs.existsSync(methodsRoot)) return new Map();

  const metaFiles = listFilesRecursively(methodsRoot, 'META.json');
  const map = new Map();
  for (const metaFile of metaFiles) {
    const rel = path.relative(REPO_ROOT, metaFile).replace(/\\/g, '/');
    const methodDir = rel.replace(/\/META\.json$/, '');
    const canonical = canonicalizeMethodPath(methodDir);
    if (!canonical) continue;
    try {
      map.set(canonical, readJsonFile(metaFile));
    } catch {
      map.set(canonical, null);
    }
  }
  return map;
}

function buildMethodsStatus(registryEntries, metaByMethod) {
  const records = new Map();

  for (const entry of registryEntries) {
    const regPath = entry?.path;
    if (typeof regPath !== 'string') continue;

    const canonical = canonicalizeMethodPath(regPath);
    if (!canonical) continue;

    const parts = parseMethodParts(canonical);
    if (!parts) continue;

    const methodDir = path.join(REPO_ROOT, 'methodologies', canonical);
    const previousDir = path.join(methodDir, 'previous');

    const meta = metaByMethod.get(canonical) ?? null;

    records.set(canonical, {
      sector: parts.sector,
      program: parts.program,
      code: parts.code,
      version: parts.version,
      hashes_present: hasAllRequiredHashes(meta, parts.program),
      has_previous_versions:
        fs.existsSync(previousDir) && fs.statSync(previousDir).isDirectory(),
      idempotent_verified: false,
      last_root_cause: null,
    });
  }

  const sortedKeys = Array.from(records.keys()).sort();
  const output = {};
  for (const key of sortedKeys) output[key] = records.get(key);
  return output;
}

const registryPath = findRegistryPath();
if (!registryPath) {
  throw new Error('No registry.json found at repo root or registry/registry.json');
}

const registryData = readJsonFile(registryPath);
if (!Array.isArray(registryData)) {
  throw new Error(`Expected ${path.relative(REPO_ROOT, registryPath)} to be a JSON array`);
}

const metaByMethod = loadMetaByCanonicalMethodPath();
const methodsStatus = buildMethodsStatus(registryData, metaByMethod);

writeJsonFile(path.join(REPO_ROOT, 'registry', 'methods-status.json'), methodsStatus);
