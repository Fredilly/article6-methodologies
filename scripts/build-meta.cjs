#!/usr/bin/env node
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

async function main() {
  const methodArg = process.argv[2];
  if (!methodArg) {
    console.error('Usage: node scripts/build-meta.cjs <methodologies/.../vXX-X>');
    process.exit(2);
  }
  const methodDir = path.resolve(methodArg);
  if (!methodDir.startsWith(repoRoot)) {
    console.error('[meta] method path must be inside the repo');
    process.exit(2);
  }
  const relMethod = path.relative(repoRoot, methodDir).split(path.sep);
  if (relMethod.length < 5 || relMethod[0] !== 'methodologies') {
    console.error('[meta] method path must look like methodologies/<Org>/<Sector>/<Code>/<Version>');
    process.exit(2);
  }
  const [, org, sector, code, version] = relMethod;
  const methodDoc = `${org}/${code}@${version}`;
  const toolsDir = path.join(repoRoot, 'tools', org, sector, code, version);
  const metaPath = path.join(methodDir, 'META.json');
  const sectionsPath = path.join(methodDir, 'sections.json');
  const rulesRichPath = path.join(methodDir, 'rules.rich.json');

  const [sectionsHash, rulesHash] = [sectionsPath, rulesRichPath].map(hashFile);
  const existing = await readOptionalJson(metaPath);
  const existingSourcePaths = new Set(
    (existing?.provenance?.source_pdfs || []).map((entry) => entry.path).filter(Boolean)
  );
  const preferredTools = new Set(
    (existing?.references?.tools || []).map((entry) => entry.path).filter(Boolean)
  );

  const references = await buildToolReferences({ toolsDir, methodDoc, preferredTools, existingSourcePaths });
  let sourceRefs = references.filter((ref) => existingSourcePaths.has(ref.path));
  if (sourceRefs.length === 0) {
    sourceRefs = references.filter((ref) => ref.path.endsWith('/source.pdf'));
  }
  if (sourceRefs.length === 0) {
    throw new Error(`[meta] unable to determine main PDF for ${methodDoc}`);
  }

  const author = process.env.INGEST_PROVENANCE_AUTHOR || existing?.provenance?.author || 'Fred Egbuedike';
  const auditCreatedAt = existing?.audit?.created_at || new Date().toISOString();
  const provenanceDate = existing?.provenance?.date || auditCreatedAt;
  const createdBy = process.env.INGEST_CREATED_BY || existing?.audit?.created_by || 'ingest.sh';
  const repoCommit = readGitHead();
  const scriptsManifestHash = hashFile(path.join(repoRoot, 'scripts_manifest.json'));

  const rewrittenKeys = new Set(['audit_hashes', 'automation', 'provenance', 'references', 'audit']);
  const nextMeta = {};
  nextMeta.audit_hashes = {
    ...(existing?.audit_hashes || {}),
    rules_json_sha256: rulesHash,
    sections_json_sha256: sectionsHash,
    source_pdf_sha256: sourceRefs[0].sha256
  };
  nextMeta.automation = {
    ...(existing?.automation || {}),
    repo_commit: repoCommit,
    scripts_manifest_sha256: scriptsManifestHash
  };
  nextMeta.provenance = {
    ...(existing?.provenance || {}),
    author,
    date: provenanceDate,
    source_pdfs: sourceRefs.map((ref) => ({
      doc: ref.doc,
      kind: ref.kind,
      path: ref.path,
      sha256: ref.sha256,
      size: ref.size
    }))
  };
  nextMeta.references = {
    ...(existing?.references || {}),
    tools: references
  };
  nextMeta.audit = {
    ...(existing?.audit || {}),
    created_at: auditCreatedAt,
    created_by: createdBy
  };

  if (existing) {
    for (const key of Object.keys(existing)) {
      if (!rewrittenKeys.has(key)) {
        nextMeta[key] = existing[key];
      }
    }
  }

  const output = JSON.stringify(nextMeta, null, 2) + '\n';
  await fsp.writeFile(metaPath, output);
  console.log(`[meta] wrote ${path.relative(repoRoot, metaPath)}`);
}

async function readOptionalJson(file) {
  try {
    const data = await fsp.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function readGitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch (err) {
    throw new Error(`[meta] unable to read git HEAD: ${err.message}`);
  }
}

function hashFile(targetPath) {
  const absolute = path.resolve(targetPath);
  try {
    const data = fs.readFileSync(absolute);
    return crypto.createHash('sha256').update(data).digest('hex');
  } catch (err) {
    throw new Error(`[meta] unable to hash ${targetPath}: ${err.message}`);
  }
}

async function buildToolReferences({ toolsDir, methodDoc, preferredTools, existingSourcePaths }) {
  let entries = [];
  try {
    entries = await fsp.readdir(toolsDir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`[meta] unable to read tools directory ${toolsDir}: ${err.message}`);
  }
  const files = entries.filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name));

  files.sort((a, b) => sortKeys(a.name).localeCompare(sortKeys(b.name)));

  const references = [];
  for (const entry of files) {
    const absolute = path.join(toolsDir, entry.name);
    const relPath = path.relative(repoRoot, absolute).replace(/\\/g, '/');
    if (!shouldIncludePath(relPath, preferredTools)) {
      continue;
    }
    const stats = fs.statSync(absolute);
    const baseName = path.basename(relPath).toLowerCase();
    if (
      baseName === 'source.pdf' &&
      existingSourcePaths.size > 0 &&
      !existingSourcePaths.has(relPath)
    ) {
      continue;
    }
    const sha = hashFile(absolute);
    const doc = deriveDoc(relPath, methodDoc, existingSourcePaths.has(relPath));
    references.push({
      doc,
      kind: 'pdf',
      path: relPath,
      sha256: sha,
      size: stats.size,
      url: null
    });
  }
  if (references.length === 0) {
    throw new Error(`[meta] no PDF tools found in ${path.relative(repoRoot, toolsDir)}`);
  }
  return references;
}

function shouldIncludePath(relPath, preferredTools) {
  if (preferredTools.has(relPath)) {
    return true;
  }
  const lower = path.basename(relPath).toLowerCase();
  if (lower === 'source.pdf') return true;
  if (lower.startsWith('ar-') && lower.includes('-tool-')) return true;
  return preferredTools.size === 0;
}

function sortKeys(name) {
  return name.toLowerCase() === 'source.pdf' ? '' : name.toLowerCase();
}

function deriveDoc(relPath, methodDoc, isPrimary) {
  if (isPrimary || /\/source\.pdf$/i.test(relPath)) {
    return methodDoc;
  }
  const fileName = path.basename(relPath, path.extname(relPath));
  const toolMatch = fileName.match(/ar-[a-z]*-?tool-?(\d+)-v([\w.\-]+)/i);
  if (toolMatch) {
    const rawNumber = toolMatch[1].replace(/^0+/, '') || '0';
    const toolNumber = rawNumber.padStart(2, '0');
    const version = toolMatch[2];
    return `${methodDoc.split('/')[0]}/AR-TOOL${toolNumber}@v${version}`;
  }
  const safeStem = fileName.replace(/[^A-Za-z0-9]/g, '-');
  return `${methodDoc}#${safeStem}`;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
