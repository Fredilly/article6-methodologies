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
    else if (/^-?\d+$/.test(rawValue)) config[key] = Number(rawValue);
    else config[key] = rawValue;
  }
  return config;
}

function collectMetaFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectMetaFiles(full));
    else if (entry.isFile() && entry.name === 'META.json') out.push(full);
  });
  return out;
}

function readJson(file, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`${path.relative(repoRoot, file)}: failed to parse JSON (${err.message})`);
    return null;
  }
}

function requireField(value, message, errors, relFile) {
  if (value === undefined || value === null || value === '') {
    errors.push(`${relFile}: ${message}`);
    return false;
  }
  return true;
}

function containsTodo(value) {
  return typeof value === 'string' && /todo/i.test(value);
}

function checkReferences(meta, relFile, errors) {
  if (!Array.isArray(meta.references?.tools) || meta.references.tools.length === 0) {
    errors.push(`${relFile}: references.tools empty or missing`);
    return;
  }
  meta.references.tools.forEach((tool, index) => {
    if (!tool.doc) errors.push(`${relFile}: references.tools[${index}].doc missing`);
    if (!tool.path) errors.push(`${relFile}: references.tools[${index}].path missing`);
    if (!tool.sha256) errors.push(`${relFile}: references.tools[${index}].sha256 missing`);
    if (tool.size === undefined) errors.push(`${relFile}: references.tools[${index}].size missing`);
  });
}

function checkProvenance(meta, relFile, errors) {
  const sources = meta.provenance?.source_pdfs;
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push(`${relFile}: provenance.source_pdfs empty or missing`);
  } else {
    sources.forEach((source, index) => {
      if (!source.doc) errors.push(`${relFile}: provenance.source_pdfs[${index}].doc missing`);
      if (!source.path) errors.push(`${relFile}: provenance.source_pdfs[${index}].path missing`);
      if (!source.sha256) errors.push(`${relFile}: provenance.source_pdfs[${index}].sha256 missing`);
      if (source.size === undefined) errors.push(`${relFile}: provenance.source_pdfs[${index}].size missing`);
    });
  }
  requireField(meta.provenance?.author, 'provenance.author missing', errors, relFile);
  requireField(meta.provenance?.date, 'provenance.date missing', errors, relFile);
}

function checkAutomation(meta, relFile, errors) {
  requireField(meta.audit?.created_at, 'audit.created_at missing', errors, relFile);
  requireField(meta.audit?.created_by, 'audit.created_by missing', errors, relFile);
  requireField(
    meta.automation?.scripts_manifest_sha256,
    'automation.scripts_manifest_sha256 missing',
    errors,
    relFile,
  );
}

function checkAuditHashes(meta, relFile, errors) {
  requireField(meta.audit_hashes?.rules_json_sha256, 'audit_hashes.rules_json_sha256 missing', errors, relFile);
  requireField(meta.audit_hashes?.sections_json_sha256, 'audit_hashes.sections_json_sha256 missing', errors, relFile);
  requireField(meta.audit_hashes?.source_pdf_sha256, 'audit_hashes.source_pdf_sha256 missing', errors, relFile);
}

function checkSections(methodDir, relDir, config, errors) {
  const sectionsPath = path.join(methodDir, 'sections.json');
  if (!fs.existsSync(sectionsPath)) {
    errors.push(`${relDir}/sections.json missing`);
    return;
  }
  const data = readJson(sectionsPath, errors);
  if (!data) return;
  const list = Array.isArray(data.sections) ? data.sections : [];
  const minCount = Number(config.sections_min_count || 0);
  if (minCount && list.length < minCount) {
    errors.push(`${relDir}/sections.json has ${list.length} sections (< ${minCount})`);
  }
  if (config.sections_no_todo) {
    list.forEach((section, index) => {
      if (
        containsTodo(section?.title) ||
        containsTodo(section?.content) ||
        containsTodo(section?.anchor)
      ) {
        errors.push(`${relDir}/sections.json section[${index}] contains TODO placeholder`);
      }
    });
  }
}

function checkRules(methodDir, relDir, config, errors) {
  if (!config.rules_no_todo) return;
  const rulesPath = path.join(methodDir, 'rules.json');
  if (!fs.existsSync(rulesPath)) {
    errors.push(`${relDir}/rules.json missing`);
    return;
  }
  const data = readJson(rulesPath, errors);
  if (!data) return;
  const list = Array.isArray(data.rules) ? data.rules : [];
  list.forEach((rule, index) => {
    if (containsTodo(rule?.text) || containsTodo(rule?.logic) || containsTodo(rule?.summary)) {
      errors.push(`${relDir}/rules.json rule[${index}] contains TODO placeholder`);
    }
  });
}

function checkRegistry(expectedPaths, errors) {
  const registryPath = path.join(repoRoot, 'registry.json');
  if (!fs.existsSync(registryPath)) {
    errors.push('registry.json missing');
    return;
  }
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (err) {
    errors.push(`registry.json: failed to parse (${err.message})`);
    return;
  }
  const remaining = new Set(expectedPaths.map((p) => p.replace(/\\/g, '/')));
  registry.forEach((entry) => {
    if (entry.kind === 'active') {
      remaining.delete(entry.path);
    }
  });
  if (remaining.size > 0) {
    errors.push(`registry.json missing entries for: ${Array.from(remaining).join(', ')}`);
  }
}

function shouldTarget(relPath, scopePrefix) {
  if (!scopePrefix) return true;
  return relPath.startsWith(scopePrefix);
}

function main() {
  const configPath = path.resolve(repoRoot, process.argv[2] || 'ingest-quality-gates.yml');
  if (!fs.existsSync(configPath)) {
    console.error(`[gates] missing ${path.relative(repoRoot, configPath)}`);
    process.exit(1);
  }
  const config = parseConfig(configPath);
  const scopePrefix = config.scope_prefix || '';
  const metas = collectMetaFiles(path.join(repoRoot, 'methodologies'));
  const errors = [];
  const targetMetas = metas
    .map((absolute) => ({
      absolute,
      relative: path.relative(repoRoot, absolute).replace(/\\/g, '/'),
    }))
    .filter((entry) => shouldTarget(entry.relative, scopePrefix) && !entry.relative.includes('/previous/'));

  const activeMetaDirs = [];

  targetMetas.forEach(({ absolute, relative }) => {
    const meta = readJson(absolute, errors);
    if (!meta) return;
    const methodDir = path.dirname(absolute);
    const relDir = path.dirname(relative).replace(/\\/g, '/');
    activeMetaDirs.push(relDir);
    if (config.meta_complete || config.references_complete) {
      if (config.references_complete) {
        checkReferences(meta, relative, errors);
        checkProvenance(meta, relative, errors);
      }
      if (config.meta_complete) {
        checkAutomation(meta, relative, errors);
        checkAuditHashes(meta, relative, errors);
      }
    }
    if (config.sections_min_count || config.sections_no_todo) {
      checkSections(methodDir, relDir, config, errors);
    }
    if (config.rules_no_todo) {
      checkRules(methodDir, relDir, config, errors);
    }
  });

  if (config.registry_integrity) {
    checkRegistry(activeMetaDirs, errors);
  }

  if (errors.length > 0) {
    errors.forEach((err) => console.error(`[gates] ${err}`));
    process.exit(1);
  }
  console.log('[gates] all checks passed');
}

main();
