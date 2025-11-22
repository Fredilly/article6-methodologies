#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function parseConfig(configPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  const config = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.+)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (rawValue === 'true') config[key] = true;
    else if (rawValue === 'false') config[key] = false;
    else config[key] = rawValue;
  }
  return config;
}

function collectMetaFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(collectMetaFiles(full));
    } else if (entry.isFile() && entry.name === 'META.json') {
      results.push(full);
    }
  }
  return results;
}

function isActive(meta) {
  const status = (meta.status || '').toLowerCase();
  return status !== 'superseded' && status !== 'withdrawn';
}

function requireField(value, message, errors, file) {
  if (value === undefined || value === null || value === '') {
    errors.push(`${file}: ${message}`);
    return false;
  }
  return true;
}

function validateMeta(meta, file, errors) {
  if (!file.startsWith('methodologies/UNFCCC/Forestry') || file.includes('/previous/')) {
    return;
  }
  const isLive = isActive(meta);
  if (!Array.isArray(meta.references?.tools) || meta.references.tools.length === 0) {
    errors.push(`${file}: references.tools empty or missing`);
  } else {
    meta.references.tools.forEach((tool, index) => {
      if (!tool.doc) errors.push(`${file}: references.tools[${index}].doc missing`);
      if (!tool.path) errors.push(`${file}: references.tools[${index}].path missing`);
      if (!tool.sha256) errors.push(`${file}: references.tools[${index}].sha256 missing`);
      if (tool.size === undefined) errors.push(`${file}: references.tools[${index}].size missing`);
    });
  }

  const sources = meta.provenance?.source_pdfs;
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push(`${file}: provenance.source_pdfs empty or missing`);
  } else {
    sources.forEach((source, index) => {
      if (!source.doc) errors.push(`${file}: provenance.source_pdfs[${index}].doc missing`);
      if (!source.path) errors.push(`${file}: provenance.source_pdfs[${index}].path missing`);
      if (!source.sha256) errors.push(`${file}: provenance.source_pdfs[${index}].sha256 missing`);
      if (source.size === undefined) errors.push(`${file}: provenance.source_pdfs[${index}].size missing`);
    });
  }

  if (isLive) {
    requireField(meta.provenance?.author, 'provenance.author missing', errors, file);
    requireField(meta.provenance?.date, 'provenance.date missing', errors, file);
    requireField(meta.audit?.created_at, 'audit.created_at missing', errors, file);
    requireField(meta.audit?.created_by, 'audit.created_by missing', errors, file);
    requireField(meta.audit_hashes?.rules_json_sha256, 'audit_hashes.rules_json_sha256 missing', errors, file);
    requireField(meta.audit_hashes?.sections_json_sha256, 'audit_hashes.sections_json_sha256 missing', errors, file);
    requireField(meta.audit_hashes?.source_pdf_sha256, 'audit_hashes.source_pdf_sha256 missing', errors, file);
    requireField(meta.automation?.repo_commit, 'automation.repo_commit missing', errors, file);
    requireField(meta.automation?.scripts_manifest_sha256, 'automation.scripts_manifest_sha256 missing', errors, file);
  }
}

function main() {
  const configPath = path.resolve(repoRoot, process.argv[2] || 'ingest-quality-gates.yml');
  if (!fs.existsSync(configPath)) {
    console.error(`[gates] missing ${path.relative(repoRoot, configPath)}`);
    process.exit(1);
  }
  const config = parseConfig(configPath);
  if (!config.meta_complete) {
    console.log('[gates] meta_complete disabled; skipping');
    return;
  }
  const metas = collectMetaFiles(path.join(repoRoot, 'methodologies'));
  const errors = [];
  metas.forEach((filePath) => {
    const rel = path.relative(repoRoot, filePath);
    try {
      const meta = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      validateMeta(meta, rel, errors);
    } catch (err) {
      errors.push(`${rel}: failed to parse - ${err.message}`);
    }
  });
  if (errors.length > 0) {
    errors.forEach((err) => console.error(`[gates] ${err}`));
    process.exit(1);
  }
  console.log('[gates] meta completeness checks passed');
}

main();
