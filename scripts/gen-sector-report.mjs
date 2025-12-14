import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function groupBySector(methodsStatus) {
  const bySector = new Map();
  for (const [methodKey, record] of Object.entries(methodsStatus)) {
    const sector = typeof record?.sector === 'string' ? record.sector : 'Unknown';
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector).push({ method: methodKey, record });
  }
  for (const entries of bySector.values()) {
    entries.sort((a, b) => a.method.localeCompare(b.method));
  }
  return bySector;
}

function loadSectorTargets() {
  const sectorsPath = path.join(REPO_ROOT, 'registry', 'sectors.json');
  if (!fs.existsSync(sectorsPath)) return new Map();
  const data = readJson(sectorsPath);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return new Map();

  const map = new Map();
  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== 'object') continue;
    const ref =
      typeof value.reference_methods === 'number'
        ? value.reference_methods
        : typeof value.expected_methods === 'number'
          ? value.expected_methods
          : null;
    const target =
      typeof value.target_methods === 'number'
        ? value.target_methods
        : typeof ref === 'number'
          ? ref
          : null;
    map.set(key, { reference_methods: ref, target_methods: target });
  }
  return map;
}

const inputPath = path.join(REPO_ROOT, 'registry', 'methods-status.json');
if (!fs.existsSync(inputPath)) {
  throw new Error('Missing registry/methods-status.json. Run: npm run status:methods');
}

const methodsStatus = readJson(inputPath);
if (!methodsStatus || typeof methodsStatus !== 'object' || Array.isArray(methodsStatus)) {
  throw new Error('Expected registry/methods-status.json to be a JSON object keyed by method path');
}

const bySector = groupBySector(methodsStatus);
const sectors = Array.from(bySector.keys()).sort((a, b) => a.localeCompare(b));
const sectorTargets = loadSectorTargets();

let out = '# Sector status report\n\n';
out += `Source: registry/methods-status.json\n`;

for (const sector of sectors) {
  const entries = bySector.get(sector) || [];
  const total = entries.length;
  const hashesPresent = entries.filter((e) => e.record?.hashes_present === true).length;
  const previousPresent = entries.filter((e) => e.record?.has_previous_versions === true).length;
  const missingHashes = entries
    .filter((e) => e.record?.hashes_present !== true)
    .map((e) => e.method);

  const sectorKey = `UNFCCC/${sector}`;
  const targetInfo = sectorTargets.get(sectorKey);
  const referenceMethods = targetInfo?.reference_methods;
  const targetMethods = targetInfo?.target_methods;

  out += `\n## ${sector}\n\n`;
  out += `- total_methods: ${total}\n`;
  if (typeof referenceMethods === 'number') out += `- reference_methods: ${referenceMethods}\n`;
  if (typeof targetMethods === 'number') out += `- target_methods: ${targetMethods}\n`;
  out += `- hashes_present: ${hashesPresent}\n`;
  out += `- has_previous_versions: ${previousPresent}\n`;
  out += `- missing_hashes:\n`;
  if (missingHashes.length === 0) {
    out += `  - (none)\n`;
  } else {
    for (const method of missingHashes) out += `  - ${method}\n`;
  }
}

writeText(path.join(REPO_ROOT, 'registry', 'sector-report.md'), out);
