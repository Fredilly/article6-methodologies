#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'agriculture-canonical.json');
if (!fs.existsSync(TEMPLATE_PATH)) {
  throw new Error(`[reshape-agriculture] missing template at ${TEMPLATE_PATH}`);
}
const TEMPLATE = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

const DEFAULT_METHODS = [
  'UNFCCC/Agriculture/AM0073/v01-0',
  'UNFCCC/Agriculture/ACM0010/v03-0',
  'UNFCCC/Agriculture/AMS-III.D/v21-0',
  'UNFCCC/Agriculture/AMS-III.R/v05-0'
];
const REQUIREMENT_COVERAGE_METHODS = new Set([
  'UNFCCC/Agriculture/AM0073/v01-0',
]);
const RICHER_RULE_DETAIL_METHODS = new Set([
  'UNFCCC/Agriculture/AM0073/v01-0',
]);
const EXPECTED_EVIDENCE_METHODS = new Set([
  'UNFCCC/Agriculture/AM0073/v01-0',
]);
const EXPECTED_EVIDENCE_BY_RULE_ID = {
  'UNFCCC.Agriculture.AM0073.v01-0.R-2-0002': [
    {
      description: 'IRR or NPV calculations and supporting cost assumptions used to identify the baseline alternative.',
      id: 'financial-model',
      label: 'Financial model',
      required: true,
    },
    {
      description: 'Barrier analysis records or supporting statements used to justify exclusion of higher-emitting alternatives.',
      id: 'barrier-analysis',
      label: 'Barrier analysis',
      required: true,
    },
  ],
  'UNFCCC.Agriculture.AM0073.v01-0.R-3-0002': [
    {
      description: 'Signed declarations or waivers showing that participating farms do not claim CERs for the transferred manure.',
      id: 'cer-transfer-declarations',
      label: 'CER transfer declarations',
      required: true,
    },
    {
      description: 'Board minutes or participation records substantiating the central entity claim structure.',
      id: 'governance-records',
      label: 'Governance records',
      required: true,
    },
  ],
  'UNFCCC.Agriculture.AM0073.v01-0.R-5-0003': [
    {
      description: 'Monitored manure quantities, volatile solids content, and related farm-level data used in emission reduction calculations.',
      id: 'activity-data',
      label: 'Activity data',
      required: true,
    },
    {
      description: 'Electricity and thermal consumption records supporting project emission calculations.',
      id: 'energy-metering',
      label: 'Energy metering',
      required: true,
    },
  ],
  'UNFCCC.Agriculture.AM0073.v01-0.R-7-0005': [
    {
      description: 'Recorded biogas flow, methane fraction, dispatch, and electricity measurements aggregated into the required monitoring records.',
      id: 'monitoring-records',
      label: 'Monitoring records',
      required: true,
    },
    {
      description: 'Calibration and QA/QC records for flow meters, gas analyzers, and electricity meters used in monitoring.',
      id: 'calibration-certificates',
      label: 'Calibration certificates',
      required: true,
    },
  ],
  'UNFCCC.Agriculture.AM0073.v01-0.R-8-0005': [
    {
      description: 'Inspection records for high-emitting farms and associated corrective-action documentation retained for DOE review.',
      id: 'site-inspection-records',
      label: 'Site inspection records',
      required: true,
    },
    {
      description: 'Annual reconciliation records comparing methane generated and consumed at the plant, including discrepancy investigations.',
      id: 'methane-balance-reconciliation',
      label: 'Methane balance reconciliation',
      required: true,
    },
  ],
};

function relToDir(rel) {
  return path.join(ROOT, 'methodologies', ...rel.split('/'));
}

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJSON(p, data) {
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  if (fs.existsSync(p)) {
    const current = fs.readFileSync(p, 'utf8');
    if (current === payload) return;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, payload, 'utf8');
}

function methodFragments(dir) {
  const parts = dir.split(path.sep);
  const version = parts[parts.length - 1];
  const code = parts[parts.length - 2];
  const sector = parts[parts.length - 3];
  const program = parts[parts.length - 4];
  return { program, sector, code, version };
}

function methodRel(dir) {
  return path.relative(path.join(ROOT, 'methodologies'), dir).replace(/\\/g, '/');
}

function methodDoc(dir) {
  const { program, code, version } = methodFragments(dir);
  return `${program}/${code}@${version}`;
}

function methodKey(dir) {
  const { program, sector, code, version } = methodFragments(dir);
  const safeCode = code.replace(/\./g, '-');
  return `${program}.${sector}.${safeCode}.${version}`;
}

function buildRuleId(dir, index, section) {
  const sectionNum = String(section).replace(/^S-/, '') || '1';
  return `${methodKey(dir)}.R-${index + 1}-${sectionNum.padStart(4, '0')}`;
}

function buildExpectedEvidence(ruleId) {
  const entries = EXPECTED_EVIDENCE_BY_RULE_ID[ruleId];
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  return entries.map((entry) => ({ ...entry }));
}

