#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

let yaml;
try {
  // Prefer the top-level dependency, but fall back to ajv-cli's vendored copy if necessary.
  yaml = require('js-yaml');
} catch (err) {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    yaml = require('ajv-cli/node_modules/js-yaml');
  } catch (inner) {
    yaml = null;
  }
}

const repoRoot = path.resolve(__dirname, '..');
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'];

let ajvInstance;
function getAjv() {
  if (!ajvInstance) {
    ajvInstance = new Ajv({ allErrors: true, strict: false });
    addFormats(ajvInstance);
  }
  return ajvInstance;
}

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
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectMetaFiles(full));
    else if (entry.isFile() && entry.name === 'META.json') out.push(full);
  });
  return out;
}

function collectFilesByBasename(dir, filename) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesByBasename(full, filename));
    } else if (entry.isFile() && entry.name === filename) {
      results.push(full);
    }
  });
  return results;
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

function compileSchema(schemaPath) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  return getAjv().compile(schema);
}

function loadYamlOrJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (/\.(ya?ml)$/i.test(filePath)) {
    if (!yaml) throw new Error('yaml parser unavailable; install js-yaml');
    return yaml.load(raw);
  }
  return JSON.parse(raw);
}

function resolveRepoPath(refPath, baseDir) {
  if (!refPath) return '';
  if (path.isAbsolute(refPath)) return refPath;
  if (refPath.startsWith('./') || refPath.startsWith('../')) {
    return path.resolve(baseDir, refPath);
  }
  return path.resolve(repoRoot, refPath);
}

function collectToolMetaFiles() {
  return collectFilesByBasename(path.join(repoRoot, 'tools'), 'meta.json');
}

function ajvErrorText(validator) {
  return getAjv().errorsText(validator.errors, { separator: '; ' });
}

function ensureUniqueOperations(meta, relFile, errors) {
  const seen = new Set();
  meta.operations.forEach((op, idx) => {
    const key = op.openapi_operation_id;
    if (seen.has(key)) {
      errors.push(`${relFile}: duplicate openapi_operation_id "${key}" at operations[${idx}]`);
    } else {
      seen.add(key);
    }
  });
}

function collectOpenApiOperations(doc, openapiRel, errors) {
  const map = new Map();
  if (!doc.paths || typeof doc.paths !== 'object') {
    errors.push(`${openapiRel}: missing paths object`);
    return map;
  }
  Object.entries(doc.paths).forEach(([pathKey, value]) => {
    if (!value || typeof value !== 'object') return;
    HTTP_METHODS.forEach((method) => {
      const op = value[method];
      if (!op) return;
      if (!op.operationId) {
        errors.push(`${openapiRel}: ${method.toUpperCase()} ${pathKey} missing operationId`);
        return;
      }
      const key = op.operationId;
      if (map.has(key)) {
        const existing = map.get(key);
        errors.push(
          `${openapiRel}: duplicate operationId "${key}" for ${method.toUpperCase()} ${pathKey} (already used by ${existing.method.toUpperCase()} ${existing.path})`,
        );
        return;
      }
      map.set(key, { method: method.toUpperCase(), path: pathKey });
    });
  });
  return map;
}

function compareMetaAndOpenApi(meta, openapiOps, relMeta, openapiRel, errors) {
  meta.operations.forEach((op, idx) => {
    const expected = openapiOps.get(op.openapi_operation_id);
    if (!expected) {
      errors.push(
        `${relMeta}: operations[${idx}] references openapi_operation_id "${op.openapi_operation_id}" that does not exist in ${openapiRel}`,
      );
      return;
    }
    if (expected.method !== op.method) {
      errors.push(
        `${relMeta}: operations[${idx}] method ${op.method} disagrees with ${openapiRel} (${expected.method} ${expected.path})`,
      );
    }
    if (expected.path !== op.path) {
      errors.push(
        `${relMeta}: operations[${idx}] path ${op.path} disagrees with ${openapiRel} entry ${expected.path}`,
      );
    }
  });
  openapiOps.forEach((value, key) => {
    const exists = meta.operations.some((op) => op.openapi_operation_id === key);
    if (!exists) {
      errors.push(`${openapiRel}: operationId "${key}" missing in meta.json operations array`);
    }
  });
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

  const toolMetaEnabled = Boolean(config.tool_meta_checklist || config.tool_openapi_checklist);
  let validateToolMeta;
  let validateToolOpenApi;
  if (toolMetaEnabled) {
    const toolMetas = collectToolMetaFiles();
    if (toolMetas.length === 0) {
      console.log('[gates] tool checklist enabled but no tool meta.json files found; skipping');
    } else {
      if (config.tool_meta_checklist) {
        validateToolMeta = compileSchema(path.join(repoRoot, 'schemas', 'tool-meta.schema.json'));
      }
      if (config.tool_openapi_checklist) {
        validateToolOpenApi = compileSchema(path.join(repoRoot, 'schemas', 'tool-openapi.schema.json'));
      }
      toolMetas.forEach((absolute) => {
        const relMeta = path.relative(repoRoot, absolute).replace(/\\/g, '/');
        const meta = readJson(absolute, errors);
        if (!meta) return;
        if (config.tool_meta_checklist) {
          const valid = validateToolMeta(meta);
          if (!valid) {
            errors.push(`${relMeta}: ${ajvErrorText(validateToolMeta)}`);
            return;
          }
          ensureUniqueOperations(meta, relMeta, errors);
        }
        if (!config.tool_openapi_checklist) return;
        if (!meta.openapi || typeof meta.openapi.path !== 'string') {
          errors.push(`${relMeta}: openapi.path missing while openapi checklist is enabled`);
          return;
        }
        const openapiAbsolute = resolveRepoPath(meta.openapi.path, path.dirname(absolute));
        if (!fs.existsSync(openapiAbsolute)) {
          errors.push(`${relMeta}: openapi path ${meta.openapi.path} does not exist`);
          return;
        }
        let openapiDoc;
        try {
          openapiDoc = loadYamlOrJson(openapiAbsolute);
        } catch (err) {
          errors.push(`${path.relative(repoRoot, openapiAbsolute)}: failed to parse (${err.message})`);
          return;
        }
        if (validateToolOpenApi) {
          const valid = validateToolOpenApi(openapiDoc);
          if (!valid) {
            errors.push(
              `${path.relative(repoRoot, openapiAbsolute)}: ${ajvErrorText(validateToolOpenApi)}`,
            );
          }
        }
        const openapiRel = path.relative(repoRoot, openapiAbsolute).replace(/\\/g, '/');
        const openapiOps = collectOpenApiOperations(openapiDoc, openapiRel, errors);
        if (config.tool_meta_checklist) {
          compareMetaAndOpenApi(meta, openapiOps, relMeta, openapiRel, errors);
        }
      });
    }
  }

  if (errors.length > 0) {
    errors.forEach((err) => console.error(`[gates] ${err}`));
    process.exit(1);
  }
  console.log('[gates] all checks passed');
}

main();
