import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEW_SCRIPT = path.join(REPO_ROOT, 'scripts', 'root-cause-new.cjs');
const INDEX_SCRIPT = path.join(REPO_ROOT, 'scripts', 'gen-root-cause-index.mjs');
const INDEX_PATH = path.join(REPO_ROOT, 'docs', 'projects', 'phase-1-ingestion', 'ROOT_CAUSE_INDEX.md');

function run(cmd, args, opts = {}) {
  const res = childProcess.spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const stderr = (res.stderr || '').trim();
    throw new Error(stderr || `Command failed: ${cmd} ${args.join(' ')}`);
  }
  return res;
}

function findCreatedPath(stdout) {
  const match = stdout.match(
    /docs\/projects\/phase-1-ingestion\/root-causes\/RC-\d{8}-\d{6}\.md/g
  );
  if (!match || match.length === 0) return null;
  return match[0];
}

async function main() {
  const title = 'Smoke: root-cause:new one-shot';
  let createdRelPath = null;
  try {
    const res = run(process.execPath, [NEW_SCRIPT, '--title', title], { cwd: REPO_ROOT });
    createdRelPath = findCreatedPath(res.stdout || '');
    if (!createdRelPath) {
      throw new Error('Unable to detect created RC file path from root-cause:new output');
    }

    const createdAbsPath = path.join(REPO_ROOT, createdRelPath);
    if (!fs.existsSync(createdAbsPath)) {
      throw new Error(`Expected RC file to exist: ${createdRelPath}`);
    }

    const indexText = fs.readFileSync(INDEX_PATH, 'utf8');
    if (!indexText.includes(title)) {
      throw new Error(`Expected index to include title: ${title}`);
    }

    process.stdout.write(`[smoke] ok: created ${createdRelPath}\n`);
    process.stdout.write('[smoke] ok: index includes entry\n');
  } finally {
    if (createdRelPath) {
      const createdAbsPath = path.join(REPO_ROOT, createdRelPath);
      try {
        fs.unlinkSync(createdAbsPath);
      } catch {
        // ignore
      }
      try {
        run(process.execPath, [INDEX_SCRIPT], { cwd: REPO_ROOT, stdio: 'inherit' });
      } catch {
        // ignore
      }
    }
  }
}

await main();

