#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const PROJECT_ROOT = path.join(__dirname, "..");
const DOCS_ROOT = path.join(PROJECT_ROOT, "docs/projects/phase-1-ingestion");
const ROOT_CAUSE_DIR = path.join(DOCS_ROOT, "root-causes");
const INDEX_GENERATOR_PATH = path.join(PROJECT_ROOT, "scripts/gen-root-cause-index.mjs");

function pad(num) {
  return String(num).padStart(2, "0");
}

function buildTimestamp() {
  const now = new Date();
  const parts = {
    year: now.getUTCFullYear(),
    month: pad(now.getUTCMonth() + 1),
    day: pad(now.getUTCDate()),
    hour: pad(now.getUTCHours()),
    minute: pad(now.getUTCMinutes()),
    second: pad(now.getUTCSeconds()),
  };

  return {
    id: `RC-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`,
    displayDate: `${parts.year}-${parts.month}-${parts.day}`,
    displayTime: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function ensurePrereqs() {
  fs.mkdirSync(ROOT_CAUSE_DIR, { recursive: true });
}

function parseArgs(argv) {
  const out = {
    title: undefined,
    area: undefined,
    tags: undefined,
    symptom: undefined,
    impact: undefined,
    rootCause: undefined,
    fix: undefined,
    invariants: undefined,
    proof: undefined,
    followUps: undefined,
    index: true,
    help: false,
  };

  const args = argv.slice();
  while (args.length > 0) {
    const token = args.shift();
    if (!token) continue;

    if (token === "--help" || token === "-h") {
      out.help = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(
        `Unexpected positional argument: ${token}\n\nUse --title \"...\" (required). See --help.`
      );
    }

    const eqIdx = token.indexOf("=");
    const key = eqIdx === -1 ? token.slice(2) : token.slice(2, eqIdx);
    const inlineValue = eqIdx === -1 ? undefined : token.slice(eqIdx + 1);

    if (key === "no-index") {
      out.index = false;
      continue;
    }

    if (key === "index") {
      out.index = true;
      continue;
    }

    const needsValue = [
      "title",
      "area",
      "tags",
      "symptom",
      "impact",
      "root-cause",
      "fix",
      "invariants",
      "proof",
      "follow-ups",
    ];
    if (!needsValue.includes(key)) {
      throw new Error(`Unknown option: --${key}\n\nSee --help.`);
    }

    const value =
      inlineValue !== undefined ? inlineValue : args.length > 0 ? args.shift() : undefined;
    if (value === undefined || String(value).trim() === "") {
      throw new Error(`Missing value for --${key}\n\nSee --help.`);
    }

    const normalized = String(value).trim();
    if (key === "title") out.title = normalized;
    else if (key === "area") out.area = normalized;
    else if (key === "tags") out.tags = normalized;
    else if (key === "symptom") out.symptom = normalized;
    else if (key === "impact") out.impact = normalized;
    else if (key === "root-cause") out.rootCause = normalized;
    else if (key === "fix") out.fix = normalized;
    else if (key === "invariants") out.invariants = normalized;
    else if (key === "proof") out.proof = normalized;
    else if (key === "follow-ups") out.followUps = normalized;
  }

  return out;
}

function formatTags(tagsArg) {
  const tags = String(tagsArg)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length === 0) return null;
  return `Tags: [${tags.join(", ")}]`;
}

function buildEntryMarkdown({
  rcId,
  title,
  date,
  area,
  tagsLine,
  symptom,
  impact,
  rootCause,
  fix,
  invariants,
  proof,
  followUps,
}) {
  const lines = [];

  lines.push(`# ${rcId} — ${title}`);
  lines.push(`- Date: ${date}`);
  if (area) lines.push(`- Area: ${area}`);
  if (tagsLine) lines.push(tagsLine);
  lines.push("");

  const sections = [
    { heading: "Symptom", body: symptom },
    { heading: "Impact", body: impact },
    { heading: "Root cause", body: rootCause },
    { heading: "Fix", body: fix },
    { heading: "New invariants / guardrails", body: invariants },
    { heading: "Proof / tests", body: proof },
    { heading: "Follow-ups", body: followUps },
  ];

  for (const section of sections) {
    if (!section.body) continue;
    lines.push(`## ${section.heading}`);
    lines.push(section.body);
    lines.push("");
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}

function runIndexGenerator() {
  const res = childProcess.spawnSync(process.execPath, [INDEX_GENERATOR_PATH], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error("root-cause:index failed");
}

function printHelp() {
  const msg = `
Usage:
  npm run root-cause:new -- --title "Short title" [options]

Options:
  --title        (required) Short incident title
  --area         (optional) Area/subsystem (e.g., ingest, registry, pdf)
  --tags         (optional) Comma-separated tags (e.g., "pdf, determinism")
  --symptom      (optional) Markdown text
  --impact       (optional) Markdown text
  --root-cause   (optional) Markdown text
  --fix          (optional) Markdown text
  --invariants   (optional) Markdown text
  --proof        (optional) Markdown text
  --follow-ups   (optional) Markdown text
  --no-index     (optional) Skip running root-cause:index (default runs it)
  --help, -h     Show this help
`.trimStart();
  process.stdout.write(msg);
}

function main() {
  try {
    ensurePrereqs();
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      return;
    }
    if (!args.title) {
      throw new Error('Missing required flag: --title\n\nSee --help.');
    }

    const { id, displayDate } = buildTimestamp();
    const relativePath = path.join(
      "docs/projects/phase-1-ingestion/root-causes",
      `${id}.md`
    );
    const filePath = path.join(PROJECT_ROOT, relativePath);

    if (fs.existsSync(filePath)) {
      throw new Error(`Refusing to overwrite existing RC file at ${relativePath}`);
    }

    const tagsLine = args.tags ? formatTags(args.tags) : null;
    const markdown = buildEntryMarkdown({
      rcId: id,
      title: args.title,
      date: displayDate,
      area: args.area,
      tagsLine,
      symptom: args.symptom,
      impact: args.impact,
      rootCause: args.rootCause,
      fix: args.fix,
      invariants: args.invariants,
      proof: args.proof,
      followUps: args.followUps,
    });

    fs.writeFileSync(filePath, markdown, { encoding: "utf8", flag: "wx" });

    process.stdout.write(`${relativePath}\n`);

    let indexRan = false;
    try {
      if (args.index) {
        runIndexGenerator();
        indexRan = true;
      }
    } catch (err) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore
      }
      throw err;
    }

    process.stdout.write("\nNext steps:\n");
    process.stdout.write(`- Review/edit: ${relativePath}\n`);
    if (!indexRan) process.stdout.write("- Regenerate index: npm run root-cause:index\n");
    process.stdout.write("- Commit when ready\n");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
