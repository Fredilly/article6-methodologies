#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.join(__dirname, '..');
const posixPath = (value) => value.split(path.sep).join('/');
const ua = 'article6-codex/1.0';

const methods = [
  {
    code: 'ACM0010',
    currentVersion: 'v03-0',
    viewUrl: 'https://cdm.unfccc.int/methodologies/DB/66DCX9DCDE8UFYYIHJEY5NRPAA8WNE/view.html',
  },
  {
    code: 'AM0073',
    currentVersion: 'v01-0',
    viewUrl: 'https://cdm.unfccc.int/methodologies/DB/2N19WQ6DCXNYRNJVZQQOHG7TK0Q2D8/view.html',
  },
  {
    code: 'AMS-III.D',
    currentVersion: 'v21-0',
    viewUrl: 'https://cdm.unfccc.int/methodologies/DB/H9DVSB24O7GEZQYLYNWUX23YS6G4RC/view.html',
  },
  {
    code: 'AMS-III.R',
    currentVersion: 'v05-0',
    viewUrl: 'https://cdm.unfccc.int/methodologies/DB/Q8EMKMK67G1XIUKJFED8EVFL2VH1SN/view.html',
  },
];

const monthMap = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  sept: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const readFile = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const shaFile = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const shaBuffer = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const writeTextIfChanged = (filePath, content) => {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (existing === content) return;
  fs.writeFileSync(filePath, content, 'utf8');
};

const writeBufferIfChanged = (filePath, buf) => {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath);
    if (existing.equals(buf)) return;
  }
  fs.writeFileSync(filePath, buf);
};

const writeJson = (filePath, data) => {
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  writeTextIfChanged(filePath, payload);
};

const fetchText = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': ua } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
};

const fetchBuffer = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': ua } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const stripTags = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeToolVersion = (raw) => {
  const trimmed = raw.replace(/^v/i, '');
  const match = trimmed.match(/^([0-9]+)/);
  if (!match) return `v${trimmed}`;
  const major = String(parseInt(match[1], 10));
  const paddedMajor = major.padStart(2, '0');
  return `v${paddedMajor}${trimmed.slice(match[1].length)}`;
};

const normalizeVersionDir = (version) => {
  const [majorRaw, minorRaw = '0'] = version.trim().split('.');
  const major = String(parseInt(majorRaw, 10)).padStart(2, '0');
  const minor = String(parseInt(minorRaw, 10));
  return `v${major}-${minor}`;
};

const parseDate = (value) => {
  if (!value) return null;
  const match = value.trim().match(/^([0-9]{1,2})\s+([A-Za-z]+)\s+([0-9]{2,4})$/);
  if (!match) return null;
  const [, dayRaw, monthNameRaw, yearRaw] = match;
  const monthKey = monthNameRaw.toLowerCase();
  const month = monthMap[monthKey];
  if (!month) return null;
  let yearNum = parseInt(yearRaw, 10);
  if (yearRaw.length === 2) {
    yearNum += yearNum >= 90 ? 1900 : 2000;
  }
  const day = dayRaw.padStart(2, '0');
  return `${yearNum}-${month}-${day}`;
};

