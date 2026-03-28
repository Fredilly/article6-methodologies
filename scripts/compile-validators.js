
// Build standalone CJS validator modules for offline use.
// Output: scripts/validators/{meta,sections,rules}.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const standaloneCode = require('ajv/dist/standalone').default;

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

function listSchemaFiles(dir) {
  const out = [];
  (function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const currentPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) walk(currentPath);
      else if (entry.isFile() && currentPath.endsWith('.schema.json')) out.push(currentPath);
    }
  })(dir);
  return out.sort();
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

function updateSchemaHashRecord() {
  const schemaFiles = listSchemaFiles(path.join(ROOT, 'schemas'));
  const payload = schemaFiles.map((p) => `${p}\n${fs.readFileSync(p, 'utf8')}`).join('\n');
  const digest = crypto.createHash('sha256').update(payload).digest('hex');
  fs.writeFileSync(path.join(OUTDIR, 'schemas.sha256'), `${digest}\n`, 'utf8');
}

fs.mkdirSync(OUTDIR, { recursive: true });

const built = [];
for (const [name, p] of Object.entries(SCHEMAS)) {
  if (fs.existsSync(p)) built.push(buildOne(name, p));
}
updateSchemaHashRecord();

console.log('OK: wrote standalone validators:');
for (const f of built) console.log(' -', path.relative(ROOT, f));
