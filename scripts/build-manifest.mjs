import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import glob from "glob";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const { normalizeVersion, compareVersionTags } = require("../core/versioning");

const files = glob.sync("methodologies/**/*/rules.json", { nodir: true });
const entries = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    continue;
  }
  const m = file.match(/methodologies\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/rules\.json$/);
  if (!m) continue;
  const [, provider, category, methodology, versionDir] = m;
  const version = normalizeVersion(versionDir);
  const rules = Array.isArray(json.rules) ? json.rules : [];
  rules.forEach((r, idx) => {
    const ruleId =
      (typeof r.id === "string" && r.id) ||
      (typeof r.rule_id === "string" && r.rule_id) ||
      (typeof r.ruleId === "string" && r.ruleId) ||
      (typeof r.section_id === "string" && r.section_id) ||
      `${methodology}.${version}.R-${String(idx + 1).padStart(4, "0")}`;

    const ruleTxt =
      (typeof r.rule === "string" && r.rule) ||
      (typeof r.text === "string" && r.text) ||
      (typeof r.section_title === "string" && r.section_title) ||
      "";

    const tags = Array.isArray(r.tags) ? r.tags.map(tag => String(tag)) : [];
    const pdfId =
      (typeof r.pdfId === "string" && r.pdfId) ||
      (typeof r.pdf_id === "string" && r.pdf_id) ||
      undefined;
    const anchor = typeof r.anchor === "string" ? r.anchor : undefined;
    const sectionId =
      (typeof r.section_id === "string" && r.section_id) ||
      (typeof r.sectionId === "string" && r.sectionId) ||
      undefined;

    const identity = `${methodology}|${version}|${ruleId}|${ruleTxt}`;
    const sha256 = crypto.createHash("sha256").update(identity, "utf8").digest("hex");

    entries.push({
      id: ruleId,
      rule_id: ruleId,
      methodology,
      version,
      rule: ruleTxt,
      tags,
      pdfId,
      anchor,
      sha256,
      provider,
      category,
      path: file,
      sectionId,
    });
  });
}
entries.sort((a, b) => {
  const methodologyCmp = a.methodology.localeCompare(b.methodology);
  if (methodologyCmp !== 0) return methodologyCmp;
  const versionCmp = compareVersionTags(a.version, b.version);
  if (versionCmp !== 0) return versionCmp;
  return a.id.localeCompare(b.id);
});

if (!existsSync("manifest")) mkdirSync("manifest", { recursive: true });
writeFileSync("manifest/index.json", JSON.stringify(entries, null, 2));
console.log(`wrote manifest/index.json with ${entries.length} entries`);
