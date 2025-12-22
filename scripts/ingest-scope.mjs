#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, sectorToken } from './utils/cli.mjs';

function usage() {
  console.error('Usage: node scripts/ingest-scope.mjs --sector <Sector> [--include-previous] [--previous-lock <path>]');
  process.exit(2);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sector = String(args.sector || '').trim();
  if (!sector) usage();

  const token = sectorToken(sector);
  const ingestYml = `ingest.${token}.yml`;
  if (!fs.existsSync(ingestYml)) {
    console.error(`[ingest-scope] ingest file not found: ${ingestYml}`);
    process.exit(2);
  }

  const includePrevious = String(args['include-previous'] || '') === 'true';
  let previousLock = String(args['previous-lock'] || '').trim();
  if (includePrevious && !previousLock) {
    console.error('[ingest-scope] --include-previous requires --previous-lock <path>');
    process.exit(2);
  }
  if (includePrevious && previousLock && !fs.existsSync(previousLock)) {
    const legacy = 'source-assets/UNFCCC/Agriculture/previous-versions.lock.json';
    const relocated = 'registry/UNFCCC/Agriculture/previous-versions.lock.json';
    if (previousLock === legacy && fs.existsSync(relocated)) {
      console.warn(`[ingest-scope] lockfile moved: using ${relocated} (was ${legacy})`);
      previousLock = relocated;
    } else {
      console.error(`[ingest-scope] previous lockfile not found: ${previousLock}`);
      process.exit(2);
    }
  }

  const env = { ...process.env };
  env.ARTICLE6_SECTOR = sector;
  if (!('SOURCE_DATE_EPOCH' in env)) {
    env.SOURCE_DATE_EPOCH = '0';
  }
  if (includePrevious) {
    env.ARTICLE6_INCLUDE_PREVIOUS = '1';
    env.ARTICLE6_PREVIOUS_LOCK = previousLock;
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const ingestScoped = path.resolve(scriptDir, 'ingest-scoped.sh');
  const res = spawnSync('bash', [ingestScoped, ingestYml], { stdio: 'inherit', env });
  process.exit(res.status ?? 1);
}

main();
