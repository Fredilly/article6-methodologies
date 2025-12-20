#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(
    [
      'Usage:',
      '  npm run ingest:batch -- --codes <batches/*.codes.txt> --out <ingest.*.yml> [--sector Agriculture|Forestry]',
      '',
      'Example:',
      '  npm run ingest:batch -- --codes batches/agri-ams-iii.codes.txt --out ingest.agri-ams-iii.yml',
    ].join('\n') + '\n',
  );
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  const out = { codes: null, out: null, sector: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--codes' || arg === '--codes-file') {
      out.codes = argv[++i] ?? null;
      continue;
    }
    if (arg === '--out') {
      out.out = argv[++i] ?? null;
      continue;
    }
    if (arg === '--sector') {
      out.sector = argv[++i] ?? null;
      continue;
    }
    if (arg === '-h' || arg === '--help') usage();
    throw new Error(`unknown arg: ${arg}`);
  }
  if (!out.codes) throw new Error('missing --codes <path>');
  if (!out.out) throw new Error('missing --out <path>');
  if (out.sector && out.sector !== 'Agriculture' && out.sector !== 'Forestry') {
    throw new Error(`invalid --sector: ${out.sector} (expected Agriculture|Forestry)`);
  }
  return out;
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    usage(err && err.message ? err.message : String(err));
  }

  const discoverArgs = [
    'scripts/discover-unfccc.js',
    '--codes-file',
    opts.codes,
    '--emit',
    'ingest-yml',
    '--out',
    opts.out,
  ];
  if (opts.sector) discoverArgs.push('--sector', opts.sector);

  run('node', discoverArgs);
  run('npm', ['run', '-s', 'ingest:scoped:idempotent', '--', opts.out]);
  run('npm', ['run', '-s', 'validate:rich']);
  run('npm', ['run', '-s', 'validate:lean']);

  if (process.env.ARTICLE6_WORKSTATE === '1') {
    run('node', ['scripts/workstate-update.mjs', '--task', 'ingest:batch', '--scope', opts.out]);
  }
}

main();

