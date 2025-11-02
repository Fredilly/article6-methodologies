#!/usr/bin/env node
/**
 * Convert a methodology PDF into a minimal sections.rich.json structure.
 *
 * Usage: node scripts/pdf-to-sections.js <input.pdf> <output.json>
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function usage() {
  console.error('Usage: node scripts/pdf-to-sections.js <input.pdf> <output.json>');
}

function runPdftotext(pdfPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('pdftotext', ['-layout', '-nopgbrk', pdfPath, '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('pdftotext not found; install poppler-utils'));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `pdftotext exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function normalizeText(text) {
  return text.replace(/\r\n?/g, '\n');
}

function sectionId(index) {
  return `S-${String(index).padStart(4, '0')}`;
}

function mergeContent(lines) {
  const trimmed = lines.map((line) => line.trim());
  const joined = trimmed.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return joined;
}

function extractSections(text) {
  const headingRegex = /^\s*(\d+(?:\.\d+)*)[\s\-\.)]+([A-Z][^\r\n]*)$/;
  const lines = normalizeText(text).split('\n');
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) {
      if (current) current.content.push('');
      continue;
    }

    const match = headingRegex.exec(line);
    if (match) {
      if (current) {
        current.contentText = mergeContent(current.content);
        sections.push({
          id: sectionId(sections.length + 1),
          number: current.number,
          level: current.level,
          title: current.title,
          content: current.contentText,
        });
      }
      const number = match[1];
      const headingTitle = match[2].trim();
      current = {
        number,
        title: headingTitle,
        level: number.split('.').length,
        content: [],
      };
      continue;
    }

    if (current) {
      current.content.push(rawLine);
    }
  }

  if (current) {
    current.contentText = mergeContent(current.content);
    sections.push({
      id: sectionId(sections.length + 1),
      number: current.number,
      level: current.level,
      title: current.title,
      content: current.contentText,
    });
  }

  return sections;
}

async function main() {
  const [inputPdf, outputJson] = process.argv.slice(2);
  if (!inputPdf || !outputJson) {
    usage();
    process.exit(1);
  }

  if (!fs.existsSync(inputPdf)) {
    console.error(`[sections] input PDF not found: ${inputPdf}`);
    process.exit(1);
  }

  let rawText;
  try {
    rawText = await runPdftotext(inputPdf);
  } catch (err) {
    console.error(`[sections] failed to extract text: ${err.message}`);
    process.exit(3);
  }

  const normalized = normalizeText(rawText);
  if (!normalized.trim()) {
    console.error('[sections] pdftotext produced no output');
    process.exit(3);
  }

  const textOutputDir = path.join(path.dirname(outputJson), 'txt');
  fs.mkdirSync(textOutputDir, { recursive: true });
  fs.writeFileSync(path.join(textOutputDir, 'source.txt'), normalized);

  let sections = extractSections(normalized);
  if (sections.length < 2) {
    // Retry with more permissive heading detection (allow mixed case)
    const fallbackRegex = /^\s*(\d+(?:\.\d+)*)[\s\-\.)]+([^\r\n]+)$/;
    const lines = normalized.split('\n');
    const fallbackSections = [];
    let current = null;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (current) current.content.push('');
        continue;
      }
      const match = fallbackRegex.exec(line);
      if (match) {
        if (current) {
          current.contentText = mergeContent(current.content);
          fallbackSections.push({
            id: sectionId(fallbackSections.length + 1),
            number: current.number,
            level: current.level,
            title: current.title,
            content: current.contentText,
          });
        }
        current = {
          number: match[1],
          title: match[2].trim(),
          level: match[1].split('.').length,
          content: [],
        };
        continue;
      }
      if (current) current.content.push(rawLine);
    }
    if (current) {
      current.contentText = mergeContent(current.content);
      fallbackSections.push({
        id: sectionId(fallbackSections.length + 1),
        number: current.number,
        level: current.level,
        title: current.title,
        content: current.contentText,
      });
    }
    sections = fallbackSections;
  }

  if (sections.length < 2) {
    console.error('[sections] fewer than two sections detected');
    process.exit(3);
  }

  const outputDir = path.dirname(outputJson);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputJson, `${JSON.stringify(sections, null, 2)}\n`);
  console.log(`[sections] wrote ${sections.length} sections → ${outputJson}`);
}

main().catch((err) => {
  console.error(`[sections] fatal: ${err.message}`);
  process.exit(1);
});