function buildRequirementCoverage(ruleId, sectionIds, expectedEvidence) {
  const refs = (sectionIds || [])
    .filter((sectionId) => typeof sectionId === 'string' && /^S-\d+(?:-\d+)*$/.test(sectionId))
    .map((sectionId) => ({
      relationship: 'source_section',
      section_id: sectionId,
    }));
  if (refs.length === 0) return undefined;
  return {
    coverage_key: ruleId,
    coverage_scope: 'rule',
    ...(expectedEvidence ? { expected_evidence: expectedEvidence } : {}),
    section_refs: refs,
  };
}

function buildSectionContext(section) {
  if (!section || typeof section.id !== 'string' || typeof section.title !== 'string') {
    return undefined;
  }
  return {
    section_id: section.id,
    section_ref: section.id,
    section_title: section.title,
  };
}

function buildRuleDetail(rule) {
  const detail = {};
  if (Array.isArray(rule.when) && rule.when.length > 0) {
    detail.conditions = rule.when;
  }
  if (typeof rule.summary === 'string' && rule.summary.length > 0) {
    detail.summary = rule.summary;
  }
  return Object.keys(detail).length > 0 ? detail : undefined;
}

function deriveLean(dir) {
  const script = path.join(ROOT, 'scripts', 'derive-lean-from-rich.js');
  const res = spawnSync('node', [script, dir], { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`[reshape-agriculture] derive-lean failed for ${dir}`);
  }
}

function reshape(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`[reshape-agriculture] skip missing ${dir}`);
    return;
  }
  const metaPath = path.join(dir, 'META.json');
  if (!fs.existsSync(metaPath)) {
    console.warn(`[reshape-agriculture] skip ${dir} (missing META.json)`);
    return;
  }
  const includeRequirementCoverage = REQUIREMENT_COVERAGE_METHODS.has(methodRel(dir));
  const includeRicherRuleDetail = RICHER_RULE_DETAIL_METHODS.has(methodRel(dir));
  const includeExpectedEvidence = EXPECTED_EVIDENCE_METHODS.has(methodRel(dir));
  const meta = loadJSON(metaPath);
  const docId = (meta.provenance && meta.provenance.source_pdfs && meta.provenance.source_pdfs[0]?.doc) || methodDoc(dir);
  const sourceHash = (meta.provenance && meta.provenance.source_pdfs && meta.provenance.source_pdfs[0]?.sha256) || meta.audit_hashes?.source_pdf_sha256;
  if (!sourceHash) {
    throw new Error(`[reshape-agriculture] missing source hash for ${dir}`);
  }

  const sectionsLean = TEMPLATE.sections.map((section) => ({ ...section }));
  writeJSON(path.join(dir, 'sections.json'), { sections: sectionsLean });

  const sectionsRich = TEMPLATE.sections.map((section) => ({
    id: section.id,
    provenance: {
      source_hash: sourceHash,
      source_ref: docId,
    },
    title: section.title,
  }));
  writeJSON(path.join(dir, 'sections.rich.json'), sectionsRich);
  const sectionIndex = new Map(sectionsRich.map((section) => [section.id, section]));

  const rulesRich = TEMPLATE.rules.map((rule, idx) => {
    const ruleId = buildRuleId(dir, idx, rule.section);
    const expectedEvidence = includeExpectedEvidence
      ? buildExpectedEvidence(ruleId)
      : undefined;
    const requirementCoverage = includeRequirementCoverage
      ? buildRequirementCoverage(ruleId, [rule.section], expectedEvidence)
      : undefined;
    const sectionContext = includeRicherRuleDetail
      ? buildSectionContext(sectionIndex.get(rule.section))
      : undefined;
    const ruleDetail = includeRicherRuleDetail
      ? buildRuleDetail(rule)
      : undefined;
    return {
      id: ruleId,
      logic: rule.logic,
      notes: rule.notes,
      refs: {
        sections: [rule.section],
        tools: [docId],
      },
      ...(requirementCoverage ? { requirement_coverage: requirementCoverage } : {}),
      ...(includeRicherRuleDetail && typeof rule.type === 'string' && rule.type.length > 0
        ? { requirement_kind: rule.type }
        : {}),
      ...(includeRicherRuleDetail && typeof rule.logic === 'string' && rule.logic.length > 0
        ? { requirement_text: rule.logic }
        : {}),
      ...(ruleDetail ? { rule_detail: ruleDetail } : {}),
      ...(sectionContext ? { section_context: sectionContext } : {}),
      summary: rule.summary,
      tags: rule.tags || [],
      type: rule.type,
      when: rule.when,
    };
  });
  writeJSON(path.join(dir, 'rules.rich.json'), rulesRich);

  deriveLean(dir);
  console.log(`[reshape-agriculture] rewrote ${path.relative(ROOT, dir)}`);
}

function main() {
  const args = process.argv.slice(2);
  const targets = (args.length ? args : DEFAULT_METHODS.map(relToDir)).map((p) => path.resolve(p));
  targets.forEach(reshape);
}

main();
