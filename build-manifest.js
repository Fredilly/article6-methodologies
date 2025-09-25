#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");

const ROOT = process.cwd();
const METHODOLOGIES_DIR = path.join(ROOT, "methodologies");
const OUTPUT_MANIFEST_PATH = path.join(ROOT, "outputs", "mvp", "manifest.index.json");
const APP_MANIFEST_PATH = path.join(ROOT, "..", "app.article6", "public", "manifest", "index.json");

async function collectRules(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const rules = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rules.push(...(await collectRules(fullPath)));
    } else if (entry.isFile() && entry.name === "rules.json") {
      rules.push(fullPath);
    }
  }

  return rules;
}

function enrichRule(rule, filePath) {
  const relativeDir = path.relative(METHODOLOGIES_DIR, path.dirname(filePath));
  const segments = relativeDir.split(path.sep);
  const version = segments.pop() ?? "unknown";
  const methodology = segments.pop() ?? "unknown";
  const family = segments.join("/");

  return {
    ...rule,
    methodology,
    version,
    family,
    source: path.join("methodologies", relativeDir, "rules.json"),
  };
}

async function main() {
  const ruleFiles = await collectRules(METHODOLOGIES_DIR);
  const aggregate = [];

  for (const filePath of ruleFiles) {
    const raw = await fs.readFile(filePath, "utf8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn(`Skipping invalid JSON: ${filePath}`, error);
      continue;
    }

    const rules = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.rules)
      ? parsed.rules
      : [];

    for (const rule of rules) {
      if (rule && typeof rule === "object") {
        aggregate.push(enrichRule(rule, filePath));
      }
    }
  }

  await fs.mkdir(path.dirname(OUTPUT_MANIFEST_PATH), { recursive: true });
  await fs.mkdir(path.dirname(APP_MANIFEST_PATH), { recursive: true });

  const serialized = JSON.stringify(aggregate, null, 2);
  await fs.writeFile(OUTPUT_MANIFEST_PATH, serialized);
  await fs.writeFile(APP_MANIFEST_PATH, serialized);

  console.log(`Wrote ${aggregate.length} rules to:\n - ${OUTPUT_MANIFEST_PATH}\n - ${APP_MANIFEST_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
