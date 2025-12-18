#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { canonicalPaths, parseIngestYaml } from './resolve-ingest-scope.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[name] = 'true';
      continue;
    }
    out[name] = next;
    i += 1;
  }
  return out;
}

function uniqueSorted(items) {
  return Array.from(new Set(items)).sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ingestFile = args['ingest-yml'];
  const kind = (args.kind || 'methodologies-dirs').toString();
  const sep = args.sep === 'null' ? '' : (args.sep || '\n').toString();

  if (!ingestFile) {
    console.error(
      'Usage: node scripts/ingest-scope-paths.mjs --ingest-yml <path> --kind <methodologies-dirs|tools-dirs|methodologies-roots|tools-roots|meta-files> [--sep <sep>]',
    );
    process.exit(1);
  }

  const ingestPath = path.resolve(process.cwd(), ingestFile);
  if (!fs.existsSync(ingestPath)) {
    console.error(`[ingest-scope-paths] ingest file not found: ${ingestPath}`);
    process.exit(2);
  }

  const ingestDoc = parseIngestYaml(fs.readFileSync(ingestPath, 'utf8'));
  const methods = ingestDoc.methods || [];
  if (!methods.length) {
    console.error(`[ingest-scope-paths] no methods found in ${ingestFile}`);
    process.exit(3);
  }

  const methodDirs = [];
  const toolDirs = [];
  for (const method of methods) {
    const id = `${method.id || ''}`.trim();
    const version = `${method.version || ''}`.trim();
    if (!id || !version) continue;
    const canonical = canonicalPaths({ id, version });
    methodDirs.push(canonical.methodologiesDir);
    toolDirs.push(canonical.toolsDir);
  }

  let out = [];
  switch (kind) {
    case 'methodologies-dirs':
      out = uniqueSorted(methodDirs);
      break;
    case 'tools-dirs':
      out = uniqueSorted(toolDirs);
      break;
    case 'methodologies-roots':
      out = uniqueSorted(methodDirs.map((dir) => dir.split('/').slice(0, 3).join('/')));
      break;
    case 'tools-roots':
      out = uniqueSorted(toolDirs.map((dir) => dir.split('/').slice(0, 3).join('/')));
      break;
    case 'meta-files': {
      const metaFiles = [];
      for (const methodDir of uniqueSorted(methodDirs)) {
        metaFiles.push(path.posix.join(methodDir, 'META.json'));
        const prevDir = path.resolve(process.cwd(), methodDir, 'previous');
        if (!fs.existsSync(prevDir)) continue;
        const versions = fs
          .readdirSync(prevDir, { withFileTypes: true })
          .filter((ent) => ent.isDirectory())
          .map((ent) => ent.name)
          .sort();
        for (const version of versions) {
          metaFiles.push(path.posix.join(methodDir, 'previous', version, 'META.json'));
        }
      }
      out = uniqueSorted(metaFiles);
      break;
    }
    default:
      console.error(`[ingest-scope-paths] unknown --kind: ${kind}`);
      process.exit(4);
  }

  process.stdout.write(out.join(sep));
  if (sep) process.stdout.write(sep);
}

main();