const parsePreviousVersions = (html) => {
  const markerIdx = html.indexOf('Previous Versions');
  if (markerIdx === -1) return [];
  const section = html.slice(markerIdx);
  const regex =
    /<th>Title<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>\s*<tr>\s*<th>Version number<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>\s*<tr>\s*<th>Validity<\/th>\s*<td>([\s\S]*?)<\/td>/gi;
  const entries = [];
  let match;
  while ((match = regex.exec(section)) !== null) {
    const [_, titleCell, versionCell, validityCell] = match;
    const linkMatch = titleCell.match(/href="([^"]+)"/i);
    const pdfUrl = linkMatch ? linkMatch[1] : null;
    const versionText = stripTags(versionCell);
    const validityText = stripTags(validityCell);
    const validityMatch = validityText.match(
      /valid\s+from\s+([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{2,4})(?:\s+to\s+([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{2,4}|Present))?/i,
    );
    if (!pdfUrl || !versionText || !validityMatch) continue;
    const validFrom = parseDate(validityMatch[1]?.trim());
    const rawValidTo = validityMatch[2]?.trim();
    const validTo =
      rawValidTo && !/^present$/i.test(rawValidTo) ? parseDate(rawValidTo) : null;
    entries.push({
      pdfUrl,
      versionLabel: versionText.trim(),
      versionDir: normalizeVersionDir(versionText),
      effectiveFrom: validFrom,
      effectiveTo: validTo,
    });
  }
  return entries;
};

const buildToolList = (method) => {
  const dir = path.join(repoRoot, 'tools', 'UNFCCC', 'Agriculture', method.code, method.currentVersion);
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.'))
    .sort((a, b) => a.localeCompare(b));
  return entries
    .map((fileName) => {
      const lower = fileName.toLowerCase();
      const fullPath = path.join(dir, fileName);
      const relPath = posixPath(path.relative(repoRoot, fullPath));
      const stat = fs.statSync(fullPath);
      const kind = lower.endsWith('.pdf') ? 'pdf' : lower.endsWith('.docx') ? 'docx' : 'file';
      let doc = null;
      if (lower === 'source.pdf' || lower === 'source.docx') {
        doc = `UNFCCC/${method.code}@${method.currentVersion}`;
      } else {
        const match = fileName.match(/^am-tool-([0-9]+)-v(.+)\.[^.]+$/i);
        if (!match) {
          throw new Error(`Unrecognized tool file name: ${fileName}`);
        }
        const number = String(parseInt(match[1], 10)).padStart(2, '0');
        const version = normalizeToolVersion(match[2]);
        doc = `UNFCCC/AM-TOOL${number}@${version}`;
      }
      return {
        doc,
        kind,
        path: relPath,
        sha256: shaFile(fullPath),
        size: stat.size,
        url: null,
        absolute: fullPath,
        isSource: lower.startsWith('source.'),
      };
    })
    .sort((a, b) => {
      if (a.isSource === b.isSource) return a.doc.localeCompare(b.doc);
      return a.isSource ? 1 : -1;
    });
};

const updateActiveMeta = (method, tools) => {
  const metaPath = path.join(
    repoRoot,
    'methodologies',
    'UNFCCC',
    'Agriculture',
    method.code,
    method.currentVersion,
    'META.json',
  );
  const meta = JSON.parse(readFile(metaPath));
  meta.references = meta.references || {};
  meta.references.tools = tools.map(({ doc, kind, path: relPath, sha256, size }) => ({
    doc,
    kind,
    path: relPath,
    sha256,
    size,
    url: null,
  }));
  writeJson(metaPath, meta);
};

const pointerPath = (fromDir, absoluteTarget) =>
  posixPath(path.relative(fromDir, absoluteTarget));

const safeCodeForId = (code) => code.replace(/\./g, '-');

const buildPreviousMeta = (method, entry, tools, pdfSha, pdfSize, pdfPath, sourceUrl) => {
  const safeCode = safeCodeForId(method.code);
  return {
    audit_hashes: {
      source_pdf_sha256: pdfSha,
    },
    automation: {},
    effective_from: entry.effectiveFrom,
    effective_to: entry.effectiveTo,
    id: `UNFCCC.Agriculture.${safeCode}`,
    kind: 'methodology',
    pointers: {
      active_successor: '../..',
    },
    provenance: {
      author: 'Fred Egbuedike',
      date: new Date().toISOString(),
      methodology_page: method.viewUrl,
      source_pdfs: [
        {
          doc: `UNFCCC/${method.code}@${method.currentVersion}`,
          kind: 'pdf',
          path: pdfPath,
          sha256: pdfSha,
          size: pdfSize,
        },
      ],
      source_url: sourceUrl,
      version_number: entry.versionLabel,
    },
    publisher: 'UNFCCC',
    references: {
      tools: [],
    },
    status: 'superseded',
    tools: tools.map((tool) => ({
      doc: tool.doc,
      kind: tool.kind,
      pointer: pointerPath(
        path.join(
          repoRoot,
          'methodologies',
          'UNFCCC',
          'Agriculture',
          method.code,
          method.currentVersion,
          'previous',
          entry.versionDir,
        ),
        tool.absolute,
      ),
      sha256: tool.sha256,
      size: tool.size,
    })),
    version: entry.versionDir,
  };
};

const ensurePointersFile = (dir, currentVersion) => {
  const pointerFile = path.join(dir, 'POINTERS.md');
  const content = `Normative tools: see active version ${currentVersion}/tools/\n`;
  writeTextIfChanged(pointerFile, content);
};

const processMethod = async (method) => {
  console.log(`→ Processing ${method.code}`);
  const tools = buildToolList(method);
  updateActiveMeta(method, tools);
  const html = await fetchText(method.viewUrl);
  const entries = parsePreviousVersions(html);
  if (!entries.length) {
    console.log(`  • No previous versions detected for ${method.code}`);
    return;
  }
  for (const entry of entries) {
    const pdfBuffer = await fetchBuffer(entry.pdfUrl);
    const pdfSha = shaBuffer(pdfBuffer);
    const pdfSize = pdfBuffer.length;
    const sourceAssetsDir = path.join(
      repoRoot,
      'source-assets',
      'UNFCCC',
      'Agriculture',
      method.code,
      entry.versionDir,
    );
    ensureDir(sourceAssetsDir);
    const sourceAssetsPath = path.join(sourceAssetsDir, 'source.pdf');
    writeBufferIfChanged(sourceAssetsPath, pdfBuffer);
    const toolsPrevDir = path.join(
      repoRoot,
      'tools',
      'UNFCCC',
      'Agriculture',
      method.code,
      method.currentVersion,
      'previous',
      entry.versionDir,
      'tools',
    );
    ensureDir(toolsPrevDir);
    const prevSourcePath = path.join(toolsPrevDir, 'source.pdf');
    writeBufferIfChanged(prevSourcePath, pdfBuffer);
    ensurePointersFile(toolsPrevDir, method.currentVersion);
    const pdfRelPath = posixPath(path.relative(repoRoot, sourceAssetsPath));
    const metaDir = path.join(
      repoRoot,
      'methodologies',
      'UNFCCC',
      'Agriculture',
      method.code,
      method.currentVersion,
      'previous',
      entry.versionDir,
    );
    ensureDir(metaDir);
    const meta = buildPreviousMeta(
      method,
      entry,
      tools,
      pdfSha,
      pdfSize,
      pdfRelPath,
      entry.pdfUrl,
    );
    writeJson(path.join(metaDir, 'META.json'), meta);
    console.log(`  • Added previous version ${entry.versionDir} for ${method.code}`);
  }
};

async function main() {
  for (const method of methods) {
    await processMethod(method);
  }
  console.log('✓ Agriculture previous versions updated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
