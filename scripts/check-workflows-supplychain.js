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
const NODE_RX = /node-version:\s*'?(\d+)(?:\.\d+\.\d+)?'?/ig;

function listWorkflows(){
  if (!fs.existsSync(WF_DIR)) return [];
  return fs.readdirSync(WF_DIR).filter(f=>f.endsWith('.yml')||f.endsWith('.yaml')).sort();
}

function read(p){ return fs.readFileSync(p, 'utf8'); }

const results = [];

// .nvmrc
let nvmrc = null;
if (fs.existsSync('.nvmrc')) {
  nvmrc = fs.readFileSync('.nvmrc','utf8').trim();
}

for (const wf of listWorkflows()){
  const p = path.join(WF_DIR, wf);
  const txt = read(p);
  // uses pin check
  const uses = [...txt.matchAll(/^\s*-\s*uses:\s*([^\s]+)\s*$/img)].map(m=>m[1]);
  for (const u of uses){
    const at = u.split('@')[1] || '';
    if (!SHA40.test(at)) results.push({wf, kind:'uses-unpinned', detail: u});
  }
  // node-version match .nvmrc
  const nodeVers = [...txt.matchAll(NODE_RX)].map(m=>m[1]);
  for (const v of nodeVers){
    if (!nvmrc) { results.push({wf, kind:'no-nvmrc', detail: 'missing .nvmrc'}); break; }
    if (String(v) !== nvmrc) results.push({wf, kind:'node-mismatch', detail: `node-version:${v} vs .nvmrc:${nvmrc}`});
  }
  // network commands
  if (BAD_NET.test(txt)) results.push({wf, kind:'net-install', detail: 'contains network install/download command'});
  // offline validator presence (require for validation workflows)
  if (/validate|schema/i.test(wf)){
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
