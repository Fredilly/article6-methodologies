#!/usr/bin/env node
import fs from "fs";
const a = process.argv[2];
const b = process.argv[3];
if (!a || !b) { console.error("Usage: node tools/assert-equal.mjs <actual.json> <expected.json>"); process.exit(1); }
const ja = JSON.parse(fs.readFileSync(a, "utf8"));
const jb = JSON.parse(fs.readFileSync(b, "utf8"));
const stable = (v) => JSON.stringify(v, Object.keys(v).sort(), 2);
if (stable(ja) !== stable(jb)) { console.error("JSON mismatch:", a, b); process.exit(1); }
console.log("OK:", a, "matches", b);
