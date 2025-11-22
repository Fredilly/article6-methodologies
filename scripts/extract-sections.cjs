#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PAGE_MARKER_RE = /^\d+\s+of\s+\d+$/i;
const MIN_SECTION_CONTENT_LENGTH = 10;

async function extractSections({ pdfPath, outPath, methodId }) {
  const resolvedPdf = path.resolve(pdfPath);
  if (!fs.existsSync(resolvedPdf)) {
    throw new Error(`[sections] missing PDF: ${resolvedPdf}`);
  }
  const resolvedOut = path.resolve(outPath);
  const outputDir = path.dirname(resolvedOut);
  fs.mkdirSync(outputDir, { recursive: true });

  const text = readPdfText(resolvedPdf);
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim());
  const sections = sanitizeSections(buildSections(lines));
  const payload = {
    sections: sections.map((section, index) => {
      const id = `S-${String(index + 1).padStart(4, '0')}`;
      return {
        id,
        title: section.title,
        anchor: section.anchor,
        content: section.content,
        anchors: section.anchors || []
      };
    })
  };

  fs.writeFileSync(resolvedOut, `${JSON.stringify(payload, null, 2)}\n`);
  const descriptor = methodId || path.relative(process.cwd(), resolvedOut);
  console.log(`[sections] wrote ${path.relative(process.cwd(), resolvedOut)} (${payload.sections.length} sections${descriptor ? ` for ${descriptor}` : ''})`);
  return payload;
}

function buildSections(lines) {
  const headers = [];
  for (const line of lines) {
    if (isPageMarker(line)) continue;
    if (isHeader(line)) {
      headers.push(line);
    }
  }
  const sectionList = [];
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isPageMarker(line)) continue;
    if (isHeader(line)) {
      if (current) {
        sectionList.push(current);
      }
      current = { title: line, body: [] };
      continue;
    }
    if (!current) {
      current = { title: 'Document Overview', body: [] };
    }
    current.body.push(line);
  }
  if (current) {
    sectionList.push(current);
  }
  if (sectionList.length === 0) {
    sectionList.push({
      title: 'Document Overview',
      body: lines.filter((line) => line.trim().length > 0)
    });
  }
  return sectionList;
}

function isHeader(line) {
  if (!line) return false;
  const normalized = line.trim();
  if (isPageMarker(normalized)) return false;
  if (normalized.length < 5 || normalized.length > 200) return false;
  const numericHeading = /^\d+(\.\d+)*\.\s+/.test(normalized);
  const hasLetters = /[A-Z]/.test(normalized);
  const allCaps = normalized === normalized.toUpperCase() && hasLetters && normalized.includes(' ');
  return numericHeading || allCaps;
}

function deriveAnchor(bodyLines) {
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return '';
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1];
      args[key] = value;
      i += 1;
    }
  }
  return args;
}

async function runCLI() {
  const args = parseArgs(process.argv.slice(2));
  const pdfPath = args.pdf;
  const outPath = args.out;
  const methodId = args['method-id'] || args.method;
  if (!pdfPath || !outPath) {
    console.error('Usage: node scripts/extract-sections.cjs --pdf <path/to.pdf> --out <path/to/sections.json> [--method-id <id>]');
    process.exit(2);
  }
  try {
    await extractSections({ pdfPath, outPath, methodId });
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  runCLI();
}

function readPdfText(pdfPath) {
  const pythonSnippet =
    'from pdfminer.high_level import extract_text;import sys;sys.stdout.write(extract_text(sys.argv[1]))';
  const commands = [
    ['pdftotext', ['-layout', '-q', pdfPath, '-']],
    ['python3', ['-c', pythonSnippet, pdfPath]]
  ];
  let lastError = null;
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if (result.status === 0 && !result.error) {
      return result.stdout;
    }
    lastError = result.error ? result.error : new Error(`${command} exited with ${result.status}`);
    if (result.error && result.error.code !== 'ENOENT') {
      break;
    }
  }
  throw new Error(`[sections] unable to extract text for ${pdfPath}: ${lastError ? lastError.message : 'unknown error'}`);
}

module.exports = { extractSections };

function sanitizeSections(sectionList) {
  const filtered = [];
  for (const section of sectionList) {
    const title = (section.title || '').trim();
    if (!title || isPageMarker(title)) continue;
    const content = section.body.join('\n').trim();
    if (content.length < MIN_SECTION_CONTENT_LENGTH) continue;
    filtered.push({
      title,
      anchor: deriveAnchor(section.body),
      content,
      anchors: []
    });
  }
  if (!filtered.length && sectionList.length) {
    const fallback = sectionList[0];
    filtered.push({
      title: (fallback.title || 'Document Overview').trim() || 'Document Overview',
      anchor: deriveAnchor(fallback.body),
      content: fallback.body.join('\n').trim(),
      anchors: []
    });
  }
  return filtered;
}

function isPageMarker(line) {
  if (!line) return false;
  return PAGE_MARKER_RE.test(line.trim());
}
