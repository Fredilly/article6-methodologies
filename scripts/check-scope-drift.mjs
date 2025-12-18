#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalPaths, parseIngestYaml } from './resolve-ingest-scope.mjs';

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

function parseGitStatusPorcelainZ(porcelainZ) {
  const tokens = (porcelainZ || '').split('\0').filter(Boolean);
  const paths = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const entry = tokens[i];
    if (entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const primaryPath = entry.slice(3);
    if (primaryPath) paths.push(primaryPath);
    const isRenameOrCopy = status.includes('R') || status.includes('C');
    if (isRenameOrCopy) {
      const secondaryPath = tokens[i + 1];
      if (secondaryPath) paths.push(secondaryPath);
      i += 1;
    }
  }
  return Array.from(new Set(paths));
}

function runGitStatusPaths() {
  const result = spawnSync('git', ['status', '--porcelain=v1', '-z'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git status --porcelain=v1 -z failed: ${result.stderr || result.stdout}`);
  }
  return parseGitStatusPorcelainZ(result.stdout);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ingestFile = args['ingest-yml'];
  if (!ingestFile) {
    console.error(
      'Usage: node scripts/check-scope-drift.mjs --ingest-yml <path> [--allow <path|glob> ...] [--baseline-status <file>]',
    );
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
  const baselineStatusPath = args['baseline-status'];
  const changesAll = runGitStatusPaths();
  let changes = changesAll;
  if (baselineStatusPath) {
    const baselineAbs = path.resolve(process.cwd(), baselineStatusPath);
    if (!fs.existsSync(baselineAbs)) {
      console.error(`[scope-drift] baseline status file not found: ${baselineAbs}`);
      process.exit(2);
    }
    const baselinePaths = parseGitStatusPorcelainZ(fs.readFileSync(baselineAbs, 'utf8'));
    const baselineSet = new Set(baselinePaths.map((p) => p.replace(/\\/g, '/')));
    changes = changesAll.filter((p) => !baselineSet.has(p.replace(/\\/g, '/')));
  }
  if (!changes.length) {
    console.log('[scope-drift] no changes detected by git status');
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
