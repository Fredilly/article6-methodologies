#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const METHOD_DIR = path.join(ROOT, 'methodologies/Verra/AFOLU/VM0007/v1-8');
const GOV_FILE = path.join(ROOT, 'governance/Verra/AFOLU/VM0007/v1-8/dependencies.governance-v1.json');
const RULES_FILE = path.join(METHOD_DIR, 'rules.rich.json');
const SECTIONS_FILE = path.join(METHOD_DIR, 'sections.rich.json');

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function fail(msg) { console.error(`✖ ${msg}`); process.exitCode = 1; }

const gov = readJSON(GOV_FILE);
const rules = readJSON(RULES_FILE);
const sections = readJSON(SECTIONS_FILE);
const sectionById = new Map(sections.map(s => [s.id, s]));

if (gov.component !== 'Verra/VM0007@v1-8') fail('wrong governed component');
if (gov.status !== 'dependency_edge_provenance_complete') fail(`status must be dependency_edge_provenance_complete, got ${gov.status}`);
if (!Array.isArray(gov.edges) || gov.edges.length !== 20) fail(`expected 20 external edges, got ${gov.edges && gov.edges.length}`);
if (gov.unresolved_relationship_edges !== 0) fail('unresolved_relationship_edges must be zero');
if (Array.isArray(gov.promotion_blockers) && gov.promotion_blockers.length) fail(`promotion blockers remain: ${gov.promotion_blockers.join(', ')}`);

for (const edge of gov.edges || []) {
  if (edge.relationship !== 'INCORPORATED_BY_REFERENCE') fail(`${edge.canonical_ref}: relationship must be INCORPORATED_BY_REFERENCE`);
  if (edge.applicability !== 'CONDITIONAL_BY_SOURCE_RULE') fail(`${edge.canonical_ref}: applicability must be CONDITIONAL_BY_SOURCE_RULE`);
  if (edge.required_when_applicable !== true) fail(`${edge.canonical_ref}: required_when_applicable must be true`);
  if (!edge.legacy_ref || !edge.canonical_ref) fail('edge missing legacy_ref/canonical_ref');
  if (edge.canonical_ref === edge.legacy_ref) fail(`${edge.canonical_ref}: legacy alias was not normalized`);

  const matching = rules.filter(rule => {
    const tools = rule && rule.refs && Array.isArray(rule.refs.tools) ? rule.refs.tools : [];
    return tools.includes(edge.legacy_ref) || tools.includes(edge.canonical_ref);
  });

  if (!matching.length) {
    fail(`${edge.canonical_ref}: no source-audited VM0007 rule invokes this dependency`);
  } else {
    edge._derived_rule_ids = matching.map(r => r.id);
    for (const rule of matching) {
      if (rule.quality_status !== 'source_audited' || rule.source_span_status !== 'source_audited') {
        fail(`${edge.canonical_ref}: invoking rule ${rule.id} is not source_audited`);
      }
      if (!String(rule.source_span_text || '').trim()) fail(`${edge.canonical_ref}: invoking rule ${rule.id} lacks source_span_text`);
      if (!rule.refs || !String(rule.refs.section_number || '').trim()) fail(`${edge.canonical_ref}: invoking rule ${rule.id} lacks section_number`);
      const sid = rule.section_context && rule.section_context.section_id;
      const sec = sid && sectionById.get(sid);
      if (!sec) fail(`${edge.canonical_ref}: invoking rule ${rule.id} lacks resolvable section context`);
      if (!Number.isFinite(Number(rule.section_context && rule.section_context.page_start)) || !Number.isFinite(Number(rule.section_context && rule.section_context.page_end))) {
        fail(`${edge.canonical_ref}: invoking rule ${rule.id} lacks page range`);
      }
    }
  }

  const sourcePath = path.join(ROOT, edge.source_path || '');
  if (!edge.source_path || !fs.existsSync(sourcePath)) {
    fail(`${edge.canonical_ref}: governed dependency source path missing: ${edge.source_path || '(none)'}`);
  } else if (edge.source_pdf_sha256) {
    const actual = sha256(sourcePath);
    if (actual !== edge.source_pdf_sha256) fail(`${edge.canonical_ref}: source hash mismatch ${actual} != ${edge.source_pdf_sha256}`);
  } else if (edge.type !== 'METHODOLOGY') {
    fail(`${edge.canonical_ref}: non-methodology dependency lacks source_pdf_sha256`);
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
console.log(`✓ VM0007 dependency provenance complete: ${gov.edges.length} external edges + T-SIG internal procedure; exact dependency sources and source-audited VM0007 invoking-rule anchors validated`);
