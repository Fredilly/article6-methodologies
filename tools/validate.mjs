#!/usr/bin/env node
import fs from "fs";
import path from "path";
import Ajv from "ajv";
const ajv = new Ajv({allErrors:true});
const load = (p)=>JSON.parse(fs.readFileSync(p,"utf8"));
const root = process.cwd();

const rulesSchema = load(path.join(root,"schema/rules.schema.json"));
const metaSchema  = load(path.join(root,"schema/meta.schema.json"));

const entries = load(path.join(root,"registry/registry.json")).methodologies;
for (const m of entries) {
  const rules = load(path.join(root, m.paths.rules));
  const meta  = load(path.join(root, m.paths.meta));

  const vr = ajv.compile(rulesSchema)(rules);
  if (!vr) { console.error("RULES INVALID:", m.id, ajv.errorsText(ajv.errors)); process.exit(1); }

  const vm = ajv.compile(metaSchema)(meta);
  if (!vm) { console.error("META INVALID:", m.id, ajv.errorsText(ajv.errors)); process.exit(1); }
}
console.log("OK: schemas valid");
