#!/usr/bin/env node
// Apply bundle.files.json → write files exactly, create directories, set exec bits for tools/*.mjs
import fs from "fs";
import path from "path";

const bundlePath = process.argv[2] || "bundle.files.json";
if (!fs.existsSync(bundlePath)) {
  console.error(`Bundle not found at ${bundlePath}`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
if (!data.files || typeof data.files !== "object") {
  console.error("Invalid bundle: missing 'files' object");
  process.exit(1);
}

for (const [p, content] of Object.entries(data.files)) {
  const full = path.join(process.cwd(), p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const body = Array.isArray(content) ? content.join("\n") : String(content);
  fs.writeFileSync(full, body, "utf8");
  // mark executable scripts
  if (p.startsWith("tools/") && p.endsWith(".mjs")) {
    try { fs.chmodSync(full, 0o755); } catch {}
  }
  console.log("WROTE", p);
}
console.log("DONE");
