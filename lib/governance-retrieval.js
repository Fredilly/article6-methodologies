'use strict';

const fs = require('fs');
const path = require('path');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeVersion(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim().toLowerCase();
  if (/^v\d+(?:-\d+)+$/.test(raw)) return raw;
  if (/^v\d+(?:\.\d+)+$/.test(raw)) return raw.replace(/\./g, '-');
  if (/^\d+(?:\.\d+)+$/.test(raw)) return `v${raw.replace(/\./g, '-')}`;
  if (/^\d+(?:-\d+)+$/.test(raw)) return `v${raw}`;
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function registryVersion(value) {
  const normalized = normalizeVersion(value);
  return normalized ? normalized.slice(1).replace(/-/g, '.') : null;
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function createGovernanceRetriever(rootDir) {
  const ROOT = path.resolve(rootDir || path.join(__dirname, '..'));
  const registryPath = path.join(ROOT, 'registry.json');

  function registry() {
    const data = readJSON(registryPath);
    if (!Array.isArray(data)) throw new Error('registry.json must be an array');
    return data;
  }

  function resolveEntry(request) {
    const standard = request.standard ? String(request.standard) : null;
    const program = request.program ? String(request.program) : null;
    const code = request.code || request.methodology_id;
    if (!code) throw new Error('structured retrieval requires code or methodology_id');
    const wantedCode = String(code);
    const wantedVersion = request.version ? registryVersion(request.version) : null;
    let matches = registry().filter((entry) => {
      if (entry.code !== wantedCode) return false;
      if (standard && entry.standard !== standard) return false;
      if (program && entry.program !== program) return false;
      return true;
    });
    if (wantedVersion) matches = matches.filter((entry) => entry.version === wantedVersion);
    if (!matches.length) return null;
    if (!wantedVersion) {
      const latest = matches.filter((entry) => entry.latest === true);
      if (latest.length === 1) return latest[0];
      matches = matches.slice().sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }));
    }
    return matches[0];
  }

  function loadComponent(request) {
    const entry = resolveEntry(request);
    if (!entry) return null;
    const componentDir = path.join(ROOT, entry.path);
    const metaPath = path.join(componentDir, 'META.json');
    if (!exists(metaPath)) return null;
    const meta = readJSON(metaPath);
    return { entry, componentDir, meta };
  }

  function verification(meta) {
    const verified = Boolean(meta && meta.governance_v1 && meta.governance_v1.verified === true);
    return {
      verified,
      verification_status: verified ? 'verified' : 'not_verified',
      governance_state: meta && meta.governance_v1 ? meta.governance_v1.state || null : null,
      production_corpus: Boolean(meta && meta.governance_v1 && meta.governance_v1.production_corpus === true)
    };
  }

  function sourceInfo(component) {
    const source = (((component.meta || {}).provenance || {}).source_pdfs || [])[0] || null;
    if (!source) return null;
    const abs = path.join(ROOT, source.path || '');
    return {
      doc: source.doc || null,
      kind: source.kind || null,
      governed_path: source.path || null,
      sha256: source.sha256 || null,
      size: source.size || null,
      governed_pdf_present: Boolean(source.path && exists(abs))
    };
  }

  function identity(request) {
    const component = loadComponent(request);
    if (!component) return { found: false, answer: null, uncertainty: 'component_not_found' };
    const v = verification(component.meta);
    return {
      found: true,
      operation: 'identity',
      standard: component.entry.standard,
      program: component.entry.program,
      code: component.entry.code,
      version: normalizeVersion(component.entry.version),
      registry_version: component.entry.version,
      status: component.meta.stage || component.meta.status || null,
      effective_from: component.meta.effective_from || component.meta.active_date || null,
      title: component.meta.title || null,
      path: component.entry.path,
      latest: component.entry.latest === true,
      ...v,
      source: sourceInfo(component)
    };
  }

  function section(request) {
    const component = loadComponent(request);
    if (!component) return { found: false, answer: null, uncertainty: 'component_not_found' };
    const filePath = path.join(component.componentDir, 'sections.rich.json');
    const sections = readJSON(filePath);
    const sectionId = request.section_id ? String(request.section_id) : null;
    const sectionNumber = request.section_number ? String(request.section_number) : null;
    const found = sections.find((item) => (sectionId && item.id === sectionId) || (sectionNumber && item.section_number === sectionNumber));
    if (!found) return { found: false, answer: null, uncertainty: 'section_not_found', ...verification(component.meta) };
    return {
      found: true,
      operation: 'section',
      code: component.entry.code,
      version: normalizeVersion(component.entry.version),
      section: found,
      ...verification(component.meta)
    };
  }

  function rule(request) {
    const component = loadComponent(request);
    if (!component) return { found: false, answer: null, uncertainty: 'component_not_found' };
    const filePath = path.join(component.componentDir, 'rules.rich.json');
    const rules = readJSON(filePath);
    const ruleId = request.rule_id ? String(request.rule_id) : null;
    if (!ruleId) throw new Error('rule retrieval requires rule_id');
    const found = rules.find((item) => item.id === ruleId);
    if (!found) return { found: false, answer: null, uncertainty: 'rule_not_found', ...verification(component.meta) };
    return {
      found: true,
      operation: 'rule',
      code: component.entry.code,
      version: normalizeVersion(component.entry.version),
      rule: found,
      source: sourceInfo(component),
      ...verification(component.meta)
    };
  }

  function dependency(request) {
    const component = loadComponent(request);
    if (!component) return { found: false, answer: null, uncertainty: 'component_not_found' };
    const filePath = path.join(component.componentDir, 'dependencies.governance-v1.json');
    if (!exists(filePath)) return { found: false, answer: null, uncertainty: 'dependency_graph_not_available', ...verification(component.meta) };
    const graph = readJSON(filePath);
    const target = request.target ? String(request.target) : null;
    if (!target) throw new Error('dependency retrieval requires target');
    const dep = (graph.dependencies || []).find((item) => item.target === target || item.native_name === target);
    if (dep) {
      return {
        found: true,
        applies: true,
        operation: 'dependency',
        code: component.entry.code,
        version: normalizeVersion(component.entry.version),
        dependency: dep,
        ...verification(component.meta)
      };
    }
    const nonDep = (graph.explicit_non_dependencies || []).find((item) => item.target === target);
    if (nonDep) {
      return {
        found: true,
        applies: false,
        answer: 'no',
        operation: 'dependency',
        code: component.entry.code,
        version: normalizeVersion(component.entry.version),
        non_dependency: nonDep,
        ...verification(component.meta)
      };
    }
    return { found: false, answer: null, uncertainty: 'dependency_not_found', ...verification(component.meta) };
  }

  function source(request) {
    const component = loadComponent(request);
    if (!component) return { found: false, answer: null, uncertainty: 'component_not_found' };
    return {
      found: true,
      operation: 'source',
      code: component.entry.code,
      version: normalizeVersion(component.entry.version),
      source: sourceInfo(component),
      ...verification(component.meta)
    };
  }

  function versionDiff(request) {
    const component = loadComponent(request);
    if (!component) return { found: false, answer: null, uncertainty: 'component_not_found' };
    const fromVersion = normalizeVersion(request.from_version || 'v1-0');
    const fileName = `version-diff-from-${fromVersion}.json`;
    const filePath = path.join(component.componentDir, fileName);
    if (!exists(filePath)) return { found: false, answer: null, uncertainty: 'version_diff_not_found', ...verification(component.meta) };
    const diff = readJSON(filePath);
    return {
      found: true,
      operation: 'version_diff',
      code: component.entry.code,
      version: normalizeVersion(component.entry.version),
      diff_file: fileName,
      diff,
      ...verification(component.meta)
    };
  }

  function rules(request) {
    const component = loadComponent(request);
    if (!component) return { found: false, answer: null, uncertainty: 'component_not_found' };
    const v = verification(component.meta);
    if (request.require_verified === true && !v.verified) {
      return {
        found: true,
        answer: null,
        operation: 'rules',
        code: component.entry.code,
        version: normalizeVersion(component.entry.version),
        verification_status: 'not_verified',
        uncertainty: 'explicit',
        production_rules_returned: false,
        governance_state: v.governance_state,
        production_corpus: v.production_corpus
      };
    }
    const rulesLean = readJSON(path.join(component.componentDir, 'rules.json'));
    return {
      found: true,
      operation: 'rules',
      code: component.entry.code,
      version: normalizeVersion(component.entry.version),
      rules: Array.isArray(rulesLean.rules) ? rulesLean.rules : [],
      production_rules_returned: true,
      ...v
    };
  }

  function query(request) {
    if (!request || typeof request !== 'object') throw new Error('structured retrieval requires an object request');
    const operation = String(request.operation || '').trim();
    if (!operation) throw new Error('structured retrieval requires operation');
    if (operation === 'identity' || operation === 'version') return identity(request);
    if (operation === 'section') return section(request);
    if (operation === 'rule') return rule(request);
    if (operation === 'dependency') return dependency(request);
    if (operation === 'source') return source(request);
    if (operation === 'version_diff') return versionDiff(request);
    if (operation === 'rules') return rules(request);
    throw new Error(`unsupported governance operation: ${operation}`);
  }

  return { query, identity, section, rule, dependency, source, versionDiff, rules, normalizeVersion };
}

module.exports = { createGovernanceRetriever, normalizeVersion };
