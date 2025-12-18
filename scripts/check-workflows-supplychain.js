#!/usr/bin/env node
// Supply-chain gate for workflows
// - All `uses:` pinned to 40-char commit SHA
// - .nvmrc exists; its major matches all setup-node node-version values
// - No network installs/downloads in workflows (apt-get, curl, wget, npm install, brew, pip, go get)
// - Validation workflows must call the offline validator script
const fs = require('fs');
const path = require('path');

const WF_DIR = path.join('.github', 'workflows');
const BAD_NET = /(apt-get|curl\b|wget\b|npm\s+install|pip\b|brew\b|go\s+get)/i;
const USES_RX = /^\s*-\s*uses:\s*[^@]+@([A-Za-z0-9_.-]+)\s*$/m;
const SHA40 = /^[a-f0-9]{40}$/;
const NODE_RX = /node-version:\s*'?(\d+(?:\.\d+){0,2})'?/ig;

function listWorkflows(){
  if (!fs.existsSync(WF_DIR)) return [];
  return fs.readdirSync(WF_DIR).filter(f=>f.endsWith('.yml')||f.endsWith('.yaml')).sort();
}

function read(p){
  // Normalize to LF so regex/line scanning works even if the file is checked out with CRLF.
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

const results = [];

// .nvmrc
let nvmrc = null;
if (fs.existsSync('.nvmrc')) {
  nvmrc = fs.readFileSync('.nvmrc','utf8').trim();
}

function stripJobBlock(yamlText, jobId){
  const lines = yamlText.split('\n');
  const jobsIdx = lines.findIndex(l => /^jobs:\s*$/.test(l));
  if (jobsIdx === -1) return yamlText;

  const jobLineRx = new RegExp(`^\\s{2}${jobId}:\\s*$`);
  const start = lines.findIndex((l, idx) => idx > jobsIdx && jobLineRx.test(l));
  if (start === -1) return yamlText;

  // Remove from the job line until the next 2-space-indented job key (or EOF)
  let end = start + 1;
  while (end < lines.length){
    if (/^\s{2}[A-Za-z0-9_.-]+:\s*$/.test(lines[end])) break;
    end++;
  }

  const kept = lines.slice(0, start).concat(lines.slice(end));
  return kept.join('\n');
}

for (const wf of listWorkflows()){
  const p = path.join(WF_DIR, wf);
  const txt = read(p);
  const exemptIngestInStageGates = wf === 'stage-gates.yml';
  const txtForSupplyChain = exemptIngestInStageGates ? stripJobBlock(txt, 'ingest') : txt;
  const isValidation = /(validate|schema|stage-gates)/i.test(wf);
  // uses pin check
  const uses = [...txtForSupplyChain.matchAll(/^\s*-\s*uses:\s*([^\s]+)\s*$/img)].map(m=>m[1]);
  for (const u of uses){
    const at = u.split('@')[1] || '';
    if (!SHA40.test(at)) results.push({wf, kind:'uses-unpinned', detail: u});
  }
  // node-version match .nvmrc
  const nodeVers = [...txtForSupplyChain.matchAll(NODE_RX)].map(m=>m[1]);
  for (const v of nodeVers){
    if (!nvmrc) { results.push({wf, kind:'no-nvmrc', detail: 'missing .nvmrc'}); break; }
    if (String(v) !== nvmrc) results.push({wf, kind:'node-mismatch', detail: `node-version:${v} vs .nvmrc:${nvmrc}`});
  }
  // network commands (enforce only for validation workflows)
  if (isValidation && BAD_NET.test(txtForSupplyChain)) results.push({wf, kind:'net-install', detail: 'contains network install/download command'});
  // offline validator presence (require for validation workflows)
  if (isValidation){
    if (!/scripts\/validate-offline\.sh|node\s+scripts\/validate-offline\.js/.test(txt)){
      results.push({wf, kind:'no-offline-validator', detail: 'offline validator not invoked'});
    }
  }
}

if (results.length === 0){
  console.log('✅ Workflows pinned, node versions match .nvmrc, no network installs, offline validator present.');
  process.exit(0);
}

for (const r of results){
  console.log(`❌ ${r.kind} in ${r.wf}${r.detail? ' — ' + r.detail : ''}`);
}
process.exit(1);
