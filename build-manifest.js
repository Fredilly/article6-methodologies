#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");

const ROOT = process.cwd();
const METHODOLOGIES_DIR = path.join(ROOT, "methodologies");
const OUTPUT_PATH = path.join(ROOT, "outputs", "mvp", "manifest.index.json");
const APP_MANIFEST_PATH = path.join(ROOT, "..", "app.article6", "public", "manifest", "index.json");

async function collectRuleFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRuleFiles(full)));
    } else if (entry.isFile() && entry.name === "rules.json") {
      files.push(full);
    }
  }

  return files;
}

function formatRule(rule, filePath) {
  const relativeDir = path.relative(METHODOLOGIES_DIR, path.dirname(filePath));
  const segments = relativeDir.split(path.sep);
  const version = segments.pop() ?? "unknown";
  const methodology = segments.pop() ?? "unknown";
  const family = segments.join("/");

  const ruleText =
    typeof rule.rule === "string"
      ? rule.rule
      : typeof rule.text === "string"
      ? rule.text
      : "";

  return {
    ...rule,
    rule: ruleText,
    methodology,
    version,
    family,
    source: path.join("methodologies", relativeDir, "rules.json"),
    tags: Array.isArray(rule.tags) ? rule.tags : [],
    pdfId: typeof rule.pdfId === "string" ? rule.pdfId : "",
    anchor: typeof rule.anchor === "string" ? rule.anchor : "",
    sha256: typeof rule.sha256 === "string" ? rule.sha256 : "",
  };
}

async function main() {
  const files = await collectRuleFiles(METHODOLOGIES_DIR);
  const aggregate = [];

  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn("Skipping invalid JSON:", file, error.message);
      continue;
    }

    const rules = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.rules)
      ? parsed.rules
      : [];

    for (const rule of rules) {
      if (rule && typeof rule === "object") {
        aggregate.push(formatRule(rule, file));
      }
    }
  }

  const serialized = JSON.stringify(aggregate, null, 2);

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.mkdir(path.dirname(APP_MANIFEST_PATH), { recursive: true });

  await fs.writeFile(OUTPUT_PATH, serialized);
  await fs.writeFile(APP_MANIFEST_PATH, serialized);

  console.log(`Wrote ${aggregate.length} rules`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
