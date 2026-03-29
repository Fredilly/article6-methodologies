#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const METHODOLOGIES_ROOT = path.join(ROOT, 'methodologies');
const TOOL_MODULE_RELATIONSHIP_METHODS = new Set([
  'UNFCCC.Forestry.AR-AMS0007.v03-1'
]);

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(sortKeysDeep(data), null, 2)}\n`, 'utf8');
}

function listMethodDirs(root) {
  const out = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const names = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
    if (names.has('META.json') && names.has('sections.rich.json') && names.has('rules.rich.json')) {
      out.push(dir);
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
    }
  })(root);
  return out.sort();
}

function sectionNumberFromId(sectionId) {
  const match = String(sectionId).match(/^S-(\d+(?:-\d+)*)$/);
  return match ? match[1].split('-').join('.') : null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function dedupeByKey(values, keyFn) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function sortLocators(locators) {
  return [...(locators || [])].sort((a, b) => {
    const pa = JSON.stringify(a.pages || []);
    const pb = JSON.stringify(b.pages || []);
    return JSON.stringify([a.type || '', pa, a.quote || '', a.hint || ''])
      .localeCompare(JSON.stringify([b.type || '', pb, b.quote || '', b.hint || '']));
  });
}

function summarizeToolLabel(toolId) {
  const normalized = String(toolId || '').split('/').pop() || String(toolId || '');
  return normalized.split('@')[0] || normalized;
}

function sortSourceRefs(sourceRefs) {
  return [...(sourceRefs || [])].sort((a, b) => {
    return JSON.stringify([
      a.rule_id || '',
      a.section_stable_id || '',
      a.section_id || '',
      a.section_anchor || '',
      a.page_start || 0,
      a.page_end || 0
    ]).localeCompare(JSON.stringify([
      b.rule_id || '',
      b.section_stable_id || '',
      b.section_id || '',
      b.section_anchor || '',
      b.page_start || 0,
      b.page_end || 0
    ]));
  });
}

function normalizeLocators(locators) {
  return sortLocators(dedupeByKey(
    (locators || [])
      .filter((locator) => locator && typeof locator === 'object' && locator.type && locator.quote)
      .map((locator) => {
        const next = {
          type: locator.type,
          quote: locator.quote
        };
        if (locator.hint) next.hint = locator.hint;
        if (Array.isArray(locator.pages) && locator.pages.length > 0) next.pages = [...new Set(locator.pages)].sort((a, b) => a - b);
        return next;
      }),
    (locator) => JSON.stringify(locator)
  ));
}

function collectPages(locators) {
  return [...new Set((locators || []).flatMap((locator) => Array.isArray(locator.pages) ? locator.pages : []))].sort((a, b) => a - b);
}

function pageBounds(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return {};
  return {
    page_start: pages[0],
    page_end: pages[pages.length - 1]
  };
}

function loadAnchors(methodDir) {
  const candidates = ['anchors.real.json', 'anchors.example.json']
    .map((name) => path.join(methodDir, name))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
  if (candidates.length === 0) return { rules: {}, sections: {} };
  const merged = { rules: {}, sections: {} };
  for (const filePath of candidates) {
    const data = readJSON(filePath);
    for (const kind of ['rules', 'sections']) {
      const source = data[kind] || {};
      for (const [id, locators] of Object.entries(source)) {
        merged[kind][id] = normalizeLocators([...(merged[kind][id] || []), ...(Array.isArray(locators) ? locators : [])]);
      }
    }
  }
  return merged;
}

function getMethodInfo(methodDir) {
  const rel = path.relative(METHODOLOGIES_ROOT, methodDir).split(path.sep);
  const [standard, domain, method, version] = rel;
  const methodologyId = `${standard}.${domain}.${method}.${version}`;
  const methodologyRef = `${standard}/${method}@${version}`;
  const familyKey = `${standard}/${domain}/${method}`;
  return { familyKey, methodologyId, methodologyRef, standard, domain, method, version };
}

function enrichMethod(methodDir) {
  const info = getMethodInfo(methodDir);
  const anchors = loadAnchors(methodDir);
  const sectionsPath = path.join(methodDir, 'sections.rich.json');
  const rulesPath = path.join(methodDir, 'rules.rich.json');
  const metaPath = path.join(methodDir, 'META.json');
  const sections = readJSON(sectionsPath);
  const rules = readJSON(rulesPath);
  const meta = readJSON(metaPath);

  const sectionMap = new Map();
  const enrichedSections = sections.map((section) => {
    const number = sectionNumberFromId(section.id);
    const anchor = section.anchor || slugify(section.title || section.id);
    const stableId = `${info.methodologyId}.${section.id}`;
    const locators = normalizeLocators([
      ...(((section.refs || {}).locators) || []),
      ...((anchors.sections || {})[section.id] || [])
    ]);
    const pages = collectPages(locators);
    const pageRange = pageBounds(pages);
    const lineage = Array.isArray(section.lineage) && section.lineage.length > 0 ? [...section.lineage] : undefined;
    const enriched = {
      ...section,
      anchor,
      locators,
      pages,
      ...pageRange,
      ...(lineage ? { lineage } : {}),
      section_number: number || undefined,
      stable_id: stableId
    };
    if (enriched.refs && Object.keys(enriched.refs).length === 0) delete enriched.refs;
    if (locators.length === 0) delete enriched.locators;
    if (pages.length === 0) delete enriched.pages;
    sectionMap.set(section.id, {
      anchor,
      lineage,
      pageEnd: pageRange.page_end,
      pageStart: pageRange.page_start,
      number,
      stableId,
      title: section.title
    });
    return enriched;
  });

  const enrichedRules = rules.map((rule) => {
    const primarySectionId = (((rule.refs || {}).sections) || [])[0] || null;
    const sectionInfo = primarySectionId ? sectionMap.get(primarySectionId) : null;
    const locators = normalizeLocators([
      ...(((rule.refs || {}).locators) || []),
      ...((anchors.rules || {})[rule.id] || [])
    ]);
    const pages = collectPages(locators);
    const display = {
      logic: typeof rule.logic === 'string' ? rule.logic : undefined,
      notes: typeof rule.notes === 'string' ? rule.notes : undefined,
      summary: rule.summary,
      title: rule.summary,
      when: Array.isArray(rule.when) ? rule.when : undefined
    };
    const refs = {
      ...(rule.refs || {}),
      methodology: info.methodologyRef,
      primary_section: primarySectionId || undefined,
      section_anchor: sectionInfo ? sectionInfo.anchor : undefined,
      section_number: sectionInfo ? sectionInfo.number : undefined,
      section_stable_id: sectionInfo ? sectionInfo.stableId : undefined
    };
    if (locators.length > 0) refs.locators = locators;
    if (pages.length > 0) refs.pages = pages;
    const stableId = `${info.methodologyId}.${rule.id.split('.').slice(-1)[0]}`;
    const sectionContext = sectionInfo
      ? {
        ...(rule.section_context || {}),
        section_id: primarySectionId,
        section_ref: primarySectionId,
        section_title: sectionInfo.title,
        ...(sectionInfo.anchor ? { anchor: sectionInfo.anchor } : {}),
        ...(sectionInfo.pageStart ? { page_start: sectionInfo.pageStart } : {}),
        ...(sectionInfo.pageEnd ? { page_end: sectionInfo.pageEnd } : {}),
        ...(sectionInfo.lineage ? { lineage: [...sectionInfo.lineage] } : {})
      }
      : rule.section_context;
    return {
      ...rule,
      display,
      refs,
      ...(sectionContext ? { section_context: sectionContext } : {}),
      stable_id: stableId
    };
  });

  writeJSON(sectionsPath, enrichedSections);
  writeJSON(rulesPath, enrichedRules);

  if (TOOL_MODULE_RELATIONSHIP_METHODS.has(info.methodologyId)) {
    const relationshipsByKey = new Map();
    const declaredToolIds = new Set((((meta.references || {}).tools) || []).map((tool) => tool.doc));
    for (const rule of enrichedRules) {
      const sectionStableId = rule.refs?.section_stable_id;
      const sectionId = rule.refs?.primary_section || rule.section_context?.section_id;
      const section = sectionId ? sectionMap.get(sectionId) : null;
      if (!sectionStableId || !section || !Array.isArray(rule.refs?.tools)) continue;
      const externalToolIds = rule.refs.tools.filter((toolId) => toolId !== info.methodologyRef && declaredToolIds.has(toolId));
      for (const toolId of externalToolIds) {
        const key = JSON.stringify([toolId, sectionStableId, 'uses_tool']);
        const entry = relationshipsByKey.get(key) || {
          tool_id: toolId,
          tool_label: summarizeToolLabel(toolId),
          module_id: sectionStableId,
          module_label: section.title,
          relationship: 'uses_tool',
          source_refs: []
        };
        const sourceRef = {
          rule_id: rule.stable_id || rule.id,
          section_id: sectionId,
          section_stable_id: sectionStableId,
          ...(section.anchor ? { section_anchor: section.anchor } : {}),
          ...(section.pageStart ? { page_start: section.pageStart } : {}),
          ...(section.pageEnd ? { page_end: section.pageEnd } : {})
        };
        entry.source_refs = dedupeByKey([...entry.source_refs, sourceRef], (value) => JSON.stringify(value));
        relationshipsByKey.set(key, entry);
      }
    }
    const toolModuleRelationships = [...relationshipsByKey.values()]
      .map((entry) => ({
        ...entry,
        source_refs: sortSourceRefs(entry.source_refs)
      }))
      .sort((a, b) => JSON.stringify([
        a.tool_id,
        a.module_id,
        a.relationship
      ]).localeCompare(JSON.stringify([
        b.tool_id,
        b.module_id,
        b.relationship
      ])));
    if (toolModuleRelationships.length > 0) meta.tool_module_relationships = toolModuleRelationships;
    else delete meta.tool_module_relationships;
  } else {
    delete meta.tool_module_relationships;
  }
  writeJSON(metaPath, meta);

  return info;
}

function compareVersions(a, b) {
  const tokenize = (value) => String(value)
    .replace(/^v/i, '')
    .split(/[^0-9A-Za-z]+/)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const A = tokenize(a);
  const B = tokenize(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i += 1) {
    const av = A[i];
    const bv = B[i];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (typeof av === 'number' && typeof bv === 'number' && av !== bv) return av - bv;
    const cmp = String(av).localeCompare(String(bv));
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function applyVersionRelationships(methodDirs) {
  const families = new Map();
  for (const methodDir of methodDirs) {
    const info = getMethodInfo(methodDir);
    const items = families.get(info.familyKey) || [];
    items.push({ methodDir, ...info });
    families.set(info.familyKey, items);
  }

  for (const items of families.values()) {
    items.sort((a, b) => compareVersions(a.version, b.version));
    const lineage = items.map((item) => item.version);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const metaPath = path.join(item.methodDir, 'META.json');
      const meta = readJSON(metaPath);
      meta.relationships = meta.relationships || {};
      meta.relationships.version = {
        family: item.familyKey.replace(/\//g, '.'),
        lineage,
        next_version: index < items.length - 1 ? items[index + 1].version : null,
        previous_version: index > 0 ? items[index - 1].version : null
      };
      writeJSON(metaPath, meta);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const methodDirs = (args.length > 0 ? args.map((value) => path.resolve(value)) : listMethodDirs(METHODOLOGIES_ROOT))
    .sort();
  for (const methodDir of methodDirs) enrichMethod(methodDir);
  if (args.length === 0) applyVersionRelationships(methodDirs);
  console.log(`OK: enriched ${methodDirs.length} methodology output folder(s).`);
}

if (require.main === module) main();
