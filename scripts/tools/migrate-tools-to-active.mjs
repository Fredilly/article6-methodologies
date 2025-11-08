#!/usr/bin/env node
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  renameSync,
  mkdirSync
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const repoRoot = process.cwd();
const toolsRoot = join(repoRoot, 'tools', 'UNFCCC', 'Forestry');
const methodologiesRoot = join(repoRoot, 'methodologies', 'UNFCCC', 'Forestry');

const versionRe = /^v(\d{2})-(\d)$/;
const sourceRe = /^source\.(pdf|doc|docx|txt)$/i;

const args = process.argv.slice(2);
const dryRun = args.includes('--check') || args.includes('--dry-run');

function toPosix(p) {
  return p.split(sep).join('/');
}

function relFromRoot(absPath) {
  return toPosix(relative(repoRoot, absPath));
}

function parseVersion(name) {
  const match = versionRe.exec(name);
  if (!match) return null;
  return { name, major: Number(match[1]), minor: Number(match[2]) };
}

function pickActiveVersion(names) {
  const parsed = names.map(parseVersion).filter(Boolean);
  if (!parsed.length) return null;
  parsed.sort((a, b) => {
    if (a.major === b.major) return a.minor - b.minor;
    return a.major - b.major;
  });
  return parsed[parsed.length - 1];
}

function fingerprintFile(absPath) {
  const data = readFileSync(absPath);
  const prefix = data.slice(0, 80).toString('utf8');
  if (prefix.startsWith('version https://git-lfs.github.com/spec/v1')) {
    const text = data.toString('utf8');
    const oidMatch = text.match(/^oid sha256:([0-9a-f]{64})$/m);
    const sizeMatch = text.match(/^size (\d+)$/m);
    if (!oidMatch || !sizeMatch) {
      throw new Error(`Invalid Git LFS pointer: ${absPath}`);
    }
    return { sha: oidMatch[1], bytes: Number(sizeMatch[1]) };
  }
  const hash = createHash('sha256');
  hash.update(data);
  return { sha: hash.digest('hex'), bytes: data.length };
}

function readActiveFiles(activeDir) {
  const result = new Map();
  const bySha = new Map();
  const queue = [activeDir];
  while (queue.length) {
    const current = queue.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absPath);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith('.pdf')) continue;
      if (sourceRe.test(entry.name)) continue;
      const lower = entry.name.toLowerCase();
      const { sha, bytes } = fingerprintFile(absPath);
      const relPath = relFromRoot(absPath);
      const info = {
        name: entry.name,
        absPath,
        relPath,
        sha,
        bytes
      };
      if (!result.has(lower)) {
        result.set(lower, info);
      }
      if (!bySha.has(sha)) {
        bySha.set(sha, info);
      }
    }
  }
  return { byName: result, bySha };
}

function consolidateTools(methodName, versionName, activeDir, activeMaps, actions) {
  const versionPath = join(toolsRoot, methodName, versionName);
  const entries = readdirSync(versionPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.pdf')) continue;
    if (sourceRe.test(entry.name)) continue;
    const absPath = join(versionPath, entry.name);
    const { sha, bytes } = fingerprintFile(absPath);
    const lower = entry.name.toLowerCase();
    const existing = activeMaps.byName.get(lower);
    if (existing && existing.sha === sha) {
      if (dryRun) {
        actions.push({
          type: 'dedupe',
          target: relFromRoot(absPath),
          dest: existing.relPath
        });
      } else {
        rmSync(absPath);
        actions.push({
          type: 'deduped',
          target: relFromRoot(absPath),
          dest: existing.relPath
        });
      }
      continue;
    }
    const legacyDir = join(activeDir, 'legacy', versionName);
    const legacyPath = join(legacyDir, entry.name);
    const legacyRel = relFromRoot(legacyPath);
    if (existsSync(legacyPath)) {
      const { sha: destSha } = fingerprintFile(legacyPath);
      if (destSha === sha) {
        if (dryRun) {
          actions.push({
            type: 'dedupe',
            target: relFromRoot(absPath),
            dest: legacyRel
          });
        } else {
          rmSync(absPath);
          actions.push({
            type: 'deduped',
            target: relFromRoot(absPath),
            dest: legacyRel
          });
        }
        continue;
      }
      throw new Error(
        `conflicting legacy file for ${methodName}@${versionName}: ${legacyRel}`
      );
    }
    if (!dryRun) {
      mkdirSync(legacyDir, { recursive: true });
      renameSync(absPath, legacyPath);
    }
    const info = {
      name: entry.name,
      absPath: legacyPath,
      relPath: legacyRel,
      sha,
      bytes
    };
    activeMaps.byName.set(lower, info);
    activeMaps.bySha.set(sha, info);
    actions.push({
      type: dryRun ? 'move-plan' : 'moved',
      target: relFromRoot(absPath),
      dest: legacyRel
    });
  }
}

