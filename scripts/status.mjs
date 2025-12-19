#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

function usage(exitCode = 0) {
  const out = exitCode === 0 ? process.stdout : process.stderr;
  out.write(["Usage:", "  npm run status [-- --write-now]", ""].join("\n"));
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = { writeNow: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--write-now") {
      opts.writeNow = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") usage(0);
    throw new Error(`unknown arg: ${arg}`);
  }
  return opts;
}

function git(args, { cwd }) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function gitTry(args, { cwd }) {
  try {
    return { ok: true, value: git(args, { cwd }) };
  } catch {
    return { ok: false, value: "" };
  }
}

async function readWorkstate(repoRoot) {
  const wsPath = process.env.WORKSTATE_FILE
    ? path.resolve(process.cwd(), process.env.WORKSTATE_FILE)
    : path.join(repoRoot, ".article6", "workstate.json");
  try {
    const raw = await fs.readFile(wsPath, "utf8");
    const obj = JSON.parse(raw);
    return { ok: true, path: wsPath, obj };
  } catch {
    return { ok: false, path: wsPath, obj: null };
  }
}

function suggestedNext({ dirty, workstate }) {
  if (dirty) return "git status -sb  # then commit + push";
  if (workstate?.task && String(workstate.task).startsWith("ingest")) {
    return "npm run validate:rich && npm run validate:lean";
  }
  const scope = workstate?.scope ? String(workstate.scope) : "";
  if (scope.endsWith(".yml") || scope.endsWith(".yaml")) {
    return `npm run ingest:scoped:idempotent -- ${scope}`;
  }
  return "npm run ingest:scoped:idempotent -- <your-scope>.yml";
}

function formatUpstream({ repoRoot, branch }) {
  const u = gitTry(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: repoRoot });
  if (!u.ok) return `${branch} (no upstream)`;
  const counts = gitTry(["rev-list", "--left-right", "--count", `HEAD...${u.value}`], { cwd: repoRoot });
  if (!counts.ok) return `${branch} (upstream ${u.value})`;
  const [aheadStr, behindStr] = counts.value.split(/\s+/);
  const ahead = Number(aheadStr ?? "0");
  const behind = Number(behindStr ?? "0");
  return `${branch} (upstream ${u.value}, ahead ${ahead}, behind ${behind})`;
}

function nowMd({ repoRoot, summaryLines }) {
  const header = "# NOW\n";
  const body = summaryLines.map((l) => `- ${l}`).join("\n") + "\n";
  return header + body;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = git(["rev-parse", "--show-toplevel"], { cwd: process.cwd() });

  const repoName = path.basename(repoRoot);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot });
  const headSha = git(["rev-parse", "HEAD"], { cwd: repoRoot });
  const headShort = headSha.slice(0, 7);

  const porcelain = gitTry(["status", "--porcelain=v1"], { cwd: repoRoot }).value;
  const changedCount = porcelain.length === 0 ? 0 : porcelain.split("\n").filter(Boolean).length;
  const dirty = changedCount > 0;

  const upstreamLine = formatUpstream({ repoRoot, branch });
  const ws = await readWorkstate(repoRoot);

  const lines = [];
  lines.push(`repo: ${repoName}`);
  lines.push(`branch: ${upstreamLine}`);
  lines.push(`head: ${headShort}`);
  lines.push(`tree: ${dirty ? "dirty" : "clean"} (${changedCount} changed)`);

  let workstateSummary = "workstate: none";
  if (ws.ok && ws.obj && typeof ws.obj === "object") {
    const updatedAt = ws.obj.updated_at ? String(ws.obj.updated_at) : "";
    const task = ws.obj.task ? String(ws.obj.task) : "";
    const scope = ws.obj.scope ? String(ws.obj.scope) : "";
    const note = ws.obj.note ? String(ws.obj.note) : "";
    workstateSummary = `workstate: ${updatedAt} task=${task} scope=${scope}${note ? ` note=${note}` : ""}`;
  }
  lines.push(workstateSummary);

  const next = suggestedNext({ dirty, workstate: ws.ok ? ws.obj : null });
  lines.push(`next: ${next}`);

  for (const line of lines) process.stdout.write(`[status] ${line}\n`);

  if (opts.writeNow) {
    const nowPath = path.join(repoRoot, "NOW.md");
    const content = nowMd({ repoRoot, summaryLines: lines });
    const nowLines = content.split("\n").filter(Boolean);
    if (nowLines.length > 20) {
      throw new Error(`NOW.md would exceed 20 lines (${nowLines.length})`);
    }
    await fs.writeFile(nowPath, content, "utf8");
    process.stdout.write(`[status] wrote NOW.md\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`[status] ERROR ${err.message}\n`);
  process.exit(1);
});

