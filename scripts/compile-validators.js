
// Build standalone CJS validator modules for offline use.
// Output: scripts/validators/{meta,sections,rules}.cjs
const fs = require('fs');
const path = require('path');

let Ajv, addFormats, standaloneCode;
try {
  Ajv = require('ajv');
  addFormats = require('ajv-formats');
  standaloneCode = require('ajv/dist/standalone').default;
} catch (e) {
  const ROOT_DIR = path.resolve(__dirname, '..');
  const VENDOR = path.join(ROOT_DIR, 'vendor', 'ajv-cli', 'node_modules');
  Ajv = require(path.join(VENDOR, 'ajv'));
  addFormats = require(path.join(VENDOR, 'ajv-formats'));
  standaloneCode = require(path.join(VENDOR, 'ajv', 'dist', 'standalone')).default;
}

const ROOT = path.resolve(__dirname, '..');
const SCHEMAS = {
  meta: path.join(ROOT, 'schemas', 'META.schema.json'),
  sections: path.join(ROOT, 'schemas', 'sections.schema.json'),
  rules: path.join(ROOT, 'schemas', 'rules.schema.json'),
  'sections.rich': path.join(ROOT, 'schemas', 'sections.rich.schema.json'),
  'rules.rich': path.join(ROOT, 'schemas', 'rules.rich.schema.json'),
};
const OUTDIR = path.join(__dirname, 'validators');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function buildOne(name, schemaPath) {
  const ajv = new Ajv({ allErrors: true, code: { source: true, esm: false } });
  addFormats(ajv);
  const schema = readJSON(schemaPath);
  const validate = ajv.compile(schema);
  const mod = standaloneCode(ajv, validate);
  const out = path.join(OUTDIR, `${name}.cjs`);
  fs.writeFileSync(out, mod, 'utf8');
  return out;
}

fs.mkdirSync(OUTDIR, { recursive: true });

const built = [];
for (const [name, p] of Object.entries(SCHEMAS)) {
  if (fs.existsSync(p)) built.push(buildOne(name, p));
}

console.log('OK: wrote standalone validators:');
for (const f of built) console.log(' -', path.relative(ROOT, f));
