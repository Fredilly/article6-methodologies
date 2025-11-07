#!/usr/bin/env node
/**
 * Generate META.json files for every tools version directory.
 * Aligns each tool META with its parent methodology metadata and records
 * deterministic asset hashes + byte sizes without downloading anything new.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOLS_ROOT = path.join(ROOT, 'tools');
const METH_ROOT = path.join(ROOT, 'methodologies');
const AUDIT_CREATED_BY = 'scripts/generate-tools-meta.js';

function posixJoin(...parts) {
  return path.join(...parts).split(path.sep).join('/');
}

function sha256File(absPath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(absPath);
  hash.update(data);
  return hash.digest('hex');
}

function bytesOf(absPath) {
  return fs.statSync(absPath).size;
}

function isLfsTracked(relPath) {
  const res = spawnSync('git', ['check-attr', 'filter', '--', relPath], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  if (res.status !== 0) {
    throw new Error(`git check-attr failed for ${relPath}: ${res.stderr || res.stdout}`);
  }
  return /: filter: lfs/.test(res.stdout);
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listToolVersionDirs() {
  const result = [];
  function walk(currentRel) {
    const abs = currentRel ? path.join(TOOLS_ROOT, currentRel) : TOOLS_ROOT;
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    const hasPdf = entries.some(
      entry => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')
    );
    if (hasPdf && currentRel) {
      result.push(currentRel.split(path.sep).join('/'));
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(currentRel ? path.join(currentRel, entry.name) : entry.name);
      }
    }
  }
  walk('');
  return result.sort();
}

function buildMetaFor(relDir) {
  const methodologyMetaPath = path.join(METH_ROOT, relDir, 'META.json');
  if (!fs.existsSync(methodologyMetaPath)) {
    throw new Error(`Missing methodology META for ${relDir}`);
  }
  const methodologyMeta = loadJson(methodologyMetaPath);
  const relSegments = relDir.split('/');
  const versionFromPath = relSegments[relSegments.length - 1];
  const idFromPath = relSegments.slice(0, -1).join('.').replace(/\.{2,}/g, '.');
  const methodologyId = methodologyMeta.id || idFromPath;
  const methodologyVersion = versionFromPath;
  const referencedTools = (methodologyMeta.references?.tools || []).filter(tool =>
    tool.path.startsWith(posixJoin('tools', relDir))
  );
  if (referencedTools.length === 0) {
    throw new Error(`No references.tools entries found for ${relDir}`);
  }
  const assetsMap = new Map();
  for (const tool of referencedTools) {
    const absAsset = path.join(ROOT, tool.path);
    if (!fs.existsSync(absAsset)) {
      throw new Error(`Referenced asset missing on disk: ${tool.path}`);
    }
    const bytes = tool.size ?? bytesOf(absAsset);
    const sha256 = tool.sha256 ?? sha256File(absAsset);
    const payload = {
      path: tool.path,
      kind: tool.kind || 'pdf',
      sha256,
      bytes,
      size: bytes,
      doc: tool.doc ?? null,
      url: Object.prototype.hasOwnProperty.call(tool, 'url') ? tool.url : null,
      lfs: isLfsTracked(tool.path)
    };
    assetsMap.set(tool.path, payload);
  }
  const assets = [...assetsMap.values()].sort((a, b) => a.path.localeCompare(b.path));

  const auditSource = methodologyMeta.audit || {};
  const audit = {
    created_at: auditSource.created_at || auditSource.updated_at || '1970-01-01T00:00:00Z',
    created_by: AUDIT_CREATED_BY
  };
  if (methodologyMeta.automation?.repo_commit) {
    audit.source_commit = methodologyMeta.automation.repo_commit;
  }

  const references = {
    methodology: `${methodologyId}@${methodologyVersion}`,
    meta_path: posixJoin('methodologies', relDir, 'META.json'),
    doc: methodologyMeta.references?.primary_document || null,
    url: methodologyMeta.source_page || null
  };

  return {
    id: methodologyId,
    version: methodologyVersion,
    audit,
    references,
    assets
  };
}

function writeMeta(relDir, meta) {
  const outPath = path.join(TOOLS_ROOT, relDir, 'META.json');
  fs.writeFileSync(outPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

function main() {
  const dirs = listToolVersionDirs();
  let wrote = 0;
  for (const relDir of dirs) {
    const meta = buildMetaFor(relDir);
    writeMeta(relDir, meta);
    wrote += 1;
  }
  console.log(`Generated META.json for ${wrote} tool version folder(s).`);
}

main();
