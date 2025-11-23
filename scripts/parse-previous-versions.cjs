#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node scripts/parse-previous-versions.cjs <html-file>');
  process.exit(2);
}

function cleanHtml(str = '') {
  return str.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function toVersionTag(raw = '') {
  const parts = String(raw).split('.');
  const major = parts[0] || '0';
  const minor = parts[1] || '0';
  return `v${major.padStart(2, '0')}-${minor}`;
}

function parseDateToken(raw) {
  if (!raw) return '';
  const match = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})$/);
  if (!match) return '';
  const [, day, mon, yearRaw] = match;
  const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
  const date = new Date(`${day} ${mon} ${year} UTC`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function parseValidity(text = '') {
  const match = text.match(/Valid from\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})(?:\s+to\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4}))?/i);
  if (!match) return { effective_from: '', effective_to: '' };
  const [, fromRaw, toRaw] = match;
  return {
    effective_from: parseDateToken(fromRaw),
    effective_to: parseDateToken(toRaw || ''),
  };
}

function main() {
  const htmlPath = process.argv[2];
  if (!htmlPath) usage();
  const absolute = path.resolve(htmlPath);
  if (!fs.existsSync(absolute)) {
    console.error(`[parse-previous] HTML file not found: ${htmlPath}`);
    process.exit(3);
  }
  const raw = fs.readFileSync(absolute, 'latin1');
  const lower = raw.toLowerCase();
  const marker = '<span class="redbold">previous versions</span>';
  const startIdx = lower.indexOf(marker);
  if (startIdx === -1) {
    console.log('[]');
    return;
  }
  const section = raw.slice(startIdx);
  const blockSeparator = /<tr>\s*<th colspan="2">\s*<\/th>\s*<\/tr>/i;
  const blocks = section.split(blockSeparator).slice(1);
  const entries = [];
  for (const block of blocks) {
    const titleMatch = block.match(/<th>Title<\/th>[\s\S]*?<td>([\s\S]*?)<\/td>/i);
    const versionMatch = block.match(/<th>Version number<\/th>[\s\S]*?<td>([\s\S]*?)<\/td>/i);
    const validityMatch = block.match(/<th>Validity<\/th>[\s\S]*?<td>([\s\S]*?)<\/td>/i);
    if (!titleMatch || !versionMatch || !validityMatch) continue;
    const pdfMatch = titleMatch[1].match(/href="([^"]+)"/i);
    const title = cleanHtml(titleMatch[1]);
    const versionNumber = cleanHtml(versionMatch[1]);
    const validityText = cleanHtml(validityMatch[1]);
    const { effective_from, effective_to } = parseValidity(validityText);
    const pdfUrl = pdfMatch ? pdfMatch[1] : '';
    if (!pdfUrl || !versionNumber) continue;
    entries.push({
      title,
      version_number: versionNumber,
      version: toVersionTag(versionNumber),
      pdf_url: pdfUrl,
      effective_from,
      effective_to,
    });
  }
  console.log(JSON.stringify(entries, null, 2));
}

main();
