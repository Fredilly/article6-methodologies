const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const METHODOLOGIES_ROOT = fs.realpathSync.native
  ? fs.realpathSync.native(path.join(ROOT, 'methodologies'))
  : fs.realpathSync(path.join(ROOT, 'methodologies'));

const RULE_KEY_ORDER = [
  'id',
  'stable_id',
  'title',
  'logic',
  'section_anchor',
  'section_id',
  'section_number',
  'section_stable_id',
  'tools',
  'tags',
  'when'
];

const SECTION_KEY_ORDER = [
  'id',
  'title',
  'anchor',
  'section_number',
  'stable_id',
  'pages'
];

function realpathMaybe(inputPath) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(inputPath) : fs.realpathSync(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

function relativeMethodSegments(methodDir) {
  const rel = path.relative(METHODOLOGIES_ROOT, realpathMaybe(methodDir));
  const segments = rel.split(path.sep).filter(Boolean);
  if (segments.length >= 6 && segments[4] === 'previous') {
    return [...segments.slice(0, 3), segments[5]];
  }
  return segments;
}

function toRelativeMethodDir(methodDir) {
  return relativeMethodSegments(methodDir).join('/');
}

function getMethodInfo(methodDir) {
  const rel = relativeMethodSegments(methodDir);
  if (rel.length < 4) {
    throw new Error(`Bad methodology directory: ${methodDir}`);
  }
  const [provider, sector, methodology, version] = rel;
  return {
    methodDir,
    methodologyId: `${provider}.${sector}.${methodology}.${version}`,
    methodologyRef: `${provider}/${methodology}@${version}`,
    provider,
    relPath: `${provider}/${sector}/${methodology}/${version}`,
    sector,
    methodology,
    version
  };
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function sectionNumberFromId(id) {
  const match = String(id || '').match(/^S-(\d+(?:-\d+)*)$/);
  if (!match) return undefined;
  return match[1].replace(/-/g, '.');
}

function buildStableId(info, localId) {
  return `${info.methodologyId}.${localId}`;
}

function canonicalStableIdOrUndefined(value, expectedPrefix) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!expectedPrefix) return trimmed;
  return trimmed.startsWith(`${expectedPrefix}.`) ? trimmed : undefined;
}

function sanitizeStringArray(values, { sort = false } = {}) {
  if (!Array.isArray(values)) return undefined;
  const filtered = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  if (!filtered.length) return undefined;
  const unique = Array.from(new Set(filtered));
  return sort ? unique.sort((a, b) => a.localeCompare(b)) : unique;
}

function orderKeys(value, keyOrder) {
  const out = {};
  for (const key of keyOrder) {
    if (value[key] !== undefined) out[key] = value[key];
  }
  return out;
}

function canonicalizeLeanSection(section, info) {
  const canonical = {
    id: String(section.id),
    title: String(section.title),
    anchor: typeof section.anchor === 'string' && section.anchor.trim()
      ? section.anchor.trim()
      : slugify(section.title || section.id),
    section_number: typeof section.section_number === 'string' && section.section_number.trim()
      ? section.section_number.trim()
      : sectionNumberFromId(section.id),
    stable_id: canonicalStableIdOrUndefined(section.stable_id, info.methodologyId)
      || buildStableId(info, String(section.id)),
    pages: Array.isArray(section.pages) && section.pages.length ? section.pages.slice() : undefined
  };
  return orderKeys(canonical, SECTION_KEY_ORDER);
}

function localRuleIdFromLegacyRichId(ruleId) {
  const match = String(ruleId).match(/\.R-(\d+(?:-\d+)*)-(\d{4})$/);
  if (!match) throw new Error(`Bad legacy rich rule id: ${ruleId}`);
  return `R-${match[1]}-${match[2]}`;
}

