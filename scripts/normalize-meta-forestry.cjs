#!/usr/bin/env node
/**
 * Normalize Forestry META.json files to the canonical structure used by our gold fixtures.
 */
const fs = require('fs/promises');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const forestryRoot = path.join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry');
const defaultAuthor = 'Fred Egbuedike';

async function main() {
  const metaFiles = await collectMetaFiles(forestryRoot);
  let updated = 0;

  for (const metaPath of metaFiles) {
    const relPath = path.relative(repoRoot, metaPath);
    const original = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(original);
    const methodDocId = deriveMethodDoc(metaPath);

    let changed = false;

    if (!isObject(meta.audit_hashes)) {
      meta.audit_hashes = {};
      changed = true;
    }
    if (!isObject(meta.automation)) {
      meta.automation = {};
      changed = true;
    }
    if (!isObject(meta.provenance)) {
      meta.provenance = {};
      changed = true;
    }
    if (!isObject(meta.references)) {
      meta.references = {};
      changed = true;
    }

    const provenance = meta.provenance;
    const references = meta.references;

    if (!Array.isArray(provenance.source_pdfs)) {
      provenance.source_pdfs = [];
      changed = true;
    }
    if (!provenance.author) {
      provenance.author = defaultAuthor;
      changed = true;
    }
    if (!provenance.date) {
      provenance.date = getGitDate(metaPath);
      changed = true;
    }

    if (!Array.isArray(references.tools)) {
      references.tools = [];
      changed = true;
    }

    // Ensure references.tools entries have doc + size.
    for (const tool of references.tools) {
      if (!tool.doc) {
        const derived = deriveDocFromPath(tool.path, methodDocId);
        if (derived) {
          tool.doc = derived;
          changed = true;
        }
      }
      if (tool.path && (tool.size === undefined || tool.size === null)) {
        const size = getFileSize(tool.path);
        if (size !== null) {
          tool.size = size;
          changed = true;
        }
      }
    }

    // Normalize provenance.source_pdfs using references data.
    if (provenance.source_pdfs.length === 0) {
      const mainTool = references.tools.find((t) => isMainSourcePath(t.path));
      if (mainTool) {
        provenance.source_pdfs.push(pickSourceFields(mainTool));
        changed = true;
      }
    } else {
      for (const source of provenance.source_pdfs) {
        if (!source.path && references.tools.length > 0) {
          const mainTool = references.tools.find((t) => isMainSourcePath(t.path));
          if (mainTool) {
            Object.assign(source, pickSourceFields(mainTool));
            changed = true;
          }
        } else {
          const match = references.tools.find((t) => t.path === source.path);
          if (match) {
            if (!source.doc && match.doc) {
              source.doc = match.doc;
              changed = true;
            }
            if ((source.size === undefined || source.size === null) && match.size !== undefined) {
              source.size = match.size;
              changed = true;
            }
            if (!source.sha256 && match.sha256) {
              source.sha256 = match.sha256;
              changed = true;
            }
          }
        }
        if (!source.doc && source.path && isMainSourcePath(source.path)) {
          source.doc = methodDocId;
          changed = true;
        }
        if ((source.size === undefined || source.size === null) && source.path) {
          const size = getFileSize(source.path);
          if (size !== null) {
            source.size = size;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n');
      console.log(`[normalize] updated ${relPath}`);
      updated += 1;
    }
  }

  console.log(`[normalize] done (${updated} file${updated === 1 ? '' : 's'} updated)`);
}

async function collectMetaFiles(dir) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectMetaFiles(fullPath);
      results.push(...nested);
    } else if (entry.isFile() && entry.name === 'META.json') {
      results.push(fullPath);
    }
  }
  return results;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function getGitDate(filePath) {
  try {
    const output = execSync(`git log -n 1 --format=%cI -- "${path.relative(repoRoot, filePath)}"`, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
    if (output) {
      return output;
    }
  } catch {
    // ignore
  }
  return new Date().toISOString();
}

function deriveMethodDoc(metaPath) {
  const rel = path.relative(path.join(repoRoot, 'methodologies'), path.dirname(metaPath));
  const parts = rel.split(path.sep);
  if (parts.length >= 4) {
    const org = parts[0];
    const code = parts[2];
    const version = parts[3];
    return `${org}/${code}@${version}`;
  }
  return '';
}

function isMainSourcePath(toolPath = '') {
  return typeof toolPath === 'string' && toolPath.endsWith('/source.pdf');
}

function pickSourceFields(tool) {
  return {
    doc: tool.doc || deriveDocFromPath(tool.path, ''),
    kind: tool.kind || 'pdf',
    path: tool.path,
    sha256: tool.sha256,
    size: tool.size
  };
}

function deriveDocFromPath(toolPath, fallbackMethodDoc) {
  if (!toolPath) {
    return fallbackMethodDoc || '';
  }
  const normalized = toolPath.replace(/\\/g, '/');
  const withoutPrefix = normalized.startsWith('tools/') ? normalized.slice('tools/'.length) : normalized;
  const segments = withoutPrefix.split('/');
  if (segments.length < 2) {
    return fallbackMethodDoc || '';
  }
  const org = segments[0];
  const filename = segments[segments.length - 1];
  if (filename.toLowerCase() === 'source.pdf') {
    if (segments.length >= 4) {
      const code = segments[2];
      const version = segments[3];
      return `${org}/${code}@${version}`;
    }
    return fallbackMethodDoc || '';
  }

  const base = filename.replace(/\.pdf$/i, '');
  const toolMatch = base.match(/ar-(?:[a-z]+-)?tool-?(\d+)-v([\w\.\-]+)/i);
  if (toolMatch) {
    const number = toolMatch[1].padStart(2, '0');
    const version = `v${toolMatch[2]}`;
    return `${org}/AR-TOOL${number}@${version}`;
  }

  const versionMatch = base.match(/-v([\w\.\-]+)$/i);
  if (versionMatch) {
    const version = `v${versionMatch[1]}`;
    const docId = base.slice(0, versionMatch.index).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
    if (docId) {
      return `${org}/${docId}@${version}`;
    }
  }
  return fallbackMethodDoc || '';
}

function getFileSize(relativePath) {
  if (!relativePath) {
    return null;
  }
  const absolutePath = path.join(repoRoot, relativePath);
  try {
    const stats = require('fs').statSync(absolutePath);
    if (stats.isFile()) {
      return stats.size;
    }
  } catch {
    return null;
  }
  return null;
}

main().catch((err) => {
  console.error('[normalize] failed:', err);
  process.exit(1);
});
