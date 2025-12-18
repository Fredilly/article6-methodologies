#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonicalPaths, parseIngestYaml } from './resolve-ingest-scope.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[name] = 'true';
      continue;
    }
    out[name] = next;
    i += 1;
  }
  return out;
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function stableStringify(value) {
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function parseScopeFileJson(doc) {
  if (Array.isArray(doc)) return doc;
  if (doc && typeof doc === 'object' && Array.isArray(doc.methods)) return doc.methods;
  throw new Error('[check-registry-scope] scope-file JSON must be an array or {methods:[...]}');
}

function parseScopeFileText(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [id, version = ''] = line.split('@');
      return { id: `${id || ''}`.trim(), version: `${version || ''}`.trim() };
    });
}

function readScopeMethods({ ingestFile, scopeFile }) {
  if (ingestFile && scopeFile) {
    throw new Error('[check-registry-scope] provide only one of: --ingest-yml, --scope-file');
  }
  if (!ingestFile && !scopeFile) return [];
  const input = ingestFile || scopeFile;
  const inputPath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`[check-registry-scope] scope file not found: ${input}`);
  }

  if (ingestFile || /\.(ya?ml)$/i.test(input)) {
    const ingestDoc = parseIngestYaml(fs.readFileSync(inputPath, 'utf8'));
    const methods = ingestDoc.methods || [];
    if (!methods.length) {
      throw new Error(`[check-registry-scope] no methods found in ${input}`);
    }
    return methods;
  }

  if (/\.json$/i.test(input)) {
    const methods = parseScopeFileJson(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
    if (!methods.length) {
      throw new Error(`[check-registry-scope] no methods found in ${input}`);
    }
    return methods;
  }

  const methods = parseScopeFileText(fs.readFileSync(inputPath, 'utf8'));
  if (!methods.length) {
    throw new Error(`[check-registry-scope] no methods found in ${input}`);
  }
  return methods;
}

function allowedKeysFromMethods(methods) {
  const keys = new Set();
  for (const method of methods) {
    const id = `${method?.id || ''}`.trim();
    const version = `${method?.version || ''}`.trim();
    if (!id || !version) continue;
    const canonical = canonicalPaths({ id, version });
    keys.add(`${canonical.org}||${canonical.program}||${canonical.code}`);
  }
  return keys;
}

function parseChangedKeysFromGitPaths(paths) {
  const keys = new Set();
  for (const file of paths) {
    const parts = file.split('/').filter(Boolean);
    if (parts.length < 4) continue;
    if (parts[0] === 'methodologies') {
      const [_, org, program, code] = parts;
      if (org && program && code) keys.add(`${org}||${program}||${code}`);
    } else if (parts[0] === 'tools') {
      const [_, org, program, code] = parts;
      if (org && program && code) keys.add(`${org}||${program}||${code}`);
    }
  }
  return keys;
}

function readBaselineDirtyPaths(baselineStatusFile) {
  if (!baselineStatusFile) return new Set();
  if (!fs.existsSync(baselineStatusFile)) return new Set();
  const raw = fs.readFileSync(baselineStatusFile);
  const entries = raw.toString('utf8').split('\0').filter(Boolean);
  const out = new Set();
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed.length < 4) continue;
    out.add(trimmed.slice(3));
  }
  return out;
}

function loadRegistryFromGit(ref) {
  try {
    const raw = sh('git', ['show', `${ref}:registry.json`]);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadRegistryFromFs() {
  if (!fs.existsSync('registry.json')) return [];
  const parsed = JSON.parse(fs.readFileSync('registry.json', 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function entryId(entry) {
  return `${entry.kind}||${entry.standard}||${entry.program}||${entry.code}||${entry.version}||${entry.path}`;
}

function entryKey(entry) {
  return `${entry.standard}||${entry.program}||${entry.code}`;
}

function computeRegistryChangedKeys(before, after) {
  const beforeMap = new Map(before.map((e) => [entryId(e), stableStringify(e)]));
  const afterMap = new Map(after.map((e) => [entryId(e), stableStringify(e)]));
  const changed = new Set();

  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  for (const id of allIds) {
    const a = beforeMap.get(id);
    const b = afterMap.get(id);
    if (a === undefined || b === undefined || a !== b) {
      const entry = afterMap.has(id)
        ? after.find((e) => entryId(e) === id)
        : before.find((e) => entryId(e) === id);
      if (entry) changed.add(entryKey(entry));
    }
  }
  return changed;
}

function resolveGitBaseRef(explicitBase) {
  if (explicitBase) return explicitBase;
  const event = process.env.GITHUB_EVENT_NAME || '';
  const baseRef = process.env.GITHUB_BASE_REF || '';
  if (event === 'pull_request' && baseRef) {
    return `origin/${baseRef}`;
  }
  return 'HEAD~1';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ingestYml = args['ingest-yml'] || '';
  const scopeFile = args['scope-file'] || '';
  const scopeFromGit = args['scope-from-git'] || '';
  const baselineStatus = args['baseline-status'] || '';

  if ((ingestYml || scopeFile) && scopeFromGit) {
    console.error('[check-registry-scope] choose one: --ingest-yml/--scope-file OR --scope-from-git');
    process.exit(2);
  }

  const dirtyAtStart = readBaselineDirtyPaths(baselineStatus);
  if (dirtyAtStart.has('registry.json')) {
    process.stdout.write('[check-registry-scope] skip: registry.json was dirty at baseline\n');
    return;
  }

  const before = loadRegistryFromGit('HEAD');
  const after = loadRegistryFromFs();
  const changedKeys = computeRegistryChangedKeys(before, after);
  if (!changedKeys.size) return;

  let allowed = new Set();
  if (scopeFromGit) {
    const base = resolveGitBaseRef(scopeFromGit === 'true' ? '' : scopeFromGit);
    let namesRaw = '';
    try {
      namesRaw = sh('git', ['diff', '--name-only', `${base}...HEAD`]).trim();
    } catch {
      namesRaw = sh('git', ['diff', '--name-only', 'HEAD~1...HEAD']).trim();
    }
    const names = namesRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    allowed = parseChangedKeysFromGitPaths(names);
  } else {
    const methods = readScopeMethods({ ingestFile: ingestYml, scopeFile });
    allowed = allowedKeysFromMethods(methods);
  }

  if (!allowed.size) {
    console.error('[check-registry-scope] empty allowed scope; cannot validate registry.json changes');
    process.exit(3);
  }

  const outOfScope = Array.from(changedKeys).filter((k) => !allowed.has(k)).sort();
  if (outOfScope.length) {
    console.error('[check-registry-scope] FAIL: registry.json changed out-of-scope method codes:');
    for (const key of outOfScope) console.error(`- ${key.replaceAll('||', ' / ')}`);
    process.exit(1);
  }
}

main();
