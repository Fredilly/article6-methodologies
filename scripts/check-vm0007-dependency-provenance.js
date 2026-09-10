#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const METHOD_DIR = path.join(ROOT, 'methodologies/Verra/AFOLU/VM0007/v1-8');
const GOV_FILE = path.join(ROOT, 'governance/Verra/AFOLU/VM0007/v1-8/dependencies.governance-v1.json');
const ROADMAP_FILE = path.join(ROOT, 'docs/roadmaps/verra-forestry-s-grade/dependency-resolution-maps/VM0007-v1-8.governance-v1.json');
const RULES_FILE = path.join(METHOD_DIR, 'rules.rich.json');
const SECTIONS_FILE = path.join(METHOD_DIR, 'sections.rich.json');

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function fail(msg) { console.error(`✖ ${msg}`); process.exitCode = 1; }

const gov = readJSON(GOV_FILE);
const roadmap = readJSON(ROADMAP_FILE);
const rules = readJSON(RULES_FILE);
const sections = readJSON(SECTIONS_FILE);
const ruleById = new Map(rules.map(r => [r.id, r]));
const sectionById = new Map(sections.map(s => [s.id, s]));

if (gov.component !== 'Verra/VM0007@v1-8') fail('wrong governed component');
if (gov.status !== 'dependency_edge_provenance_complete') fail(`status must be dependency_edge_provenance_complete, got ${gov.status}`);
if (!Array.isArray(gov.edges) || gov.edges.length !== 20) fail(`expected 20 external/reference edges, got ${gov.edges && gov.edges.length}`);
if (gov.unresolved_relationship_edges !== 0) fail('unresolved_relationship_edges must be zero');
if (gov.unresolved_source_version_pins !== 0) fail('unresolved_source_version_pins must be zero: use explicit unversioned source semantics rather than an invented pin');
if (Array.isArray(gov.promotion_blockers) && gov.promotion_blockers.length) fail(`promotion blockers remain: ${gov.promotion_blockers.join(', ')}`);
if (roadmap.migration_status !== 'DEPENDENCY_EDGE_PROVENANCE_COMPLETE') fail('VM0007 governance migration roadmap is not closed');
if (roadmap.authoritative_governance_artifact !== 'governance/Verra/AFOLU/VM0007/v1-8/dependencies.governance-v1.json') fail('VM0007 roadmap does not point to authoritative governed dependency artifact');

function validateEvidenceRule(edge, rule) {
  const label = edge.source_reference_label;
  if (!rule) return fail(`${edge.component_ref}: declared evidence rule missing`);
  if (rule.quality_status !== 'source_audited' || rule.source_span_status !== 'source_audited') {
    fail(`${edge.component_ref}: invoking rule ${rule.id} is not source_audited`);
  }
  if (!String(rule.source_span_text || '').trim()) fail(`${edge.component_ref}: invoking rule ${rule.id} lacks source_span_text`);
  if (!rule.refs || !String(rule.refs.section_number || '').trim()) fail(`${edge.component_ref}: invoking rule ${rule.id} lacks section_number`);
  const sid = rule.section_context && rule.section_context.section_id;
  const sec = sid && sectionById.get(sid);
  if (!sec) fail(`${edge.component_ref}: invoking rule ${rule.id} lacks resolvable section context`);
  if (!Number.isFinite(Number(rule.section_context && rule.section_context.page_start)) || !Number.isFinite(Number(rule.section_context && rule.section_context.page_end))) {
    fail(`${edge.component_ref}: invoking rule ${rule.id} lacks page range`);
  }
  if (label && !String(rule.source_span_text || '').includes(label)) {
    fail(`${edge.component_ref}: evidence rule ${rule.id} source span does not contain source reference label ${label}`);
  }
}

for (const edge of gov.edges || []) {
  if (!edge.legacy_ref || !edge.component_ref || !edge.governed_support_ref) fail('edge missing legacy_ref/component_ref/governed_support_ref');
  if (!/^UNVERSIONED_/.test(String(edge.source_version_semantics || ''))) {
    fail(`${edge.component_ref}: source_version_semantics must explicitly record an unversioned VM0007 reference`);
  }

  if (edge.relationship === 'INCORPORATED_BY_REFERENCE') {
    if (edge.applicability !== 'CONDITIONAL_BY_SOURCE_RULE' || edge.required_when_applicable !== true) {
      fail(`${edge.component_ref}: incorporated dependency must be conditionally required by its source rule`);
    }
  } else if (edge.relationship === 'INFORMATIVE') {
    if (edge.applicability !== 'EXAMPLE_ONLY' || edge.required_when_applicable !== false) {
      fail(`${edge.component_ref}: informative example must not be marked required`);
    }
  } else {
    fail(`${edge.component_ref}: unsupported relationship ${edge.relationship}`);
  }

  let matching = [];
  if (Array.isArray(edge.source_rule_ids) && edge.source_rule_ids.length) {
    matching = edge.source_rule_ids.map(id => ruleById.get(id));
  } else {
    matching = rules.filter(rule => {
      const tools = rule && rule.refs && Array.isArray(rule.refs.tools) ? rule.refs.tools : [];
      return tools.includes(edge.legacy_ref) || tools.includes(edge.governed_support_ref);
    });
  }
  if (!matching.length) fail(`${edge.component_ref}: no source-audited VM0007 rule evidence found`);
  matching.forEach(rule => validateEvidenceRule(edge, rule));

  const sourcePath = path.join(ROOT, edge.source_path || '');
  if (!edge.source_path || !fs.existsSync(sourcePath)) {
    fail(`${edge.governed_support_ref}: governed support source path missing: ${edge.source_path || '(none)'}`);
  } else if (edge.source_pdf_sha256) {
    const actual = sha256(sourcePath);
    if (actual !== edge.source_pdf_sha256) fail(`${edge.governed_support_ref}: support source hash mismatch ${actual} != ${edge.source_pdf_sha256}`);
  } else if (edge.type !== 'METHODOLOGY') {
    fail(`${edge.governed_support_ref}: non-methodology support artifact lacks source_pdf_sha256`);
  }
}

const embedded = Array.isArray(gov.embedded_references) ? gov.embedded_references : [];
const tsig = embedded.find(e => e.id === 'T-SIG');
if (!tsig || tsig.component_dependency !== false || tsig.resolution !== 'Verra/VM0007@v1-8#Appendix-1') {
  fail('T-SIG must resolve to the internal VM0007 Appendix 1 procedure');
}
const tsigRules = rules.filter(r => /T-SIG|significance procedure/i.test(`${r.logic || ''} ${r.summary || ''}`));
if (!tsigRules.length) fail('T-SIG internal resolution has no source-audited VM0007 rule evidence');
for (const rule of tsigRules) {
  if (rule.quality_status !== 'source_audited' || !String(rule.source_span_text || '').trim()) fail(`T-SIG evidence rule ${rule.id} is not source-audited`);
}

if (process.exitCode) process.exit(process.exitCode);
const incorporated = gov.edges.filter(e => e.relationship === 'INCORPORATED_BY_REFERENCE').length;
const informative = gov.edges.filter(e => e.relationship === 'INFORMATIVE').length;
console.log(`✓ VM0007 dependency provenance complete: ${incorporated} incorporated-by-reference edges, ${informative} informative example, T-SIG internal procedure; source-audited anchors and support hashes validated without inventing version pins`);