function ensureSourceMetadata(methodName, versionName, toolEntry) {
  if (!toolEntry?.path) return { changed: false };
  const base = toolEntry.path.split('/').pop();
  if (!base || !sourceRe.test(base)) return { changed: false };
  const expectedPath = toPosix(
    ['tools', 'UNFCCC', 'Forestry', methodName, versionName, base].join('/')
  );
  const absSource = join(toolsRoot, methodName, versionName, base);
  if (!existsSync(absSource)) {
    console.warn(`[migrate] source file missing for ${methodName}@${versionName}: ${base}`);
    return { changed: false };
  }
  const { sha, bytes } = fingerprintFile(absSource);
  let changed = false;
  if (toolEntry.path !== expectedPath) {
    toolEntry.path = expectedPath;
    changed = true;
  }
  if (toolEntry.sha256 !== sha) {
    toolEntry.sha256 = sha;
    changed = true;
  }
  if ('size' in toolEntry && toolEntry.size !== bytes) {
    toolEntry.size = bytes;
    changed = true;
  } else if (!('size' in toolEntry)) {
    toolEntry.size = bytes;
    changed = true;
  }
  if ('bytes' in toolEntry && toolEntry.bytes !== bytes) {
    toolEntry.bytes = bytes;
    changed = true;
  }
  return { changed };
}

function rewriteToolReference(toolEntry, activeMaps) {
  if (!toolEntry?.path) return { changed: false };
  const base = toolEntry.path.split('/').pop();
  if (!base || sourceRe.test(base)) return { changed: false };
  const lower = base.toLowerCase();
  let info = activeMaps.byName.get(lower);
  if (!info && toolEntry.sha256) {
    info = activeMaps.bySha.get(toolEntry.sha256);
  }
  if (!info) return { changed: false };
  let changed = false;
  if (toolEntry.path !== info.relPath) {
    toolEntry.path = info.relPath;
    changed = true;
  }
  if (toolEntry.sha256 !== info.sha) {
    toolEntry.sha256 = info.sha;
    changed = true;
  }
  if ('size' in toolEntry && toolEntry.size !== info.bytes) {
    toolEntry.size = info.bytes;
    changed = true;
  } else if (!('size' in toolEntry)) {
    toolEntry.size = info.bytes;
    changed = true;
  }
  if ('bytes' in toolEntry && toolEntry.bytes !== info.bytes) {
    toolEntry.bytes = info.bytes;
    changed = true;
  }
  return { changed };
}

function migrateMethodologyMeta(methodName, versionName, activeMaps, actions) {
  const metaPath = join(methodologiesRoot, methodName, versionName, 'META.json');
  if (!existsSync(metaPath)) return;
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const tools = meta?.references?.tools;
  if (!Array.isArray(tools) || !tools.length) return;
  let changed = false;
  for (const entry of tools) {
    const sourceResult = ensureSourceMetadata(methodName, versionName, entry);
    if (sourceResult.changed) {
      changed = true;
      continue;
    }
    const result = rewriteToolReference(entry, activeMaps);
    if (result.changed) {
      changed = true;
    }
  }
  if (changed) {
    if (dryRun) {
      actions.push({ type: 'meta', target: relFromRoot(metaPath) });
    } else {
      writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
      actions.push({ type: 'meta-updated', target: relFromRoot(metaPath) });
    }
  }
}

function processMethodology(methodName) {
  const methodToolsPath = join(toolsRoot, methodName);
  const versions = readdirSync(methodToolsPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && versionRe.test(entry.name))
    .map(entry => entry.name);
  if (!versions.length) return [];
  const active = pickActiveVersion(versions);
  if (!active) return [];
  const actions = [];
  const activeDir = join(methodToolsPath, active.name);
  const activeMaps = readActiveFiles(activeDir);

  for (const version of versions) {
    if (version !== active.name) {
      consolidateTools(methodName, version, activeDir, activeMaps, actions);
      migrateMethodologyMeta(methodName, version, activeMaps, actions);
    } else {
      migrateMethodologyMeta(methodName, version, activeMaps, actions);
    }
  }
  return actions;
}

function main() {
  const methods = readdirSync(toolsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  let totalActions = 0;
  for (const methodName of methods) {
    const actions = processMethodology(methodName);
    totalActions += actions.length;
    for (const action of actions) {
      const label = dryRun ? 'would' : 'did';
      if (action.type === 'dedupe' || action.type === 'deduped') {
        console.log(
          `[migrate:${label}] remove redundant file ${action.target} (already in ${action.dest})`
        );
      } else if (action.type === 'move-plan' || action.type === 'moved') {
        console.log(
          `[migrate:${label}] move ${action.target} -> ${action.dest}`
        );
      } else if (action.type === 'meta') {
        console.log(`[migrate:${label}] update META ${action.target}`);
      } else if (action.type === 'meta-updated') {
        console.log(`[migrate] updated META ${action.target}`);
      }
    }
  }
  if (dryRun) {
    console.log(`[migrate] dry-run complete (${totalActions} actions).`);
  } else {
    console.log(`[migrate] migration complete (${totalActions} actions).`);
  }
}

main();
