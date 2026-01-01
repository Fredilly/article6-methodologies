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

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        out[key] = sortKeysDeep(value[key]);
      });
    return out;
  }
  return value;
}

function stableStringify(value) {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

function isGoodSectionsJson(sectionsPath) {
  if (!fs.existsSync(sectionsPath)) return false;
  try {
    const raw = fs.readFileSync(sectionsPath, 'utf8');
    const parsed = JSON.parse(raw);
    const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
    if (sections.length < 5) return false;
    const containsTodo = (value) => typeof value === 'string' && /todo/i.test(value);
    const hasTodoDeep = (value) => {
      if (containsTodo(value)) return true;
      if (!value || typeof value !== 'object') return false;
      if (Array.isArray(value)) return value.some((entry) => hasTodoDeep(entry));
      return Object.values(value).some((entry) => hasTodoDeep(entry));
    };
    return !hasTodoDeep(parsed);
  } catch {
    return false;
  }
}

function ensureSectionsRichFromLean(methodDir) {
  const sectionsPath = path.join(methodDir, 'sections.json');
  const richPath = path.join(methodDir, 'sections.rich.json');
  if (!fs.existsSync(sectionsPath)) return false;
  try {
    const lean = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'));
    const sections = Array.isArray(lean?.sections) ? lean.sections : [];
    if (!sections.length) return false;
    const rich = sections.map((section) => ({
      id: section.id,
      title: section.title,
      anchor: section.anchor,
    }));
    fs.writeFileSync(richPath, stableStringify(rich));
    return true;
  } catch {
    return false;
  }
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

function methodFragments(parts) {
  const org = parts[1];
  const program = parts[2];
  const code = parts[3];
  const version = parts[4];
  const previousIndex = parts.indexOf('previous');
  if (previousIndex !== -1 && parts[previousIndex + 1]) {
    return {
      org,
      program,
      code,
      version: parts[previousIndex + 1],
      activeVersion: version,
      isPrevious: true,
    };
  }
  return { org, program, code, version, activeVersion: version, isPrevious: false };
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
  const script = [
    'import sys',
    'from pdfminer.high_level import extract_text',
    'pdf_path = sys.argv[1]',
    "sys.stdout.write(extract_text(pdf_path) or '')",
  ].join('\n');
  const result = spawnSync('python3', ['-c', script, pdfPath], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 40,
  });
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

async function main() {
  const methodArg = process.argv[2];
  if (!methodArg) usage();
  const sourceOverride = process.argv[3];
  const { absolute: methodDir, parts } = ensureMethodPath(methodArg);
  const { org, program, code, version, activeVersion, isPrevious } = methodFragments(parts);
  // Keep provenance stable: previous versions reference the active version (idempotency across CI runs).
  const docRef = `${org}/${code}@${activeVersion}`;

  const pdfPath =
    sourceOverride && sourceOverride !== '-'
      ? path.resolve(sourceOverride)
      : isPrevious
        ? path.join(repoRoot, 'tools', org, program, code, activeVersion, 'previous', version, 'tools', 'source.pdf')
        : path.join(repoRoot, 'tools', org, program, code, version, 'source.pdf');

  const sectionsPath = path.join(methodDir, 'sections.json');
  const existingGoodSections = isGoodSectionsJson(sectionsPath);

  const { isUsablePdf } = await import('./pdf-preflight.mjs');
  if (!isUsablePdf(pdfPath)) {
    if (existingGoodSections) {
      const richPath = path.join(methodDir, 'sections.rich.json');
      if (!fs.existsSync(richPath) || fs.statSync(richPath).size === 0) {
        ensureSectionsRichFromLean(methodDir);
      }
      console.log('[extract-sections] source.pdf unusable; keeping existing sections.json (skip-safe)');
      return;
    }
    console.error('[extract-sections] source.pdf unusable and no valid sections.json to keep (missing/placeholder/LFS-pointer/empty).');
    console.error('[extract-sections] cannot generate sections.json; ensure git-lfs pulled the real PDF or add the source asset.');
    process.exit(2);
  }

  const pdfHash = sha256(pdfPath);
  if (isPrevious && existingGoodSections) {
    const richPath = path.join(methodDir, 'sections.rich.json');
    if (fs.existsSync(richPath) && fs.statSync(richPath).size > 0) {
      try {
        const rich = JSON.parse(fs.readFileSync(richPath, 'utf8'));
        const first = Array.isArray(rich) ? rich[0] : null;
        const prov = first && first.provenance ? first.provenance : null;
        const sourceHash = prov && prov.source_hash ? String(prov.source_hash) : '';
        const sourceRef = prov && prov.source_ref ? String(prov.source_ref) : '';
        if (sourceHash === pdfHash && sourceRef === docRef) {
          console.log('[extract-sections] previous sections already pinned to current source; skipping rewrite (idempotent)');
          return;
        }
      } catch {
        // fall through to regeneration
      }
    }
  }
  let text = '';
  try {
    text = extractText(pdfPath);
  } catch (err) {
    if (existingGoodSections) {
      console.log('[extract-sections] source.pdf extraction failed; leaving existing sections.json intact');
      return;
    }
    throw err;
  }

  const textLength = text ? text.length : 0;
  console.log(`[sections] extracted text length ${textLength} for ${docRef}`);
  if (!text || !text.trim()) {
    if (existingGoodSections) {
      console.log('[extract-sections] extracted 0 text; leaving existing sections.json intact');
      return;
    }
    console.error('[extract-sections] extracted 0 text and no valid sections.json to keep.');
    console.error('[extract-sections] cannot generate sections.json; ensure git-lfs pulled the real PDF or add the source asset.');
    process.exit(2);
  }

  const sections = parseSections(text);
  if (sections.length < 5) {
    if (existingGoodSections) {
      console.log('[extract-sections] extracted <5 sections; leaving existing sections.json intact');
      return;
    }
    console.error(`[extract-sections] extracted ${sections.length} sections; require at least 5`);
    process.exit(2);
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

  fs.writeFileSync(path.join(methodDir, 'sections.rich.json'), stableStringify(rich));
  fs.writeFileSync(path.join(methodDir, 'sections.json'), stableStringify(lean));

  console.log(`[sections] extracted ${sections.length} sections for ${docRef}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[sections] ${err.message}`);
    process.exit(2);
  });
}
