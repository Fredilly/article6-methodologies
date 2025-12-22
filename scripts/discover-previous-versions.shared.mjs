import fs from 'node:fs';
import path from 'node:path';
import { parseIngestYaml } from './resolve-ingest-scope.mjs';
import { compareVersionsDesc, extractCodeFromId, sectorToken } from './utils/cli.mjs';

function listCodesFromIngest({ program, sector }) {
  const token = sectorToken(sector);
  const ingestPath = path.resolve(process.cwd(), `ingest.${token}.yml`);
  if (!fs.existsSync(ingestPath)) {
    throw new Error(`[previous:discover] ingest file not found: ${path.relative(process.cwd(), ingestPath)}`);
  }
  const doc = parseIngestYaml(fs.readFileSync(ingestPath, 'utf8'));
  const methods = Array.isArray(doc?.methods) ? doc.methods : [];
  const codes = new Set();
  for (const m of methods) {
    const id = String(m?.id || '').trim();
    if (!id) continue;
    if (!id.toLowerCase().startsWith(`${program.toLowerCase()}.${sector.toLowerCase()}.`)) continue;
    const code = extractCodeFromId(id);
    if (code) codes.add(code);
  }
  return Array.from(codes).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function discoverVersionsForCode({ program, sector, code }) {
  const base = path.resolve(process.cwd(), 'source-assets', program, sector, code);
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return [];
  const entries = fs.readdirSync(base, { withFileTypes: true });
  const versions = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => /^v\d+-\d+$/.test(name))
    .sort(compareVersionsDesc);
  return versions;
}

export async function discoverPreviousVersions({ program, sector, generated_at }) {
  const codes = listCodesFromIngest({ program, sector });
  const methods = codes.map((code) => ({
    code,
    versions: discoverVersionsForCode({ program, sector, code }),
  }));

  return {
    generated_at,
    program,
    sector,
    methods
  };
}
