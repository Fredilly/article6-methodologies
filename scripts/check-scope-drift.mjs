#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalPaths } from './resolve-ingest-scope.mjs';

function parseArgs(argv) {
  const out = { allow: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (name === 'allow') {
      if (!next || next.startsWith('--')) {
        throw new Error('--allow expects a path/glob');
      }
      out.allow.push(next);
      i += 1;
      continue;
    }
    if (!next || next.startsWith('--')) {
      out[name] = 'true';
      continue;
    }
    out[name] = next;
    i += 1;
  }
  return out;
}

function stripQuotes(value) {
  return value.replace(/^['"]/, '').replace(/['"]$/, '');
}

function parseIngestYaml(contents) {
  const lines = contents.split(/\r?\n/);
  const doc = { version: '', methods: [] };
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('version:')) {
      const [, versionRaw = ''] = trimmed.split(':');
      doc.version = stripQuotes(versionRaw.trim());
      continue;
    }
    const methodMatch = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (methodMatch) {
      current = { id: stripQuotes(methodMatch[1].trim()) };
      doc.methods.push(current);
      continue;
    }
    if (!current) continue;
    const propMatch = line.match(/^\s+([A-Za-z0-9_]+):\s*(.+)?$/);
    if (!propMatch) continue;
    const [, key, rawValue = ''] = propMatch;
    current[key] = stripQuotes(rawValue.trim());
  }
  return doc;
}

function globToRegExp(glob) {
  let pattern = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  pattern = pattern.replace(/\*\*/g, '\u0000');
  pattern = pattern.replace(/\*/g, '[^/]*');
  pattern = pattern.replace(/\?/g, '.');
  pattern = pattern.replace(/\u0000/g, '.*');
  return new RegExp(`^${pattern}$`);
}

function normalizeAllowPatterns(allows = []) {
  return allows.map((entry) => {
    const normalized = entry.replace(/\\/g, '/');
    if (!normalized.includes('*') && !normalized.includes('?')) {
      return { type: 'literal', value: normalized };
    }
    return { type: 'glob', value: globToRegExp(normalized) };
  });
}

function pathWithinScope(filePath, scopeRoots) {
  for (const root of scopeRoots) {
    if (filePath === root) return true;
    if (filePath.startsWith(`${root}/`)) return true;
  }
  return false;
}

function matchesAllowList(filePath, allowPatterns) {
  for (const allow of allowPatterns) {
    if (allow.type === 'literal' && filePath === allow.value) return true;
    if (allow.type === 'glob' && allow.value.test(filePath)) return true;
  }
  return false;
}

function deriveScopeRoots(methods) {
  const roots = new Set();
  for (const method of methods) {
    const id = `${method.id || ''}`.trim();
    if (!id) continue;
    const version = `${method.version || ''}`.trim();
    if (id && version) {
      try {
        const canonical = canonicalPaths({ id, version });
        roots.add(canonical.methodologiesDir);
        roots.add(canonical.toolsDir);
        continue;
      } catch (err) {
        // fall through to conservative scope
      }
    }
    const parts = id.split('.');
    const org = parts[0] || 'UNFCCC';
    const sector = method.sector || parts[1] || '';
    if (org && sector) {
      roots.add(path.posix.join('methodologies', org, sector));
      roots.add(path.posix.join('tools', org, sector));
    } else if (org) {
      roots.add(path.posix.join('methodologies', org));
      roots.add(path.posix.join('tools', org));
    }
  }
  return Array.from(roots).filter(Boolean);
}

function runGitDiff() {
  const result = spawnSync('git', ['diff', '--name-only'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git diff --name-only failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ingestFile = args['ingest-yml'];
  if (!ingestFile) {
    console.error('Usage: node scripts/check-scope-drift.mjs --ingest-yml <path> [--allow <path|glob> ...]');
    process.exit(1);
  }
  const ingestPath = path.resolve(process.cwd(), ingestFile);
  if (!fs.existsSync(ingestPath)) {
    console.error(`[scope-drift] ingest file not found: ${ingestPath}`);
    process.exit(1);
  }
  const ingestDoc = parseIngestYaml(fs.readFileSync(ingestPath, 'utf8'));
  if (!ingestDoc.methods.length) {
    console.error(`[scope-drift] no methods found inside ${ingestFile}`);
    process.exit(1);
  }
  const scopeRoots = deriveScopeRoots(ingestDoc.methods).map((root) => root.replace(/\\/g, '/'));
  if (!scopeRoots.length) {
    console.error('[scope-drift] unable to derive scope roots from ingest config');
    process.exit(1);
  }
  const allowPatterns = normalizeAllowPatterns(args.allow);
  const changes = runGitDiff();
  if (!changes.length) {
    console.log('[scope-drift] no changes detected by git diff');
    return;
  }
  const offenders = changes.filter((filePath) => {
    const posixPath = filePath.replace(/\\/g, '/');
    if (matchesAllowList(posixPath, allowPatterns)) return false;
    return !pathWithinScope(posixPath, scopeRoots);
  });
  if (offenders.length) {
    console.error('[scope-drift] detected out-of-scope changes:');
    for (const filePath of offenders) {
      console.error(`  - ${filePath}`);
    }
    console.error('[scope-drift] align changes with the ingest scope or extend the allowlist.');
    process.exit(1);
  }
  console.log('[scope-drift] all changes are within the declared scope.');
}

main();
