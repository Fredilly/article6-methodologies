#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.join(__dirname, '..');
const posixPath = (value) => value.split(path.sep).join('/');

const methods = [
  { code: 'ACM0010', currentVersion: 'v03-0' },
  { code: 'AM0073', currentVersion: 'v01-0' },
  { code: 'AMS-III.D', currentVersion: 'v21-0' },
  { code: 'AMS-III.R', currentVersion: 'v05-0' },
];

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
const readFile = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
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
        const version = match[2].startsWith('v') ? match[2] : `v${match[2]}`;
        doc = `UNFCCC/AM-TOOL${number}@${version}`;
      }
      return {
        doc,
        kind,
        path: relPath,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex'),
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

const updateActiveMetaTools = (method, tools) => {
  const metaPath = path.join(
    repoRoot,
    'methodologies',
    'UNFCCC',
    'Agriculture',
    method.code,
    method.currentVersion,
    'META.json',
  );
  const raw = readFile(metaPath);
  if (!raw) throw new Error(`Missing META.json for ${method.code} ${method.currentVersion}`);
  const meta = JSON.parse(raw);
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

const ensureSourceEntry = (meta, method, version, entryPath, assetInfo) => {
  const existing = Array.isArray(meta?.provenance?.source_pdfs) ? meta.provenance.source_pdfs[0] : null;
  const entry = {
    doc: existing?.doc || `UNFCCC/${method.code}@${version}`,
    kind: existing?.kind || 'pdf',
    path: entryPath,
    sha256: assetInfo.sha,
    size: assetInfo.size,
  };
  if (existing?.url) entry.url = existing.url;
  meta.provenance = meta.provenance || {};
  meta.provenance.source_pdfs = [entry];
  meta.audit_hashes = meta.audit_hashes || {};
  meta.audit_hashes.source_pdf_sha256 = assetInfo.sha;
};

const listPreviousVersionDirs = (method) => {
  const previousDir = path.join(
    repoRoot,
    'methodologies',
    'UNFCCC',
    'Agriculture',
    method.code,
    method.currentVersion,
    'previous',
  );
  if (!fs.existsSync(previousDir)) return [];
  return fs
    .readdirSync(previousDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+-\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
};

const copyPdfToAssets = (method, version, sourcePdfPath) => {
  if (!fs.existsSync(sourcePdfPath)) {
    throw new Error(`Missing source.pdf for ${method.code} ${version} under tools`);
  }
  const buffer = fs.readFileSync(sourcePdfPath);
  const assetsDir = path.join(
    repoRoot,
    'source-assets',
    'UNFCCC',
    'Agriculture',
    method.code,
    version,
  );
  ensureDir(assetsDir);
  const assetPath = path.join(assetsDir, 'source.pdf');
  writeBufferIfChanged(assetPath, buffer);
  const relPath = posixPath(path.relative(repoRoot, assetPath));
  return {
    relPath,
    sha: shaBuffer(buffer),
    size: buffer.length,
    absolute: assetPath,
  };
};

const updateMetaSource = (metaPath, method, version, assetInfo, entryPath) => {
  const raw = readFile(metaPath);
  if (!raw) {
    console.warn(`  • META missing for ${method.code} ${version}, skipping provenance Stamp.`);
    return;
  }
  const meta = JSON.parse(raw);
  const pathForEntry = entryPath || assetInfo.relPath;
  ensureSourceEntry(meta, method, version, pathForEntry, assetInfo);
  writeJson(metaPath, meta);
};

const pointerPath = (fromDir, absoluteTarget) =>
  posixPath(path.relative(fromDir, absoluteTarget));

const ensurePointersFile = (dir, currentVersion) => {
  const pointerFile = path.join(dir, 'POINTERS.md');
  const content = `Normative tools: see active version ${currentVersion}/tools/\n`;
  writeTextIfChanged(pointerFile, content);
};

const syncPreviousToolPointers = (method, prevVersion, toolsDir) => {
  ensureDir(toolsDir);
  const sourcePdf = path.join(toolsDir, 'source.pdf');
  if (!fs.existsSync(sourcePdf)) {
    console.warn(`  • Missing tools/source.pdf for ${method.code} ${prevVersion}; skipping pointer refresh.`);
    return null;
  }
  ensurePointersFile(toolsDir, method.currentVersion);
  return sourcePdf;
};

const processMethod = (method) => {
  console.log(`→ Syncing Agriculture assets for ${method.code}`);
  const tools = buildToolList(method);
  updateActiveMetaTools(method, tools);

  const activeToolPdf = path.join(
    repoRoot,
    'tools',
    'UNFCCC',
    'Agriculture',
    method.code,
    method.currentVersion,
    'source.pdf',
  );
  const activeAssetInfo = copyPdfToAssets(method, method.currentVersion, activeToolPdf);
  const activeMetaPath = path.join(
    repoRoot,
    'methodologies',
    'UNFCCC',
    'Agriculture',
    method.code,
    method.currentVersion,
    'META.json',
  );
  const activeToolRelPath = posixPath(path.relative(repoRoot, activeToolPdf));
  updateMetaSource(
    activeMetaPath,
    method,
    method.currentVersion,
    activeAssetInfo,
    activeToolRelPath,
  );
  console.log(`  • Updated active source-assets for ${method.currentVersion}`);

  const previousVersions = listPreviousVersionDirs(method);
  if (!previousVersions.length) {
    console.log('  • No previous versions found in methodologies/');
    return;
  }

  for (const prevVersion of previousVersions) {
    const toolsPrevDir = path.join(
      repoRoot,
      'tools',
      'UNFCCC',
      'Agriculture',
      method.code,
      method.currentVersion,
      'previous',
      prevVersion,
      'tools',
    );
    const prevToolPdf = syncPreviousToolPointers(method, prevVersion, toolsPrevDir);
    if (!prevToolPdf) continue;
    const assetInfo = copyPdfToAssets(method, prevVersion, prevToolPdf);
    const prevMetaPath = path.join(
      repoRoot,
      'methodologies',
      'UNFCCC',
      'Agriculture',
      method.code,
      method.currentVersion,
      'previous',
      prevVersion,
      'META.json',
    );
    updateMetaSource(prevMetaPath, method, prevVersion, assetInfo);
    console.log(`  • Synced previous version ${prevVersion}`);
  }
};

const verifyDeterministicPointers = (method) => {
  const previousDir = path.join(
    repoRoot,
    'methodologies',
    'UNFCCC',
    'Agriculture',
    method.code,
    method.currentVersion,
    'previous',
  );
  if (!fs.existsSync(previousDir)) return;
  const entries = fs.readdirSync(previousDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const entry of entries) {
    const toolsDir = path.join(
      repoRoot,
      'tools',
      'UNFCCC',
      'Agriculture',
      method.code,
      method.currentVersion,
      'previous',
      entry.name,
      'tools',
    );
    if (!fs.existsSync(toolsDir)) continue;
    const pointer = path.join(toolsDir, 'POINTERS.md');
    const expected = `Normative tools: see active version ${method.currentVersion}/tools/\n`;
    writeTextIfChanged(pointer, expected);
  }
};

const main = () => {
  for (const method of methods) {
    processMethod(method);
    verifyDeterministicPointers(method);
  }
  console.log('✓ Agriculture source-assets synced.');
};

main();
