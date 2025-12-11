#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");
const DOCS_ROOT = path.join(PROJECT_ROOT, "docs/projects/phase-1-ingestion");
const ROOT_CAUSE_DIR = path.join(DOCS_ROOT, "root-causes");
const LEDGER_PATH = path.join(DOCS_ROOT, "ROOT_CAUSE.md");

function pad(num) {
  return String(num).padStart(2, "0");
}

function buildTimestamp() {
  const now = new Date();
  const parts = {
    year: now.getFullYear(),
    month: pad(now.getMonth() + 1),
    day: pad(now.getDate()),
    hour: pad(now.getHours()),
    minute: pad(now.getMinutes()),
    second: pad(now.getSeconds()),
  };

  return {
    id: `RC-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`,
    displayDate: `${parts.year}-${parts.month}-${parts.day}`,
    displayTime: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function ensurePrereqs() {
  if (!fs.existsSync(LEDGER_PATH)) {
    throw new Error(`Ledger not found at ${LEDGER_PATH}`);
  }

  fs.mkdirSync(ROOT_CAUSE_DIR, { recursive: true });
}

function buildScaffold(rcId, title, displayDate) {
  return `# ${rcId} - ${title}

- **Title:** ${title}
- **Date:** ${displayDate}
- **Owners:** TODO
- **Linked invariant / plan section:** TODO

## Summary
TODO: Describe the failure symptoms and quick fix.

## Root Cause
TODO: Explain what broke and why it was not caught sooner.

## Fix
TODO: Outline the remediation steps, scripts touched, and new tests.

## Follow-up / Tests
- TODO
`;
}

function appendLedgerEntry(line) {
  const existing = fs.readFileSync(LEDGER_PATH, "utf8");
  const needsNewline = existing.endsWith("\n") ? "" : "\n";
  fs.writeFileSync(LEDGER_PATH, `${existing}${needsNewline}${line}\n`);
}

function main() {
  try {
    ensurePrereqs();
    const { id, displayDate, displayTime } = buildTimestamp();
    const titleArg = process.argv.slice(2).join(" ").trim();
    const title = titleArg || "TBD: fill in summary";
    const relativePath = path.join(
      "docs/projects/phase-1-ingestion/root-causes",
      `${id}.md`
    );
    const filePath = path.join(PROJECT_ROOT, relativePath);

    if (fs.existsSync(filePath)) {
      throw new Error(`Refusing to overwrite existing RC file at ${relativePath}`);
    }

    const scaffold = buildScaffold(id, title, displayDate);
    fs.writeFileSync(filePath, scaffold, { encoding: "utf8", flag: "wx" });

    const ledgerLine = `- ${id} | ${displayDate} ${displayTime} | ${title} | ${relativePath}`;
    appendLedgerEntry(ledgerLine);

    process.stdout.write(`${relativePath}\n`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
