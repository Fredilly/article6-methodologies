#!/usr/bin/env node
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function usage() {
  console.error('Usage: node scripts/extract-sections.cjs <methodologies/.../vXX-X> [source.pdf]');
  process.exit(2);
}

function sha256(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch (err) {
    throw new Error(`unable to hash ${filePath}: ${err.message}`);
  }
}

function ensureMethodPath(methodDir) {
  const absolute = path.resolve(methodDir);
  if (!absolute.startsWith(repoRoot)) {
    throw new Error('method path must live inside the repository');
  }
  const parts = path.relative(repoRoot, absolute).split(path.sep);
  if (parts.length < 5 || parts[0] !== 'methodologies') {
    throw new Error('method path must look like methodologies/<Org>/<Program>/<Code>/<Version>');
  }
  return { absolute, parts };
}

function slugify(title, collisions) {
  let base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) base = 'section';
  let slug = base;
  let n = 1;
  while (collisions.has(slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  collisions.add(slug);
  return slug;
}

function headerFromLine(line) {
  if (!line) return null;
  const normalized = line.replace(/\s+/g, ' ').trim();
  const len = normalized.length;
  if (len < 5 || len > 120) return null;

  const numeric = normalized.match(/^(\d+(?:\.\d+)*)(?:\.)?\s+(.*)$/);
  if (numeric) {
    const [, rawNumber, rest] = numeric;
    if (/^\d/.test(rawNumber)) {
      const level = rawNumber.split('.').length;
      const title = rest.trim();
      if (title.length >= 3) {
        return { title, numbering: rawNumber, level };
      }
    }
  }

  const letters = normalized.replace(/[^A-Za-z]/g, '');
  if (letters && letters === letters.toUpperCase()) {
    return { title: normalized, numbering: '', level: 1 };
  }

  return null;
}

function collectParagraphs(lines) {
  const out = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
    buf = [];
  };
  for (const line of lines) {
    if (!line) flush();
    else buf.push(line);
  }
  flush();
  return out;
}

function parseSections(text) {
  const rawLines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\f/g, '').trim());

  const sections = [];
  let current = null;
  let bodyLines = [];

  const finalizeCurrent = () => {
    if (!current) return;
    const paragraphs = collectParagraphs(bodyLines);
    current.content = paragraphs[0] || '';
    current.paragraphs = paragraphs;
    sections.push(current);
    current = null;
    bodyLines = [];
  };

  for (const line of rawLines) {
    const header = headerFromLine(line);
    if (header) {
      finalizeCurrent();
      current = {
        title: header.title.replace(/\s+/g, ' ').trim(),
        numbering: header.numbering || '',
        level: header.level || 1,
      };
      continue;
    }
    if (current) {
      bodyLines.push(line);
    }
  }
  finalizeCurrent();

  return sections.filter((section) => section.title && section.content);
}

function findPdftotext() {
  const found = spawnSync('which', ['pdftotext'], { encoding: 'utf8' });
  if (found.status !== 0) return '';
  return (found.stdout || '').trim();
}

function invokePdftotext(binary, pdfPath, outputTarget) {
  const result = spawnSync(binary, ['-layout', '-nopgbrk', pdfPath, outputTarget], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 40,
  });
  if (result.status === 0) {
    if (result.error) {
      console.warn(`[extract-sections] pdftotext reported "${result.error.message}" but exited 0`);
    }
    return result;
  }
  if (result.error) {
    throw new Error(`pdftotext failed for ${pdfPath}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`pdftotext exited with ${result.status} for ${pdfPath}: ${stderr}`);
  }
  return result;
}

function extractWithPdftotext(binary, pdfPath) {
  const stdoutResult = invokePdftotext(binary, pdfPath, '-');
  const stdoutText = stdoutResult.stdout || '';
  if (stdoutText && stdoutText.trim()) {
    return stdoutText;
  }

  console.warn(`[extract-sections] pdftotext stdout was empty; retrying via temp file for ${pdfPath}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdftxt-'));
  const tmpFile = path.join(tmpDir, 'out.txt');
  try {
    invokePdftotext(binary, pdfPath, tmpFile);
    return fs.readFileSync(tmpFile, 'utf8');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function extractWithPdfminer(pdfPath) {
  const result = spawnSync(
    'python3',
    ['-m', 'pdfminer.high_level', '--maxpages', '0', pdfPath],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 40 }
  );
  if (result.status === 0) {
    if (result.error) {
      console.warn(`[extract-sections] pdfminer reported "${result.error.message}" but exited 0`);
    }
    return result.stdout || '';
  }
  if (result.error) {
    throw new Error(`pdfminer failed for ${pdfPath}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(
      `pdfminer exited with ${result.status} for ${pdfPath}: ${stderr || 'install via python3 -m pip install pdfminer.six'}`
    );
  }
  return result.stdout || '';
}

function extractText(pdfPath) {
  const pdftotext = findPdftotext();
  if (pdftotext) {
    return extractWithPdftotext(pdftotext, pdfPath);
  }
  console.warn('[extract-sections] pdftotext missing, falling back to pdfminer.six');
  return extractWithPdfminer(pdfPath);
}

function main() {
  const methodArg = process.argv[2];
  if (!methodArg) usage();
  const sourceOverride = process.argv[3];
  const { absolute: methodDir, parts } = ensureMethodPath(methodArg);
  const [, org, program, code, version] = parts;
  const docRef = `${org}/${code}@${version}`;

  const pdfPath =
    sourceOverride && sourceOverride !== '-'
      ? path.resolve(sourceOverride)
      : path.join(repoRoot, 'tools', org, program, code, version, 'source.pdf');
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`primary PDF missing for ${docRef} (${pdfPath})`);
  }
  const pdfStats = fs.statSync(pdfPath);
  if (!pdfStats.isFile() || pdfStats.size === 0) {
    throw new Error(`primary PDF empty for ${docRef} (${pdfPath})`);
  }

  const pdfHash = sha256(pdfPath);
  const text = extractText(pdfPath);
  const textLength = text ? text.length : 0;
  console.log(`[sections] extracted text length ${textLength} for ${docRef}`);
  if (!text || !text.trim()) {
    throw new Error(`pdftotext produced no content for ${docRef} (${pdfPath})`);
  }
  const sections = parseSections(text);
  if (sections.length < 5) {
    throw new Error(`extracted ${sections.length} sections for ${docRef}; require at least 5`);
  }

  const anchorSet = new Set();
  sections.forEach((section, idx) => {
    section.id = `S-${String(idx + 1).padStart(4, '0')}`;
    section.anchor = slugify(section.title, anchorSet);
  });

  const rich = sections.map((section) => ({
    id: section.id,
    title: section.title,
    anchor: section.anchor,
    level: section.level,
    provenance: {
      source_hash: pdfHash,
      source_ref: docRef,
    },
  }));

  const lean = {
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      anchor: section.anchor,
      content: section.content,
    })),
  };

  fs.writeFileSync(path.join(methodDir, 'sections.rich.json'), `${JSON.stringify(rich, null, 2)}\n`);
  fs.writeFileSync(path.join(methodDir, 'sections.json'), `${JSON.stringify(lean, null, 2)}\n`);

  console.log(`[sections] extracted ${sections.length} sections for ${docRef}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[sections] ${err.message}`);
    process.exit(2);
  }
}
