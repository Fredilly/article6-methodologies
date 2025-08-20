#!/usr/bin/env node
// Stub generator to enforce deterministic output shape for tests
import fs from "fs";
import crypto from "crypto";

const inPath = process.argv[2];
if (!inPath) { console.error("Usage: node tools/generate-report.mjs <geojson>"); process.exit(1); }
const geo = fs.readFileSync(inPath, "utf8");
const inputs_hash = crypto.createHash("sha256").update(geo).digest("hex");

const out = {
  contract: "compliance-report.v1",
  methodology_id: "AR-AMS0007",
  inputs_hash,
  summary: { status: "WARN", area_ha: 0, risk_score: 0 },
  findings: []
};
process.stdout.write(JSON.stringify(out, null, 2));
