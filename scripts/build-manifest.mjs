import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import glob from "glob";
import crypto from "node:crypto";

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
  const [, provider, category, methodology, version] = m;
  const rules = Array.isArray(json.rules) ? json.rules : [];
  for (const r of rules) {
    const id = r.id || r.rule_id || null;
    const ruleTxt = typeof r.rule === "string" ? r.rule : JSON.stringify(r.rule ?? "");
    const sha256 = crypto.createHash("sha256").update(ruleTxt).digest("hex");
    entries.push({
      provider,
      category,
      methodology,
      version,
      rule_id: id,
      rule: ruleTxt,
      path: file,
      sha256,
      tags: Array.isArray(r.tags) ? r.tags : []
    });
  }
}
if (!existsSync("manifest")) mkdirSync("manifest", { recursive: true });
writeFileSync("manifest/index.json", JSON.stringify(entries, null, 2));
console.log(`wrote manifest/index.json with ${entries.length} entries`);
