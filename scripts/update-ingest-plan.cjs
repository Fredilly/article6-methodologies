#!/usr/bin/env node

/**
 * Syncs ARTICLE6 ingest plan headers and TODO checkboxes with the
 * authoritative status list in docs/projects/phase-1-ingestion/phase-status.json.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLAN_PATH = path.join(
  ROOT,
  'docs',
  'projects',
  'phase-1-ingestion',
  'ARTICLE6_INGEST_UPGRADE_PLAN.md',
);
const STATUS_PATH = path.join(
  ROOT,
  'docs',
  'projects',
  'phase-1-ingestion',
  'phase-status.json',
);

const rawStatuses = fs.readFileSync(STATUS_PATH, 'utf8');
const planContents = fs.readFileSync(PLAN_PATH, 'utf8');
const statusData = JSON.parse(rawStatuses);

const statusMap = new Map();
for (const phase of statusData.phases || []) {
  statusMap.set(phase.id, phase.status);
}

function toCheckbox(status) {
  if (status === 'done') return '[x]';
  if (status === 'in_progress') return '[-]';
  return '[ ]';
}

function applyToHeaders(markdown) {
  const headerRegex = /^## (?:\[[ x\-]\] )?Phase (\d+) - (.*)$/gm;
  return markdown.replace(headerRegex, (match, numericId, rest) => {
    const phaseId = `P${numericId}`;
    if (!statusMap.has(phaseId)) {
      throw new Error(`No status found for ${phaseId}`);
    }
    const replacement = `## ${toCheckbox(statusMap.get(phaseId))} Phase ${numericId} - ${rest}`;
    return replacement;
  });
}

function applyToTaskBlock(markdown) {
  const tasksStart = markdown.indexOf('# TASKS');
  const acceptanceStart = markdown.indexOf('# ACCEPTANCE');

  if (tasksStart === -1 || acceptanceStart === -1 || acceptanceStart <= tasksStart) {
    return markdown;
  }

  const before = markdown.slice(0, tasksStart);
  const tasksBlock = markdown.slice(tasksStart, acceptanceStart);
  const after = markdown.slice(acceptanceStart);

  const taskLineRegex = /^- \[[ x\-]\] (P\d+)(.*)$/gm;
  const updatedTasksBlock = tasksBlock.replace(taskLineRegex, (match, phaseId, rest) => {
    if (!statusMap.has(phaseId)) {
      return match;
    }
    return `- ${toCheckbox(statusMap.get(phaseId))} ${phaseId}${rest}`;
  });

  return before + updatedTasksBlock + after;
}

const nextPlan = applyToTaskBlock(applyToHeaders(planContents));

if (nextPlan !== planContents) {
  fs.writeFileSync(PLAN_PATH, nextPlan, 'utf8');
}
