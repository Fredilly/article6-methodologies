#!/usr/bin/env node
/**
 * Scaffold a methodology from templates.
 * Usage: node scripts/scaffold-method.js <method_dir> <pdf_path>
 * - Reads templates/rules.rich.template.json and sections.rich.template.json
 * - Replaces tokens {{METHOD_KEY_CANON}}, {{METHOD_KEY}}, {{VERSION}}, {{PDF_SHA256}}
 * - Writes META.json, rules.rich.json, sections.rich.json in target method dir
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (process.argv.length !== 4) {
  console.error('Usage: node scripts/scaffold-method.js <method_dir> <pdf_path>');
  process.exit(1);
}

const methodDir = path.resolve(process.argv[2]);
const pdfPath = path.resolve(process.argv[3]);

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const pdfSha = sha256(pdfPath);
const stats = fs.statSync(pdfPath);

const parts = methodDir.split(path.sep);
// Expect .../methodologies/<publisher>/<category>/<method>/<version>
const idx = parts.indexOf('methodologies');
if (idx === -1 || parts.length - idx < 5) {
  console.error('method_dir must be under methodologies/<publisher>/<category>/<method>/<version>');
  process.exit(1);
}
const publisher = parts[idx + 1];
const category = parts[idx + 2];
const method = parts[idx + 3];
const version = parts[idx + 4];

const methodKeyCanon = `${publisher}.${category}.${method}`;
const methodKey = `${publisher}/${method}`;

function applyTemplate(tplPath) {
  let txt = fs.readFileSync(tplPath, 'utf8');
  txt = txt.replace(/{{METHOD_KEY_CANON}}/g, methodKeyCanon)
           .replace(/{{METHOD_KEY}}/g, methodKey)
           .replace(/{{VERSION}}/g, version)
           .replace(/{{PDF_SHA256}}/g, pdfSha);
  return txt;
}

const root = path.resolve(__dirname, '..');
const rulesTpl = path.join(root, 'templates', 'rules.rich.template.json');
const sectionsTpl = path.join(root, 'templates', 'sections.rich.template.json');

fs.mkdirSync(methodDir, { recursive: true });
fs.writeFileSync(path.join(methodDir, 'rules.rich.json'), applyTemplate(rulesTpl));
fs.writeFileSync(path.join(methodDir, 'sections.rich.json'), applyTemplate(sectionsTpl));

const relPdfPath = path.relative(root, pdfPath);
const meta = {
  provenance: {
    source_pdfs: [
      { kind: 'pdf', path: relPdfPath, sha256: pdfSha }
    ]
  },
  references: {
    tools: [
      { doc: `${methodKey}@${version}`, kind: 'pdf', path: relPdfPath, sha256: pdfSha, size: stats.size, url: null }
    ]
  },
  stage: 'staging'
};
fs.writeFileSync(path.join(methodDir, 'META.json'), JSON.stringify(meta, null, 2) + '\n');