function canonicalizeLeanRuleFromLegacyRich(rule, sectionLookup, info) {
  const localId = localRuleIdFromLegacyRichId(rule.id);
  const sectionId = rule.refs?.sections?.[0];
  if (!sectionId) throw new Error(`Legacy rich rule missing refs.sections[0]: ${rule.id}`);
  const section = sectionLookup.get(sectionId);
  if (!section) throw new Error(`Legacy rich rule references unknown section ${sectionId}: ${rule.id}`);
  const title = rule.display?.title ?? rule.title ?? rule.summary;
  const tags = sanitizeStringArray([rule.type, ...(rule.tags || [])], { sort: true });
  const tools = sanitizeStringArray(rule.refs?.tools, { sort: true }) || [info.methodologyRef];
  const canonical = {
    id: localId,
    stable_id: canonicalStableIdOrUndefined(rule.stable_id, info.methodologyId)
      || buildStableId(info, localId),
    title: typeof title === 'string' && title.trim()
      ? title.trim()
      : undefined,
    logic: typeof rule.logic === 'string' ? rule.logic : undefined,
    section_anchor: rule.refs?.section_anchor ?? section.anchor,
    section_id: sectionId,
    section_number: rule.refs?.section_number ?? section.section_number,
    section_stable_id: canonicalStableIdOrUndefined(rule.refs?.section_stable_id, info.methodologyId)
      || section.stable_id,
    tools,
    tags,
    when: sanitizeStringArray(rule.when)
  };
  return orderKeys(canonical, RULE_KEY_ORDER);
}

function canonicalizeLeanRuleFromLean(rule, sectionLookup, info) {
  const section = sectionLookup.get(rule.section_id);
  if (!section) throw new Error(`Lean rule references unknown section ${rule.section_id}: ${rule.id}`);
  const title = rule.title ?? rule.text;
  const tools = sanitizeStringArray(rule.tools, { sort: true }) || [info.methodologyRef];
  const canonical = {
    id: String(rule.id),
    stable_id: canonicalStableIdOrUndefined(rule.stable_id, info.methodologyId)
      || buildStableId(info, String(rule.id)),
    title: typeof title === 'string' && title.trim() ? title.trim() : undefined,
    logic: typeof rule.logic === 'string' ? rule.logic : undefined,
    section_anchor: typeof rule.section_anchor === 'string' && rule.section_anchor.trim()
      ? rule.section_anchor.trim()
      : section.anchor,
    section_id: String(rule.section_id),
    section_number: typeof rule.section_number === 'string' && rule.section_number.trim()
      ? rule.section_number.trim()
      : section.section_number,
    section_stable_id: canonicalStableIdOrUndefined(rule.section_stable_id, info.methodologyId)
      || section.stable_id,
    tools,
    tags: sanitizeStringArray(rule.tags, { sort: true }),
    when: sanitizeStringArray(rule.when)
  };
  return orderKeys(canonical, RULE_KEY_ORDER);
}

function listMethodDirs(rootDir, { includePrevious = false } = {}) {
  const out = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const hasRich = entries.some((entry) => entry.isFile() && entry.name === 'rules.rich.json')
      && entries.some((entry) => entry.isFile() && entry.name === 'sections.rich.json');
    const isPrevious = dir.split(path.sep).includes('previous');
    if (hasRich && (includePrevious || !isPrevious)) out.push(dir);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!includePrevious && entry.name === 'previous') continue;
      walk(path.join(dir, entry.name));
    }
  })(rootDir);
  return out.sort((a, b) => a.localeCompare(b));
}

function classifyRulesRichMode(rules) {
  const hasOverlayOnly = rules.some((rule) => {
    const keys = Object.keys(rule);
    return keys.every((key) => [
      'id',
      'stable_id',
      'when',
      'source_span_text',
      'section_context',
      'requirement_coverage',
      'rule_detail'
    ].includes(key));
  });
  if (hasOverlayOnly) return 'overlay_v1';
  return 'legacy_v1';
}

module.exports = {
  METHODOLOGIES_ROOT,
  RULE_KEY_ORDER,
  SECTION_KEY_ORDER,
  buildStableId,
  canonicalizeLeanRuleFromLean,
  canonicalizeLeanRuleFromLegacyRich,
  canonicalizeLeanSection,
  classifyRulesRichMode,
  getMethodInfo,
  listMethodDirs,
  localRuleIdFromLegacyRichId,
  sanitizeStringArray,
  canonicalStableIdOrUndefined,
  sectionNumberFromId,
  slugify,
  toRelativeMethodDir
};
