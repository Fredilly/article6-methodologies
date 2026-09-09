#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const c=require('../core/methodology-artifact-contract.cjs');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'methodologies','Verra','AFOLU','VM0047','v1-1');
const info=c.getMethodInfo(dir);
const sections=JSON.parse(fs.readFileSync(path.join(dir,'sections.json'),'utf8')).sections||[];
const rules=JSON.parse(fs.readFileSync(path.join(dir,'rules.json'),'utf8')).rules||[];
const mode=process.argv[2];
if(mode==='sections'){
  const canon=sections.map(s=>c.canonicalizeLeanSection(s,info));
  for(let i=0;i<sections.length;i++) assert.equal(JSON.stringify(sections[i]),JSON.stringify(canon[i]),`section ${sections[i].id}`);
  console.log(`ok ${sections.length} lean sections`);
}else if(mode==='rules'){
  const canonSections=sections.map(s=>c.canonicalizeLeanSection(s,info));
  const lookup=new Map(canonSections.map(s=>[s.id,s]));
  const canon=rules.map(r=>c.canonicalizeLeanRuleFromLean(r,lookup,info));
  for(let i=0;i<rules.length;i++) assert.equal(JSON.stringify(rules[i]),JSON.stringify(canon[i]),`rule ${rules[i].id}`);
  console.log(`ok ${rules.length} lean rules`);
}else if(mode==='rich'){
  const rich=JSON.parse(fs.readFileSync(path.join(dir,'rules.rich.json'),'utf8'));
  assert.equal(c.classifyRulesRichMode(rich),'legacy_v1');
  console.log('ok rich mode legacy_v1');
}else throw new Error('usage: sections|rules|rich');
