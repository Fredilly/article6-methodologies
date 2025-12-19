#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

function usage(exitCode = 0) {
  const out = exitCode === 0 ? process.stdout : process.stderr;
  out.write(
    [
      "Usage:",
      "  node scripts/workstate-update.mjs --task <string> --scope <string> [--note <string>]",
      "",
      "Env:",
      "  WORKSTATE_FILE  Override default .article6/workstate.json",
      "",
    ].join("\n") + "\n",
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = { task: null, scope: null, note: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--task") {
      opts.task = argv[++i] ?? null;
      continue;
    }
    if (arg === "--scope") {
      opts.scope = argv[++i] ?? null;
      continue;
    }
    if (arg === "--note") {
      opts.note = argv[++i] ?? null;
      continue;
    }
    if (arg === "-h" || arg === "--help") usage(0);
    throw new Error(`unknown arg: ${arg}`);
  }
  if (!opts.task) throw new Error("missing --task");
  if (!opts.scope) throw new Error("missing --scope");
  if (opts.note === null) delete opts.note;
  return opts;
}

function git(args, { cwd }) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function main() {
  const repoRoot = git(["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
  const target = process.env.WORKSTATE_FILE
    ? path.resolve(process.cwd(), process.env.WORKSTATE_FILE)
    : path.join(repoRoot, ".article6", "workstate.json");

  const opts = parseArgs(process.argv.slice(2));

  const obj = {
    updated_at: new Date().toISOString(),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot }),
    head_sha: git(["rev-parse", "HEAD"], { cwd: repoRoot }),
    task: opts.task,
    scope: opts.scope,
  };
  if (typeof opts.note === "string" && opts.note.length > 0) obj.note = opts.note;

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(obj, null, 2) + "\n", "utf8");
  process.stdout.write(`[workstate] wrote ${path.relative(repoRoot, target)}\n`);
}

main().catch((err) => {
  process.stderr.write(`[workstate] ERROR ${err.message}\n`);
  process.exit(1);
});

