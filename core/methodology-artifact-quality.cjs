const fs = require('fs');
const path = require('path');

const QUALITY_STANDARD_VERSION = 'review_contract_v1';

const QUALITY_LEAN_SECTION_KEY_ORDER = [
  'id',
  'stable_id',
  'title',
  'anchor',
  'section_number',
  'section_level',
  'parent_id',
  'page_start',
  'page_end',
  'locator_status'
];

const QUALITY_LEAN_RULE_KEY_ORDER = [
  'id',
  'stable_id',
  'title',
  'logic',
  'section_id',
  'section_stable_id',
  'section_number',
  'section_anchor',
  'tools',
  'tags',
  'quality_status',
  'when'
];

const QUALITY_REQUIRED_LEAN_SECTION_FIELDS = new Set(QUALITY_LEAN_SECTION_KEY_ORDER);
const QUALITY_REQUIRED_LEAN_RULE_FIELDS = new Set(QUALITY_LEAN_RULE_KEY_ORDER);
const QUALITY_REQUIRED_RICH_SECTION_FIELDS = new Set([
  'id',
  'stable_id',
  'title',
  'anchor',
  'section_number',
  'section_level',
  'parent_id',
  'page_start',
  'page_end',
  'locator_status',
  'provenance',
  'heading_text',
  'source_span_status',
  'children'
]);
const QUALITY_REQUIRED_RICH_RULE_FIELDS = new Set([
  'id',
  'stable_id',
  'summary',
  'logic',
  'type',
  'refs',
  'section_context',
  'rule_detail',
  'requirement_coverage',
  'source_span_status',
  'quality_status',
  'when'
]);

const metaVersionCache = new Map();

function readMethodMetaVersion(methodDir) {
  if (metaVersionCache.has(methodDir)) return metaVersionCache.get(methodDir);
  const metaPath = path.join(methodDir, 'META.json');
  let version = null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    version = meta?.artifact_quality_standard?.version || null;
  } catch {
    version = null;
  }
  metaVersionCache.set(methodDir, version);
  return version;
}

function usesArtifactQualityStandard(methodDir) {
  return readMethodMetaVersion(methodDir) === QUALITY_STANDARD_VERSION;
}

module.exports = {
  QUALITY_LEAN_RULE_KEY_ORDER,
  QUALITY_LEAN_SECTION_KEY_ORDER,
  QUALITY_REQUIRED_LEAN_RULE_FIELDS,
  QUALITY_REQUIRED_LEAN_SECTION_FIELDS,
  QUALITY_REQUIRED_RICH_RULE_FIELDS,
  QUALITY_REQUIRED_RICH_SECTION_FIELDS,
  QUALITY_STANDARD_VERSION,
  usesArtifactQualityStandard
};
