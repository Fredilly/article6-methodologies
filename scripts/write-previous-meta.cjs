#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: node scripts/write-previous-meta.cjs --method <methodDir> --prev <prevDir> --version <vXX-X> --version_number <raw> --pdf_path <path> --pdf_sha <sha> --pdf_size <bytes> --pdf_url <url> --method_page <url> [--effective_from YYYY-MM-DD] [--effective_to YYYY-MM-DD]',
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key.slice(2)] = 'true';
    } else {
      out[key.slice(2)] = next;
      i += 1;
    }
  }
  return out;
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`unable to read ${file}: ${err.message}`);
  }
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = [
    'method',
    'prev',
    'version',
    'version_number',
    'pdf_path',
    'pdf_sha',
    'pdf_size',
    'pdf_url',
    'method_page',
  ];
  if (!required.every((key) => args[key])) {
    usage();
  }
  const repoRoot = path.resolve(__dirname, '..');
  const methodDir = path.resolve(args.method);
  const prevDir = path.resolve(args.prev);
  const metaPath = path.join(methodDir, 'META.json');
  const activeMeta = readJSON(metaPath);
  const relMethod = path.relative(repoRoot, methodDir).split(path.sep);
  if (relMethod.length < 5) {
    throw new Error(`[previous-meta] unexpected method path structure: ${methodDir}`);
  }
  const [, org, program, code, activeVersion] = relMethod;
  const docRef = `${org}/${code}@${activeVersion}`;
  const activeId = activeMeta.id || `${org}.${program}.${code}`;
  const pdfAbsolute = path.resolve(args.pdf_path);
  const pdfRelative = toPosix(path.relative(repoRoot, pdfAbsolute));
  const pointerToActive = toPosix(path.relative(prevDir, methodDir)) || '../..';
  const author =
    process.env.INGEST_PROVENANCE_AUTHOR ||
    activeMeta.provenance?.author ||
    process.env.USER ||
    'ingest.sh';
  const references = Array.isArray(activeMeta.references?.tools) ? activeMeta.references.tools : [];
  const toolPointers = references.map((tool) => {
    const absolute = path.resolve(repoRoot, tool.path || '');
    const pointer = toPosix(path.relative(prevDir, absolute));
    return {
      doc: tool.doc || null,
      kind: tool.kind || 'pdf',
      pointer,
      sha256: tool.sha256 || null,
      size: tool.size === undefined ? null : tool.size,
    };
  });
  const meta = {
    audit_hashes: {
      source_pdf_sha256: args.pdf_sha,
    },
    automation: {},
    id: activeId,
    kind: 'methodology',
    pointers: {
      active_successor: pointerToActive,
    },
    provenance: {
      author,
      date: new Date().toISOString(),
      methodology_page: args.method_page,
      source_url: args.pdf_url,
      version_number: args.version_number,
      source_pdfs: [
        {
          doc: docRef,
          kind: 'pdf',
          path: pdfRelative,
          sha256: args.pdf_sha,
          size: Number(args.pdf_size),
        },
      ],
    },
    publisher: org,
    references: {
      tools: [],
    },
    status: 'superseded',
    tools: toolPointers,
    version: args.version,
  };
  if (args.effective_from) meta.effective_from = args.effective_from;
  if (args.effective_to) meta.effective_to = args.effective_to;
  const outPath = path.join(prevDir, 'META.json');
  fs.writeFileSync(outPath, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`[previous-meta] wrote ${path.relative(repoRoot, outPath)}`);
}

main();
