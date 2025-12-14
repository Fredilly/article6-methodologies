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

  out += `\n## ${sector}\n\n`;
  out += `- total_methods: ${total}\n`;
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

