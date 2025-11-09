#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const METHODOLOGY_ROOT = path.join(ROOT, 'methodologies');

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeysDeep(value[key]);
    }
    return out;
  }
  return value;
}

function writeJSON(filePath, data) {
  const sorted = sortKeysDeep(data);
  fs.writeFileSync(filePath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

function dedupeSorted(array) {
  const seen = new Set();
  const result = [];
  for (const value of array) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  result.sort();
  return result;
}

const METHODS = {
  'UNFCCC/Forestry/AR-ACM0003/v02-0': {
    tools: [
      'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/EB75_repan30_AR-ACM0003_ver02.0.pdf',
      'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-02-v1.pdf',
      'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-08-v4.0.0.pdf',
      'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-12-v3.1.pdf',
      'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-14-v4.2.pdf',
      'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-15-v2.0.pdf',
      'tools/UNFCCC/Forestry/AR-ACM0003/v02-0/ar-am-tool-16-v1.1.0.pdf'
    ],
    rules: [
      {
        section: 'S-1',
        type: 'eligibility',
        summary: 'Project restores degraded forest lands and meets additionality tests per Tool 01.',
        logic: 'Project restores degraded forest lands and demonstrates additionality using the UNFCCC barrier or investment analysis.',
        notes: 'Record baseline scenario analysis and legal right to implement A/R activities.',
        tools: ['UNFCCC/AR-ACM0003@v02-0'],
        when: [
          'Target areas classified as degraded forest land prior to start date.',
          'Additionality analysis completed per UNFCCC requirements.'
        ]
      },
      {
        section: 'S-2',
        type: 'baseline',
        summary: 'Baseline net GHG removals derived from historical land-use data per Tool 02 guidance.',
        logic: 'Baseline net removals estimated using historical land-use/land-cover data and default parameters from Tool 02.',
        notes: 'Use conservative defaults where national data unavailable; document stratification.',
        tools: ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL02@v1.0'],
        when: [
          'Baseline strata delineated and documented.',
          'Default biomass parameters justified when field data absent.'
        ]
      },
      {
        section: 'S-3',
        type: 'emissions',
        summary: 'Project emissions include fossil fuel use, biomass burning, and fertilizer application as per Tool 08.',
        logic: 'Project emissions include fossil fuel consumption, biomass burning, and fertilizer use calculated with Tool 08 default factors.',
        notes: 'Exclude sources only with transparent justification and monitoring evidence.',
        tools: ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL08@v4.0.0'],
        when: [
          'Fuel consumption metered or logged with auditable records.',
          'Fertilizer application data retained for verification.'
        ]
      },
      {
        section: 'S-4',
        type: 'leakage',
        summary: 'Leakage from activity shifting and market effects addressed using Tool 14 default factors.',
        logic: 'Activity shifting and market leakage quantified annually with Tool 14 standardized coefficients.',
        notes: 'Describe mitigation measures and community engagement to minimize leakage.',
        tools: ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL14@v4.2'],
        when: [
          'Leakage monitoring plan implemented with annual review.',
          'Leakage deductions applied before credit issuance.'
        ]
      },
      {
        section: 'S-5',
        type: 'monitoring',
        summary: 'Non-permanence buffer determined via Tool 15 risk analysis and recorded in registry accounts.',
        logic: 'Buffer contribution calculated with Tool 15 risk scoring and documented alongside issuance.',
        notes: 'Reassess risk when management conditions change.',
        tools: ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL15@v2.0'],
        when: [
          'Updated risk assessment provided during verification.',
          'Evidence of buffer account entries retained.'
        ]
      },
      {
        section: 'S-5',
        type: 'monitoring',
        summary: 'Permanent sample plots re-measured at least every five years per Tool 16 QA/QC guidance.',
        logic: 'Plot network re-measured at ≤5-year intervals using standard mensuration and Tool 16 QA/QC checks.',
        notes: 'Remote sensing may supplement but not replace ground plots.',
        tools: ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL16@v1.1.0'],
        when: [
          'Plot coordinates archived and accessible for re-measurement.',
          'QA/QC procedures documented for each monitoring campaign.'
        ]
      },
      {
        section: 'S-5',
        type: 'uncertainty',
        summary: 'Sampling uncertainty kept below 10% at 90% confidence or conservatively adjusted using Tool 12.',
        logic: 'Calculate combined sampling uncertainty and apply Tool 12 deductions when precision >10% at 90% confidence.',
        notes: 'Variance calculations retained within monitoring report appendices.',
        tools: ['UNFCCC/AR-ACM0003@v02-0', 'UNFCCC/AR-TOOL12@v3.1'],
        when: [
          'Uncertainty worksheet provided at verification.',
          'Deductions applied prior to credit issuance if threshold exceeded.'
        ]
      },
      {
        section: 'S-5',
        type: 'reporting',
        summary: 'Monitoring reports compile geospatial data, emissions sources, and buffer transactions with full audit trail.',
        logic: 'Monitoring reports include updated maps, field measurements, emission source logs, leakage deductions, and buffer transactions.',
        notes: 'Retain monitoring datasets for at least two crediting periods for audit.',
        tools: ['UNFCCC/AR-ACM0003@v02-0'],
        when: [
          'All datasets version-controlled with metadata.',
          'DOE confirms completeness of supporting records.'
        ]
      }
    ]
  },
  'UNFCCC/Forestry/AR-AM0014/v03-0': {
    tools: [
      'tools/UNFCCC/Forestry/AR-AM0014/v03-0/EB75_repan29_AR-AM0014_ver03.0.pdf',
      'tools/UNFCCC/Forestry/AR-AM0014/v03-0/ar-am-tool-02-v1.pdf',
      'tools/UNFCCC/Forestry/AR-AM0014/v03-0/ar-am-tool-08-v4.0.0.pdf',
      'tools/UNFCCC/Forestry/AR-AM0014/v03-0/ar-am-tool-12-v3.1.pdf',
      'tools/UNFCCC/Forestry/AR-AM0014/v03-0/ar-am-tool-14-v4.2.pdf',
      'tools/UNFCCC/Forestry/AR-AM0014/v03-0/ar-am-tool-15-v2.0.pdf'
    ],
    rules: [
      {
        section: 'S-1',
        type: 'eligibility',
        summary: 'Projects reforest lands without forest cover since 1989 and comply with national forest definitions.',
        logic: 'Eligible areas lack forest cover since 31 December 1989 and meet host-country forest thresholds at maturity.',
        notes: 'Document legal right and stakeholder consultation outcomes.',
        tools: ['UNFCCC/AR-AM0014@v03-0'],
        when: [
          'Historical imagery confirms non-forest status since 1989.',
          'National forest definition thresholds documented.'
        ]
      },
      {
        section: 'S-2',
        type: 'baseline',
        summary: 'Baseline biomass estimated using IPCC defaults or site-specific sampling following Tool 02.',
        logic: 'Baseline carbon stock estimates rely on Tool 02 sampling guidance or conservative IPCC defaults.',
        notes: 'Describe sampling design and justify default values.',
        tools: ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL02@v1.0'],
        when: [
          'Sampling plan approved during validation.',
          'Baseline strata documentation provided to DOE.'
        ]
      },
      {
        section: 'S-3',
        type: 'equation',
        summary: 'Net anthropogenic removals equal project removals minus baseline emissions and leakage.',
        logic: 'Net anthropogenic GHG removals computed by summing project removals and subtracting baseline emissions and leakage deductions.',
        notes: 'Include harvested wood products where applicable.',
        tools: ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL08@v4.0.0'],
        when: [
          'All carbon pools accounted for unless exclusion justified.',
          'Leakage deduction applied before reporting net removal.'
        ]
      },
      {
        section: 'S-4',
        type: 'leakage',
        summary: 'Activity shifting leakage quantified annually using Tool 14 and deducted from net removals.',
        logic: 'Activity shifting leakage calculated with Tool 14 standardized factors and subtracted from project removals each monitoring period.',
        notes: 'Describe mitigation with community agreements and land-use controls.',
        tools: ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL14@v4.2'],
        when: [
          'Leakage monitoring indicators collected annually.',
          'Evidence of mitigation actions retained.'
        ]
      },
      {
        section: 'S-5',
        type: 'monitoring',
        summary: 'Non-permanence risks addressed through buffer contributions per Tool 15 guidance.',
        logic: 'Buffer share determined using Tool 15 risk analysis and recorded with registry documentation.',
        notes: 'Update risk analysis if management conditions or tenure change.',
        tools: ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL15@v2.0'],
        when: [
          'Risk assessment updated at each verification.',
          'Buffer transactions included in monitoring report.'
        ]
      },
      {
        section: 'S-5',
        type: 'monitoring',
        summary: 'Field biomass measurements conducted at least every five years using permanent plots.',
        logic: 'Permanent sample plots measured at ≤5-year intervals with QA/QC re-measurement requirements.',
        notes: 'Calibration records maintained for all instruments.',
        tools: ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL08@v4.0.0'],
        when: [
          'Plot access maintained for full crediting period.',
          'Calibration documentation provided to DOE.'
        ]
      },
      {
        section: 'S-5',
        type: 'uncertainty',
        summary: 'Sampling uncertainty above 10% addressed with Tool 12 conservative adjustments.',
        logic: 'When sampling precision exceeds 10%, apply Tool 12 conservative deductions before issuing credits.',
        notes: 'Include uncertainty worksheets in monitoring report annexes.',
        tools: ['UNFCCC/AR-AM0014@v03-0', 'UNFCCC/AR-TOOL12@v3.1'],
        when: [
          'Confidence interval wider than ±10%.',
          'DOE reviews uncertainty calculation worksheets.'
        ]
      },
      {
        section: 'S-5',
        type: 'reporting',
        summary: 'Monitoring reports consolidate maps, inventory data, leakage deductions, and QA/QC evidence.',
        logic: 'Monitoring submissions include updated spatial data, field measurements, leakage results, and QA/QC documentation.',
        notes: 'Maintain records for at least two crediting periods.',
        tools: ['UNFCCC/AR-AM0014@v03-0'],
        when: [
          'Reporting conforms to UNFCCC template.',
          'Supporting datasets archived with version history.'
        ]
      }
    ]
  },
  'UNFCCC/Forestry/AR-AMS0003/v01-0': {
    tools: [
      'tools/UNFCCC/Forestry/AR-AMS0003/v01-0/meth_booklet.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0003/v01-0/source.docx',
      'tools/UNFCCC/Forestry/AR-AMS0003/v01-0/source.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0003/v01-0/ar-am-tool-02-v1.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0003/v01-0/ar-am-tool-08-v4.0.0.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0003/v01-0/ar-am-tool-12-v3.1.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0003/v01-0/ar-am-tool-14-v4.2.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0003/v01-0/ar-am-tool-15-v2.0.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0003/v01-0/ar-am-tool-16-v1.1.0.pdf'
    ],
    rules: [
      {
        section: 'S-1',
        type: 'eligibility',
        summary: 'Small-scale A/R activities eligible when total area < 16,000 ha and participants grouped as defined.',
        logic: 'Project qualifies as small-scale afforestation/reforestation when aggregated area under the plan remains below the UNFCCC threshold and land eligibility evidence is maintained.',
        notes: 'Document land-use history, stakeholder consent, and aggregation structure.',
        tools: ['UNFCCC/AR-AMS0003@v01-0'],
        when: [
          'Aggregated project area < 16,000 ha throughout crediting period.',
          'Land-use history demonstrates non-forest status at project start.'
        ]
      },
      {
        section: 'S-2',
        type: 'definition',
        summary: 'Definitions for grouped smallholder projects include participants, monitoring entity, and leakage belt.',
        logic: 'The methodology defines grouped project participant roles, monitoring entity responsibilities, and leakage belt boundaries.',
        notes: 'Retain participant enrollment agreements and leakage belt maps.',
        tools: ['UNFCCC/AR-AMS0003@v01-0'],
        when: [
          'Participant list updated prior to verification.',
          'Leakage belt delineated and archived with geospatial data.'
        ]
      },
      {
        section: 'S-3',
        type: 'boundary',
        summary: 'Project boundary includes above- and below-ground biomass, dead wood, litter, and soil carbon pools unless excluded with justification.',
        logic: 'Project boundary encompasses all significant carbon pools and on-site emissions sources; excluded pools set to zero emissions by rule.',
        notes: 'Document rationale for any excluded pools including monitoring constraints.',
        tools: ['UNFCCC/AR-AMS0003@v01-0'],
        when: [
          'Boundary map maintained and updated with parcel additions.',
          'Excluded pools recorded with zero-change assumption.'
        ]
      },
      {
        section: 'S-4',
        type: 'baseline',
        summary: 'Baseline scenario assumes continuation of pre-project land use with carbon stock change set to zero.',
        logic: 'Baseline carbon stock change set to zero under conservative assumption that lands remain degraded without project intervention.',
        notes: 'Provide evidence that alternative activities would not increase carbon stocks absent the project.',
        tools: ['UNFCCC/AR-AMS0003@v01-0'],
        when: [
          'Baseline justification renewed if socio-economic conditions shift.',
          'Alternative land-use scenarios documented during validation.'
        ]
      },
      {
        section: 'S-5',
        type: 'emissions',
        summary: 'Project removals calculated by summing carbon stock changes per pool minus fossil fuel and fertilizer emissions.',
        logic: 'Net project removals equal the sum of pool-based carbon stock changes minus project emissions from fuel use, vehicles, and fertilizer application.',
        notes: 'Maintain emission factor sources and activity data records.',
        tools: ['UNFCCC/AR-AMS0003@v01-0', 'UNFCCC/AR-TOOL08@v4.0.0'],
        when: [
          'Activity data for fossil fuel and fertilizer use collected annually.',
          'Emission factors conform to latest IPCC or national guidance.'
        ]
      },
      {
        section: 'S-6',
        type: 'leakage',
        summary: 'Leakage from activity shifting or market effects monitored and deducted using Tool 14 default factors.',
        logic: 'Leakage emissions from displaced activities quantified with standardized coefficients from Tool 14 and deducted from net removals.',
        notes: 'Implement leakage mitigation plan engaging local communities.',
        tools: ['UNFCCC/AR-AMS0003@v01-0', 'UNFCCC/AR-TOOL14@v4.2'],
        when: [
          'Leakage belt activities surveyed annually.',
          'Leakage deductions documented prior to credit issuance.'
        ]
      },
      {
        section: 'S-7',
        type: 'monitoring',
        summary: 'Monitoring plan requires permanent plots measured every five years plus tracking of grouped participant compliance.',
        logic: 'Implement monitoring plan with permanent sample plots, participant reporting forms, and QA/QC checks consistent with Tool 16.',
        notes: 'Provide plot re-measurement schedule and participant monitoring templates.',
        tools: ['UNFCCC/AR-AMS0003@v01-0', 'UNFCCC/AR-TOOL16@v1.1.0'],
        when: [
          'Plot measurements occur at ≤5-year intervals.',
          'Participant compliance logs reviewed each verification.'
        ]
      },
      {
        section: 'S-8',
        type: 'data',
        summary: 'Data and parameters table specifies default biomass factors and sampling requirements.',
        logic: 'Maintain dataset of project parameters including default biomass expansion factors, root-shoot ratios, and wood density values.',
        notes: 'Parameter updates documented if national data become available.',
        tools: ['UNFCCC/AR-AMS0003@v01-0', 'UNFCCC/AR-TOOL14@v4.2'],
        when: [
          'Project data registry kept current for all parameters.',
          'Any parameter change approved by DOE prior to use.'
        ]
      },
      {
        section: 'S-9',
        type: 'uncertainty',
        summary: 'Uncertainty calculated per Tool 12; apply deductions when precision exceeds 10%.',
        logic: 'Combine sampling and model uncertainty and apply Tool 12 deduction factors when required precision not achieved.',
        notes: 'Uncertainty worksheets stored with monitoring archives.',
        tools: ['UNFCCC/AR-AMS0003@v01-0', 'UNFCCC/AR-TOOL12@v3.1'],
        when: [
          'Confidence interval wider than ±10%.',
          'DOE verifies uncertainty computation spreadsheets.'
        ]
      },
      {
        section: 'S-10',
        type: 'permanence',
        summary: 'Non-permanence risk buffer determined via Tool 15 and updated when risk profile changes.',
        logic: 'Allocate a proportional buffer contribution using Tool 15 risk matrix and adjust if threats or safeguards evolve.',
        notes: 'Risk assessment and buffer transactions retained with monitoring records.',
        tools: ['UNFCCC/AR-AMS0003@v01-0', 'UNFCCC/AR-TOOL15@v2.0'],
        when: [
          'Risk assessment reviewed every verification.',
          'Buffer ledger entries retained for DOE review.'
        ]
      },
      {
        section: 'S-11',
        type: 'reference',
        summary: 'Normative tools and references (Tools 02, 08, 12, 14, 15, 16) must be accessible to grouped project manager.',
        logic: 'Project maintains accessible copies of required normative tools and references listed in the methodology.',
        notes: 'Document distribution of normative tools to monitoring staff.',
        tools: ['UNFCCC/AR-AMS0003@v01-0'],
        when: [
          'Normative tools catalog updated when UNFCCC issues revisions.'
        ]
      },
      {
        section: 'S-12',
        type: 'equation',
        summary: 'Annual net removals computed as sum of pool changes minus leakage and emissions, divided by years between measurements.',
        logic: 'Annualized carbon stock change ΔC_year = (C_t2 - C_t1) / T applied for each pool before emissions and leakage are deducted.',
        notes: 'Track measurement intervals precisely to avoid bias.',
        tools: ['UNFCCC/AR-AMS0003@v01-0', 'UNFCCC/AR-TOOL14@v4.2'],
        when: [
          'Measurement interval T documented in monitoring report.',
          'Pools aligned with UNFCCC reporting templates.'
        ]
      },
      {
        section: 'S-13',
        type: 'reporting',
        summary: 'Annexes include participant enrollment records, training logs, and dispute resolution evidence.',
        logic: 'Annex materials capture supporting evidence such as participant lists, training certificates, and grievance records.',
        notes: 'Maintain annex files for at least two crediting periods.',
        tools: ['UNFCCC/AR-AMS0003@v01-0'],
        when: [
          'Annex contents reviewed during verification.',
          'Updates provided when participants join or exit the program.'
        ]
      }
    ]
  },
  'UNFCCC/Forestry/AR-AMS0007/v03-1': {
    tools: [
      'tools/UNFCCC/Forestry/AR-AMS0007/v03-1/source.docx',
      'tools/UNFCCC/Forestry/AR-AMS0007/v03-1/source.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0007/v03-1/ar-am-tool-02-v1.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0007/v03-1/ar-am-tool-08-v4.0.0.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0007/v03-1/ar-am-tool-12-v3.1.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0007/v03-1/ar-am-tool-14-v4.2.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0007/v03-1/ar-am-tool-15-v2.0.pdf',
      'tools/UNFCCC/Forestry/AR-AMS0007/v03-1/ar-am-tool-16-v1.1.0.pdf'
    ],
    rules: [
      {
        section: 'S-1',
        type: 'eligibility',
        summary: 'Wetland restoration projects eligible when activities convert degraded wetlands to forest and meet small-scale thresholds.',
        logic: 'Eligible lands are degraded wetlands converted to forest; aggregated area remains below the small-scale threshold and hydrological integrity is restored.',
        notes: 'Document hydrological restoration plan and baseline conditions.',
        tools: ['UNFCCC/AR-AMS0007@v03-1'],
        when: [
          'Baseline hydrology assessment completed.',
          'Aggregated area < 16,000 ha during crediting period.'
        ]
      },
      {
        section: 'S-2',
        type: 'definition',
        summary: 'Definitions clarify wetland geomorphology, participant aggregation, and leakage belt concepts.',
        logic: 'Methodology definitions specify hydrological units, participant roles, and leakage belt boundaries.',
        notes: 'Provide glossary to participants and monitoring team.',
        tools: ['UNFCCC/AR-AMS0007@v03-1'],
        when: [
          'Definitions reviewed during participant onboarding.'
        ]
      },
      {
        section: 'S-3',
        type: 'boundary',
        summary: 'Project boundary includes on-site hydrological interventions and relevant carbon pools except where justified.',
        logic: 'Boundary encompasses project hydrological zones and carbon pools; excluded pools set to zero change in calculations.',
        notes: 'Maintain geospatial files showing boundary and leakage belt.',
        tools: ['UNFCCC/AR-AMS0007@v03-1'],
        when: [
          'Boundary updates documented when parcels are added or removed.'
        ]
      },
      {
        section: 'S-4',
        type: 'baseline',
        summary: 'Baseline assumes continuation of pre-project wetland degradation with zero additional removals.',
        logic: 'Baseline carbon stock change set to zero under conservative assumption of continued degradation without project intervention.',
        notes: 'Provide evidence that alternative land uses would maintain degraded conditions.',
        tools: ['UNFCCC/AR-AMS0007@v03-1'],
        when: [
          'Baseline scenario revisited if policy or land tenure shifts.'
        ]
      },
      {
        section: 'S-5',
        type: 'emissions',
        summary: 'Project removals calculated from pool carbon stock changes minus emissions from project operations.',
        logic: 'Net project removals equal sum of pool-specific carbon changes minus emissions from fuel use, drainage pumps, and fertilizer application.',
        notes: 'Document emission factors and drainage pump operating records.',
        tools: ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL08@v4.0.0'],
        when: [
          'Activity data for pumps and machinery collected annually.',
          'Emission factors traceable to IPCC or national sources.'
        ]
      },
      {
        section: 'S-6',
        type: 'leakage',
        summary: 'Leakage from displaced wetland uses monitored and deducted using Tool 14 defaults.',
        logic: 'Leakage emissions calculated from Tool 14 metrics applied to displaced wetland uses and deducted before credit issuance.',
        notes: 'Engage communities to minimize activity shifting.',
        tools: ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL14@v4.2'],
        when: [
          'Leakage belt surveys performed annually.',
          'Leakage mitigation plan implemented and documented.'
        ]
      },
      {
        section: 'S-7',
        type: 'monitoring',
        summary: 'Monitoring plan covers hydrology restoration, vegetation plots, and participant reporting.',
        logic: 'Implement monitoring plan with hydrological gauges, vegetation plots (Tool 16 QA/QC), and participant compliance forms.',
        notes: 'Hydrological data and plot measurements archived for audit.',
        tools: ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL16@v1.1.0'],
        when: [
          'Hydrology indicators remain within restoration targets.',
          'Plot network re-measured at ≤5-year intervals.'
        ]
      },
      {
        section: 'S-8',
        type: 'data',
        summary: 'Data tables specify default biomass factors, hydrological parameters, and monitoring records.',
        logic: 'Maintain dataset for biomass expansion factors, drainage rates, and soil parameters; update when national values available.',
        notes: 'Ensure data registry accessible to DOE.',
        tools: ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL14@v4.2'],
        when: [
          'Data registry updated prior to each verification.'
        ]
      },
      {
        section: 'S-9',
        type: 'uncertainty',
        summary: 'Uncertainty analysis follows Tool 12 with deductions when precision thresholds unmet.',
        logic: 'Apply Tool 12 procedures combining sampling and model uncertainty; deduct when precision worse than ±10% at 90% confidence.',
        notes: 'Uncertainty spreadsheets stored in project archive.',
        tools: ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL12@v3.1'],
        when: [
          'Confidence interval wider than ±10%.',
          'DOE reviews uncertainty calculations.'
        ]
      },
      {
        section: 'S-10',
        type: 'permanence',
        summary: 'Permanence buffer contributions determined via Tool 15 wetland risk factors.',
        logic: 'Use Tool 15 wetland-specific risk scoring to set buffer share; adjust when management or climate risks change.',
        notes: 'Record buffer transactions in registry statements.',
        tools: ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL15@v2.0'],
        when: [
          'Risk assessment reassessed at each verification.'
        ]
      },
      {
        section: 'S-11',
        type: 'reference',
        summary: 'Normative tools and references maintained for monitoring and verification teams.',
        logic: 'Maintain accessible copies of UNFCCC tools referenced in methodology for all monitoring staff.',
        notes: 'Notify team when UNFCCC issues updates to normative tools.',
        tools: ['UNFCCC/AR-AMS0007@v03-1'],
        when: [
          'Reference library refreshed when tools updated.'
        ]
      },
      {
        section: 'S-12',
        type: 'equation',
        summary: 'Annualized carbon stock change derived from difference in pool carbon divided by measurement interval.',
        logic: 'ΔC_year = (C_t2 - C_t1) / T applied to each pool prior to emission and leakage deductions.',
        notes: 'Maintain calculation worksheets showing measurement intervals.',
        tools: ['UNFCCC/AR-AMS0007@v03-1', 'UNFCCC/AR-TOOL14@v4.2'],
        when: [
          'Measurement intervals documented and justified.'
        ]
      },
      {
        section: 'S-13',
        type: 'reporting',
        summary: 'Annexes capture hydrology restoration evidence, training records, and community engagement notes.',
        logic: 'Include hydrological restoration documentation, participant training logs, and engagement minutes in monitoring annexes.',
        notes: 'Retain annex materials for full crediting period.',
        tools: ['UNFCCC/AR-AMS0007@v03-1'],
        when: [
          'Community engagement documented each monitoring cycle.'
        ]
      }
    ]
  }
};

function makeRichRule(methodKey, index, spec) {
 const serial = String(index + 1).padStart(4, '0');
  const slug = methodKey.replace(/\//g, '.');
  const ruleId = `${slug}.R-1-${serial}`;
  const refs = {
    sections: [spec.section],
    tools: dedupeSorted(spec.tools)
  };
  const rule = {
    id: ruleId,
    type: spec.type,
    summary: spec.summary,
    logic: spec.logic,
    notes: spec.notes || undefined,
    inputs: Array.isArray(spec.inputs) ? spec.inputs : undefined,
    when: Array.isArray(spec.when) ? spec.when : undefined,
    refs
  };
  return sortKeysDeep(rule);
}

function makeLeanRule(index, spec) {
  const serial = String(index + 1).padStart(4, '0');
  return sortKeysDeep({
    id: `R-1-${serial}`,
    section_id: spec.section,
    tags: dedupeSorted([spec.type]),
    text: spec.summary,
    title: spec.summary,
    inputs: Array.isArray(spec.inputs) ? spec.inputs : [],
    when: Array.isArray(spec.when) ? spec.when : [],
    tools: dedupeSorted(spec.tools)
  });
}

function makeToolEntry(filePath) {
  const absPath = path.join(ROOT, filePath);
  const stat = fs.statSync(absPath);
  const kind = filePath.split('.').pop();
 const doc = (() => {
   const parts = filePath.split('/');
   const org = parts[1];
   const method = parts[2];
   const version = parts[3];
   const filename = parts[parts.length - 1];
   const toolMatch = filename.match(/^(ar-[a-z]+-tool-\d+)-v([\d]+(?:[.-][\d]+)*)\.(pdf|docx)$/i);
   if (toolMatch) {
      const code = toolMatch[1].toUpperCase();
      const normalized = code.replace('AR-AM-TOOL-', 'AR-TOOL');
      const versionNormalized = toolMatch[2].replace(/-/g, '.');
      return `${org}/${normalized}@v${versionNormalized}`;
    }
    if (/source\.(pdf|docx)$/i.test(filename) || /meth_booklet\.pdf$/i.test(filename)) {
      return `${org}/${method}@${version}`;
    }
    return `${org}/${method}@${version}`;
  })();
  return sortKeysDeep({
    doc,
    path: filePath,
    sha256: sha256(absPath),
    size: stat.size,
    kind,
    url: null
  });
}

for (const [methodKey, config] of Object.entries(METHODS)) {
  const methodDir = path.join(METHODOLOGY_ROOT, methodKey);
  if (!fs.existsSync(methodDir)) {
    console.warn(`Skipping ${methodKey} (directory missing)`);
    continue;
  }

  const richRules = config.rules.map((rule, idx) => makeRichRule(methodKey, idx, rule));
  const leanRules = config.rules.map((rule, idx) => makeLeanRule(idx, rule));

  writeJSON(path.join(methodDir, 'rules.rich.json'), richRules);
  writeJSON(path.join(methodDir, 'rules.json'), { rules: leanRules });

  const metaPath = path.join(methodDir, 'META.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const toolEntries = config.tools.map(makeToolEntry);
  meta.references = meta.references || {};
  meta.references.tools = sortKeysDeep(toolEntries);
  writeJSON(metaPath, meta);
}

console.log('OK: rewrote forestry rules and META references.');
