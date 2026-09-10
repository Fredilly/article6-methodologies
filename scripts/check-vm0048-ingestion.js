#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const METHOD = path.join(ROOT, 'methodologies/Verra/AFOLU/VM0048/v1-0');
const GOV = path.join(ROOT, 'governance/Verra/AFOLU/VM0048/v1-0');
const STAGING = path.join(ROOT, 'docs/roadmaps/governance-v1/staging/VM0048/v1-0/source');
const PRIMARY_HASH = 'd65f26b65946120688e5b41d7e97d116f6959fdd9d7a77f7643f5339a142b982';
const CLARIFICATION_HASH = 'd55fa78dddf7de254135d54e8e3da51f7c73cc73b54b6cabddee320326d11774';

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function fail(message) { console.error(`✖ ${message}`); process.exitCode = 1; }
function assert(condition, message) { if (!condition) fail(message); }

const meta = readJSON(path.join(METHOD, 'META.json'));
const sections = readJSON(path.join(METHOD, 'sections.rich.json'));
const rules = readJSON(path.join(METHOD, 'rules.rich.json'));
const deps = readJSON(path.join(GOV, 'dependencies.governance-v1.json'));
const clarification = readJSON(path.join(GOV, 'clarifications.governance-v1.json'));

assert(meta.component_type === 'FRAMEWORK_METHODOLOGY', 'VM0048 must be FRAMEWORK_METHODOLOGY');
assert(meta.governance_v1 && meta.governance_v1.state === 'RULES_COMPLETE', 'VM0048 ingestion must stop at RULES_COMPLETE');
assert(meta.governance_v1 && meta.governance_v1.verified === false, 'VM0048 must not be verified in ingestion PR');
assert(meta.governance_v1 && meta.governance_v1.production_corpus === false, 'VM0048 must not be production corpus in ingestion PR');
const blockers = new Set((meta.governance_v1 && meta.governance_v1.blockers) || []);
assert(blockers.has('final_provenance_audit'), 'final_provenance_audit blocker must remain');
assert(blockers.has('production_retrieval_test'), 'production_retrieval_test blocker must remain');

const primaryPdf = path.join(ROOT, 'tools/Verra/VM0048/v1-0/source.pdf');
const clarificationPdf = path.join(ROOT, 'tools/Verra/VM0048/v1-0/clarification-2024-07-31.pdf');
assert(fs.existsSync(primaryPdf), 'primary governed PDF missing');
assert(fs.existsSync(clarificationPdf), 'clarification governed PDF missing');
if (fs.existsSync(primaryPdf)) assert(sha256(primaryPdf) === PRIMARY_HASH, 'primary governed PDF SHA-256 mismatch');
if (fs.existsSync(clarificationPdf)) assert(sha256(clarificationPdf) === CLARIFICATION_HASH, 'clarification governed PDF SHA-256 mismatch');
assert(meta.audit_hashes && meta.audit_hashes.source_pdf_sha256 === PRIMARY_HASH, 'META primary PDF hash mismatch');
assert(meta.audit_hashes && meta.audit_hashes.clarification_2024_07_31_sha256 === CLARIFICATION_HASH, 'META clarification hash mismatch');

assert(Array.isArray(sections) && sections.length === 31, `expected 31 rich sections, got ${sections && sections.length}`);
assert(Array.isArray(rules) && rules.length === 132, `expected 132 rich rules, got ${rules && rules.length}`);

const allowedSources = new Map([
  [PRIMARY_HASH, path.join(STAGING, 'source.layout.txt')],
  [CLARIFICATION_HASH, path.join(STAGING, 'clarification.layout.txt')]
]);
const sourceLines = new Map();
for (const [hash, file] of allowedSources) {
  assert(fs.existsSync(file), `governed text missing for ${hash}`);
  if (fs.existsSync(file)) sourceLines.set(hash, fs.readFileSync(file, 'utf8').split(/\r?\n/));
}

