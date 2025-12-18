#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENTRYPOINT_RE =
  /^https:\/\/cdm\.unfccc\.int\/methodologies\/DB\/[A-Za-z0-9]+\/view\.html$/;

function usage(exitCode = 0) {
  const out = exitCode === 0 ? process.stdout : process.stderr;
  out.write(
    [
      "Usage:",
      "  node scripts/validate-batches.mjs",
      "  node scripts/validate-batches.mjs --codes <path> --links <path>",
      "",
      "Options:",
      "  --codes <path>               Validate a single codes file",
      "  --links <path>               Validate a single links file",
      "  --strict-missing-links       Missing sibling links file is an error",
      "  -h, --help                   Show help",
      "",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    codes: null,
    links: null,
    strictMissingLinks: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--codes") {
      opts.codes = argv[++i] ?? null;
      continue;
    }
    if (arg === "--links") {
      opts.links = argv[++i] ?? null;
      continue;
    }
    if (arg === "--strict-missing-links") {
      opts.strictMissingLinks = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") usage(0);
    throw new Error(`unknown arg: ${arg}`);
  }

  if ((opts.codes && !opts.links) || (!opts.codes && opts.links)) {
    throw new Error("--codes and --links must be provided together");
  }
  if (opts.codes === null && opts.links === null) return opts;
  if (!opts.codes || !opts.links) throw new Error("missing --codes/--links path");

  opts.codes = path.resolve(process.cwd(), opts.codes);
  opts.links = path.resolve(process.cwd(), opts.links);
  return opts;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseListFile(content) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("#"));
}

async function readListFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return parseListFile(content);
}

function validateHttpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (/\s/.test(value)) return false;
  return parsed.protocol === "https:";
}

async function validatePair({ codesPath, linksPath, label }) {
  const codes = await readListFile(codesPath);
  const links = await readListFile(linksPath);

  const n = codes.length;
  if (n <= 0) {
    throw new Error(`${label}: codes file has 0 entries (${path.relative(process.cwd(), codesPath)})`);
  }

  if (links.length < n) {
    throw new Error(
      `${label}: links file has ${links.length} entries, expected >= ${n} (${path.relative(process.cwd(), linksPath)})`,
    );
  }

  for (let i = 0; i < n; i++) {
    const link = links[i];
    if (!ENTRYPOINT_RE.test(link)) {
      throw new Error(
        `${label}: entrypoint link ${i + 1} does not match expected pattern: ${link}`,
      );
    }
  }

  const extras = links.slice(n);
  for (let i = 0; i < extras.length; i++) {
    const link = extras[i];
    if (!validateHttpsUrl(link)) {
      throw new Error(`${label}: extra link ${n + i + 1} is not a valid https URL: ${link}`);
    }
  }

  process.stdout.write(
    `[validate-batches] ${label}: codes=${n} entrypoints=${n} extras=${extras.length}\n`,
  );
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const batchesDir = path.join(repoRoot, "batches");

  const opts = parseArgs(process.argv.slice(2));

  if (opts.codes && opts.links) {
    const label = path.basename(opts.codes).replace(/\.codes\.txt$/, "");
    await validatePair({ codesPath: opts.codes, linksPath: opts.links, label });
    return;
  }

  const entries = await fs.readdir(batchesDir);
  const codeFiles = entries.filter((f) => f.endsWith(".codes.txt")).sort();

  for (const codeFile of codeFiles) {
    const label = codeFile.replace(/\.codes\.txt$/, "");
    const codesPath = path.join(batchesDir, codeFile);
    const linksPath = path.join(batchesDir, `${label}.links.txt`);

    if (!(await fileExists(linksPath))) {
      const msg = `WARN ${label}: missing links file (${path.relative(repoRoot, linksPath)})`;
      if (opts.strictMissingLinks) throw new Error(msg);
      process.stderr.write(`[validate-batches] ${msg}\n`);
      continue;
    }

    await validatePair({ codesPath, linksPath, label });
  }
}

main().catch((err) => {
  process.stderr.write(`[validate-batches] ERROR ${err.message}\n`);
  process.exit(1);
});
