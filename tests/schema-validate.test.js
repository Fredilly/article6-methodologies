const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const runAjv = path.join(ROOT, 'scripts', 'run-ajv.sh');
const schema = path.join(ROOT, 'schemas', 'sections.schema.json');
const validFixture = path.join(__dirname, 'fixtures', 'sections.valid.json');
const invalidFixture = path.join(__dirname, 'fixtures', 'sections.invalid.json');

test('valid sections.json passes schema validation', () => {
  execFileSync(runAjv, ['validate', '-s', schema, '-d', validFixture]);
});

test('invalid sections.json fails schema validation', () => {
  assert.throws(() => {
    execFileSync(runAjv, ['validate', '-s', schema, '-d', invalidFixture]);
  });
});