const lineRefPattern = /^(docs\/roadmaps\/governance-v1\/staging\/VM0048\/v1-0\/source\/(source|clarification)\.layout\.txt)#L(\d+)-L(\d+)$/;
for (const rule of rules || []) {
  const id = rule.id || '(missing id)';
  const hash = rule.provenance && rule.provenance.source_hash;
  assert(allowedSources.has(hash), `${id}: unknown provenance source hash`);
  assert(String(rule.source_span_text || '').trim().length > 0, `${id}: missing source_span_text`);
  assert(rule.refs && Array.isArray(rule.refs.lines) && rule.refs.lines.length > 0, `${id}: missing refs.lines`);
  assert(rule.refs && Array.isArray(rule.refs.locators) && rule.refs.locators.length > 0, `${id}: missing refs.locators`);
  if (!allowedSources.has(hash) || !rule.refs || !Array.isArray(rule.refs.lines) || !rule.refs.lines.length) continue;

  const match = String(rule.refs.lines[0]).match(lineRefPattern);
  assert(Boolean(match), `${id}: malformed governed-text line reference`);
  if (!match) continue;
  const expectedKind = hash === CLARIFICATION_HASH ? 'clarification' : 'source';
  assert(match[2] === expectedKind, `${id}: source hash and governed-text file disagree`);
  const start = Number(match[3]);
  const end = Number(match[4]);
  assert(Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start, `${id}: invalid governed-text line range`);
  const lines = sourceLines.get(hash) || [];
  const exact = lines.slice(start - 1, end).join('\n').trim();
  assert(exact === String(rule.source_span_text || '').trim(), `${id}: source_span_text does not exactly resolve to governed text ${start}-${end}`);
}

const forestRule = (rules || []).find(r => r.summary === 'Clarified minimum forest canopy cover');
assert(Boolean(forestRule), 'effective forest-definition clarification rule missing');
if (forestRule) {
  assert(forestRule.provenance && forestRule.provenance.source_hash === CLARIFICATION_HASH, 'forest clarification rule must cite clarification PDF');
  assert(/at least 10 percent/i.test(forestRule.source_span_text || ''), 'forest clarification rule must resolve to “at least 10 percent” source text');
  assert(forestRule.refs && forestRule.refs.section_number === '3.1', 'forest clarification rule must attach to §3.1');
}
assert(clarification.classification === 'RULE_UPDATE', 'clarification must be classified RULE_UPDATE');
assert(clarification.status === 'EFFECTIVE', 'clarification must be EFFECTIVE');
assert(clarification.issued === '2024-07-31', 'clarification issue date mismatch');
assert(clarification.source_pdf_sha256 === CLARIFICATION_HASH, 'clarification governance hash mismatch');
assert(clarification.supersedes_source_text_for_interpretation === true, 'clarification precedence must supersede original §3.1 text for interpretation');
assert(clarification.normalized_effect && clarification.normalized_effect.forest_minimum_canopy_cover_percent === 10, 'clarification normalized 10% threshold missing');

