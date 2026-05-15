#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, filePath), 'utf8'));
}

function main() {
  // 1. Verify schema exists and is valid JSON
  const schema = readJson('schemas/export-metadata.schema.json');
  assert.ok(schema.$schema, 'schema missing $schema');
  assert.ok(schema.required.includes('standard'), 'schema missing standard in required');
  assert.ok(schema.required.includes('section_taxonomy'), 'schema missing section_taxonomy in required');
  assert.ok(schema.required.includes('evidence_categories'), 'schema missing evidence_categories in required');
  assert.ok(schema.required.includes('disclaimers'), 'schema missing disclaimers in required');

  // 2. Verra export metadata
  const verraExport = readJson('methodologies/Verra/_export/export-metadata.json');
  assert.strictEqual(verraExport.standard, 'Verra', 'Verra metadata missing standard');
  assert.strictEqual(verraExport.metadata_version, '1.0.0', 'Verra metadata_version mismatch');

  // 2a. Section taxonomy completeness
  assert.ok(Array.isArray(verraExport.section_taxonomy), 'Verra section_taxonomy not an array');
  const verraSectionIds = verraExport.section_taxonomy.map(s => s.id);
  const verraSectionIdSet = new Set(verraSectionIds);
  assert.strictEqual(verraSectionIds.length, verraSectionIdSet.size, 'Verra section_taxonomy has duplicate ids');
  for (const section of verraExport.section_taxonomy) {
    assert.ok(section.id, 'Verra section missing id');
    assert.ok(section.title, `Verra section ${section.id} missing title`);
    assert.ok(section.description, `Verra section ${section.id} missing description`);
    assert.ok(typeof section.required === 'boolean', `Verra section ${section.id} required must be boolean`);
    assert.ok(Number.isInteger(section.export_order), `Verra section ${section.id} export_order must be integer`);
    assert.ok(section.export_order >= 1, `Verra section ${section.id} export_order must be >= 1`);
    assert.ok(Array.isArray(section.evidence_categories), `Verra section ${section.id} missing evidence_categories`);
    for (const cat of section.evidence_categories) {
      assert.ok(verraExport.evidence_categories[cat], `Verra section ${section.id} references unknown evidence category '${cat}'`);
    }
  }

  // 2b. Required export sections exist in taxonomy
  for (const secId of verraExport.required_export_sections) {
    assert.ok(verraSectionIdSet.has(secId), `Verra required_export_section '${secId}' not found in section_taxonomy`);
  }

  // 2c. Evidence categories completeness
  const verraRequiredCats = ['project_description', 'applicability_evidence', 'boundary_delineation',
    'baseline_evidence', 'additionality_evidence', 'quantification_evidence',
    'monitoring_evidence', 'leakage_evidence', 'permanence_evidence'];
  for (const cat of verraRequiredCats) {
    assert.ok(verraExport.evidence_categories[cat], `Verra missing required evidence category '${cat}'`);
    assert.ok(verraExport.evidence_categories[cat].title, `Verra evidence category '${cat}' missing title`);
    assert.ok(verraExport.evidence_categories[cat].description, `Verra evidence category '${cat}' missing description`);
  }

  // 2d. Section mappings
  assert.ok(Array.isArray(verraExport.section_mappings), 'Verra missing section_mappings');
  const verraMethodologies = new Set(verraExport.section_mappings.map(m => m.methodology));
  assert.ok(verraMethodologies.has('VM0007'), 'Verra section_mappings missing VM0007');
  assert.ok(verraMethodologies.has('VM0047'), 'Verra section_mappings missing VM0047');
  for (const mapping of verraExport.section_mappings) {
    assert.ok(mapping.methodology, 'Verra mapping missing methodology name');
    assert.ok(mapping.version, `Verra mapping ${mapping.methodology} missing version`);
    assert.ok(Array.isArray(mapping.mappings), `Verra mapping ${mapping.methodology} missing mappings array`);
    for (const m of mapping.mappings) {
      assert.ok(m.methodology_section_id, `Verra mapping ${mapping.methodology} missing methodology_section_id`);
      assert.ok(m.export_section_id, `Verra mapping ${mapping.methodology} missing export_section_id`);
      assert.ok(verraSectionIdSet.has(m.export_section_id),
        `Verra mapping ${mapping.methodology} references unknown export section '${m.export_section_id}'`);
    }
  }

  // 2e. Disclaimers
  assert.ok(verraExport.disclaimers, 'Verra missing disclaimers');
  assert.ok(verraExport.disclaimers.readiness, 'Verra missing readiness disclaimer');
  assert.ok(verraExport.disclaimers.readiness.length > 50, 'Verra readiness disclaimer too short');
  assert.ok(verraExport.disclaimers.validation, 'Verra missing validation disclaimer');
  assert.ok(verraExport.disclaimers.verification, 'Verra missing verification disclaimer');

  // 3. Gold Standard export metadata
  const gsExport = readJson('methodologies/GoldStandard/_export/export-metadata.json');
  assert.strictEqual(gsExport.standard, 'Gold Standard', 'GS metadata missing standard');
  assert.strictEqual(gsExport.metadata_version, '1.0.0', 'GS metadata_version mismatch');

  // 3a. Section taxonomy completeness
  assert.ok(Array.isArray(gsExport.section_taxonomy), 'GS section_taxonomy not an array');
  const gsSectionIds = gsExport.section_taxonomy.map(s => s.id);
  const gsSectionIdSet = new Set(gsSectionIds);
  assert.strictEqual(gsSectionIds.length, gsSectionIdSet.size, 'GS section_taxonomy has duplicate ids');
  for (const section of gsExport.section_taxonomy) {
    assert.ok(section.id, 'GS section missing id');
    assert.ok(section.title, `GS section ${section.id} missing title`);
    assert.ok(section.description, `GS section ${section.id} missing description`);
    assert.ok(typeof section.required === 'boolean', `GS section ${section.id} required must be boolean`);
    assert.ok(Number.isInteger(section.export_order), `GS section ${section.id} export_order must be integer`);
    assert.ok(section.export_order >= 1, `GS section ${section.id} export_order must be >= 1`);
    assert.ok(Array.isArray(section.evidence_categories), `GS section ${section.id} missing evidence_categories`);
    for (const cat of section.evidence_categories) {
      assert.ok(gsExport.evidence_categories[cat], `GS section ${section.id} references unknown evidence category '${cat}'`);
    }
  }

  // 3b. Required export sections exist in taxonomy
  for (const secId of gsExport.required_export_sections) {
    assert.ok(gsSectionIdSet.has(secId), `GS required_export_section '${secId}' not found in section_taxonomy`);
  }

  // 3c. Evidence categories completeness
  const gsRequiredCats = ['project_design_documentation', 'applicability_evidence',
    'additionality_evidence', 'eligibility_evidence', 'baseline_evidence',
    'monitoring_evidence', 'quantification_evidence', 'safeguards_evidence',
    'stakeholder_evidence', 'sdg_evidence', 'uncertainty_evidence'];
  for (const cat of gsRequiredCats) {
    assert.ok(gsExport.evidence_categories[cat], `GS missing required evidence category '${cat}'`);
    assert.ok(gsExport.evidence_categories[cat].title, `GS evidence category '${cat}' missing title`);
    assert.ok(gsExport.evidence_categories[cat].description, `GS evidence category '${cat}' missing description`);
  }

  // 3d. Section mappings
  assert.ok(Array.isArray(gsExport.section_mappings), 'GS missing section_mappings');
  const gsMethodologies = new Set(gsExport.section_mappings.map(m => m.methodology));
  assert.ok(gsMethodologies.has('GS-00XX'), 'GS section_mappings missing GS-00XX');
  for (const mapping of gsExport.section_mappings) {
    assert.ok(mapping.methodology, 'GS mapping missing methodology name');
    assert.ok(mapping.version, `GS mapping ${mapping.methodology} missing version`);
    assert.ok(Array.isArray(mapping.mappings), `GS mapping ${mapping.methodology} missing mappings array`);
    for (const m of mapping.mappings) {
      assert.ok(m.methodology_section_id, `GS mapping ${mapping.methodology} missing methodology_section_id`);
      assert.ok(m.export_section_id, `GS mapping ${mapping.methodology} missing export_section_id`);
      assert.ok(gsSectionIdSet.has(m.export_section_id),
        `GS mapping ${mapping.methodology} references unknown export section '${m.export_section_id}'`);
    }
  }

  // 3e. Disclaimers
  assert.ok(gsExport.disclaimers, 'GS missing disclaimers');
  assert.ok(gsExport.disclaimers.readiness, 'GS missing readiness disclaimer');
  assert.ok(gsExport.disclaimers.readiness.length > 50, 'GS readiness disclaimer too short');
  assert.ok(gsExport.disclaimers.validation, 'GS missing validation disclaimer');
  assert.ok(gsExport.disclaimers.verification, 'GS missing verification disclaimer');

  // 4. Cross-cut: verify exports referenced from META.json
  const verraMeta = readJson('methodologies/Verra/AFOLU/VM0007/v1-8/META.json');
  assert.ok(verraMeta.export, 'VM0007 META missing export field');
  assert.strictEqual(verraMeta.export.metadata_version, '1.0.0', 'VM0007 export metadata_version mismatch');
  assert.ok(verraMeta.export.path, 'VM0007 export path missing');

  const vm0047Meta = readJson('methodologies/Verra/AFOLU/VM0047/v1-0/META.json');
  assert.ok(vm0047Meta.export, 'VM0047 META missing export field');
  assert.strictEqual(vm0047Meta.export.metadata_version, '1.0.0', 'VM0047 export metadata_version mismatch');

  const gsMeta = readJson('methodologies/GoldStandard/LUF/GS-00XX/v1-0/META.json');
  assert.ok(gsMeta.export, 'GS META missing export field');
  assert.strictEqual(gsMeta.export.metadata_version, '1.0.0', 'GS export metadata_version mismatch');

  // 5. Section IDs referenced in mappings match actual methodology sections
  const verraSectionsVm0007 = readJson('methodologies/Verra/AFOLU/VM0007/v1-8/sections.json').sections;
  const verraSectionIdsVm0007 = new Set(verraSectionsVm0007.map(s => s.id));
  const vm0007Mapping = verraExport.section_mappings.find(m => m.methodology === 'VM0007');
  for (const m of vm0007Mapping.mappings) {
    assert.ok(verraSectionIdsVm0007.has(m.methodology_section_id),
      `VM0007 mapping references non-existent methodology section '${m.methodology_section_id}'`);
  }

  const verraSectionsVm0047 = readJson('methodologies/Verra/AFOLU/VM0047/v1-0/sections.json').sections;
  const verraSectionIdsVm0047 = new Set(verraSectionsVm0047.map(s => s.id));
  const vm0047Mapping = verraExport.section_mappings.find(m => m.methodology === 'VM0047');
  for (const m of vm0047Mapping.mappings) {
    assert.ok(verraSectionIdsVm0047.has(m.methodology_section_id),
      `VM0047 mapping references non-existent methodology section '${m.methodology_section_id}'`);
  }

  const gsSections = readJson('methodologies/GoldStandard/LUF/GS-00XX/v1-0/sections.json').sections;
  const gsSectionIdsActual = new Set(gsSections.map(s => s.id));
  const gsMapping = gsExport.section_mappings.find(m => m.methodology === 'GS-00XX');
  for (const m of gsMapping.mappings) {
    assert.ok(gsSectionIdsActual.has(m.methodology_section_id),
      `GS-00XX mapping references non-existent methodology section '${m.methodology_section_id}'`);
  }

  console.log('ok');
}

main();
