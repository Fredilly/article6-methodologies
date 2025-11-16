#!/usr/bin/env node
import path from 'node:path';

export function deriveToolDoc(toolPath) {
  if (!toolPath) return '';
  const normalized = toolPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const toolsIdx = parts.indexOf('tools');
  if (toolsIdx === -1 || toolsIdx + 3 >= parts.length) return '';
  const standard = parts[toolsIdx + 1];
  const methodCode = parts[toolsIdx + 2];
  const version = parts[toolsIdx + 3];
  const fileName = parts[parts.length - 1];

  if (/source\.(pdf|docx)$/i.test(fileName)) {
    return `${standard}/${methodCode}@${version}`;
  }

  const stem = fileName.replace(/\.(pdf|docx)$/i, '');
  const lower = stem.toLowerCase();
  const toolMatch = lower.match(/^([a-z0-9-]+)-tool-([0-9]+)-v([0-9.]+)$/);
  if (toolMatch) {
    const prefix = toolMatch[1].split('-')[0].toUpperCase();
    const toolNumber = toolMatch[2].replace(/^0+/, '') || '0';
    const versionTag = toolMatch[3];
    return `${standard}/${prefix}-TOOL${toolNumber}@v${versionTag}`;
  }

  // fallback: reference by method, unique by filename stem
  const safeStem = stem.replace(/[^A-Za-z0-9]/g, '-');
  return `${standard}/${methodCode}@${version}#${safeStem}`;
}

if (process.argv[1] && path.basename(process.argv[1]) === path.basename(new URL(import.meta.url).pathname)) {
  const target = process.argv[2] || '';
  process.stdout.write(deriveToolDoc(target));
}