assert(deps.component === 'Verra/VM0048@v1-0', 'dependency graph component mismatch');
assert(deps.policy && deps.policy.silent_version_substitution === false, 'dependency graph must prohibit silent version substitution');
assert(deps.policy && deps.policy.source_stated_version_policy_is_authoritative === true, 'source-stated version policy must be authoritative');
assert(deps.unresolved_source_semantics === 0, 'dependency graph has unresolved source semantics');
const edges = Array.isArray(deps.runtime_edges) ? deps.runtime_edges : [];
assert(edges.length === 13, `expected 13 runtime dependency edges, got ${edges.length}`);
for (const edge of edges) {
  assert(edge.version === null, `${edge.component}: source does not pin a concrete runtime version`);
  assert(edge.version_policy === 'MOST_RECENT_AT_APPLICATION', `${edge.component}: runtime dependency must preserve MOST_RECENT_AT_APPLICATION`);
  assert(String(edge.source_evidence || '').trim().length > 0, `${edge.component}: missing source_evidence`);
}
function edge(component) { return edges.find(e => e.component === component); }
assert(edge('Verra/VMD0055') && edge('Verra/VMD0055').applicability === 'MANDATORY_UDEF', 'VMD0055 AUDef edge semantics incorrect');
assert(edge('Verra/VT0001') && edge('Verra/VT0001').applicability === 'MANDATORY', 'VT0001 edge semantics incorrect');
assert(edge('UNFCCC/E-NA') && edge('UNFCCC/E-NA').applicability === 'MANDATORY_WHEN_LEAKAGE_PREVENTION_INCREASES_FERTILIZER', 'E-NA conditional semantics incorrect');
assert(edge('Verra/VMD0002') && edge('Verra/VMD0002').applicability === 'MANDATORY_IF_BASELINE_POOL_GREATER_AND_SIGNIFICANT', 'VMD0002 conditional semantics incorrect');
assert(edge('Verra/VMD0005') && edge('Verra/VMD0005').applicability === 'MANDATORY_WHEN_COMMERCIAL_TIMBER_FUELWOOD_OR_CHARCOAL', 'VMD0005 conditional semantics incorrect');
assert(edge('Verra/VMD0011') && edge('Verra/VMD0011').applicability === 'MANDATORY_WHEN_PROJECT_DECREASES_TIMBER_FUELWOOD_OR_CHARCOAL_PRODUCTION', 'VMD0011 conditional semantics incorrect');
assert(edge('Verra/VMD0013') && edge('Verra/VMD0013').applicability === 'MANDATORY_UDEF', 'VMD0013 edge semantics incorrect');
assert(edge('Verra/VMD0016') && edge('Verra/VMD0016').applicability === 'MANDATORY_UDEF', 'VMD0016 edge semantics incorrect');
const future = Array.isArray(deps.future_activity_modules) ? deps.future_activity_modules : [];
for (const activity of ['PDef', 'UDeg']) {
  const item = future.find(x => x.activity === activity);
  assert(item && item.status === 'UNDER_DEVELOPMENT_IN_V1_0_SOURCE', `${activity}: under-development source status missing`);
}

// META must make every retained runtime/governance artifact tamper-evident.
for (const entry of meta.files || []) {
  const absolute = entry.path.startsWith('governance/') ? path.join(ROOT, entry.path) : path.join(METHOD, entry.path);
  assert(fs.existsSync(absolute), `META files entry missing on disk: ${entry.path}`);
  if (fs.existsSync(absolute)) assert(sha256(absolute) === entry.sha256, `META files hash mismatch: ${entry.path}`);
}
const requiredMetaFiles = [
  'sections.json','sections.rich.json','rules.json','rules.rich.json',
  'governance/Verra/AFOLU/VM0048/v1-0/dependencies.governance-v1.json',
  'governance/Verra/AFOLU/VM0048/v1-0/clarifications.governance-v1.json',
  'governance/Verra/AFOLU/VM0048/v1-0/equations.governance-v1.json',
  'governance/Verra/AFOLU/VM0048/v1-0/parameters.governance-v1.json',
  'governance/Verra/AFOLU/VM0048/v1-0/rules.governance-v1.index.json'
];
const metaFilePaths = new Set((meta.files || []).map(x => x.path));
for (const p of requiredMetaFiles) assert(metaFilePaths.has(p), `META files ledger missing ${p}`);

if (process.exitCode) process.exit(process.exitCode);
console.log(`✓ VM0048 ingestion contract passed: ${sections.length} sections, ${rules.length} exact governed-text rule spans, 2 governed source PDFs, effective clarification precedence, ${edges.length} dynamic runtime dependency edges, RULES_COMPLETE/non-production state`);
