#!/usr/bin/env node
import fs from "fs";
import crypto from "crypto";
const p = process.argv[2];
if (!p) { console.error("Usage: node tools/compute-hash.mjs <file>"); process.exit(1); }
const buf = fs.readFileSync(p);
const h = crypto.createHash("sha256").update(buf).digest("hex");
console.log(h);
