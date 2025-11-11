"use strict";

const assert = require("node:assert");
const {
  normalizeVersion,
  isPadded,
  parseVersion,
  compareVersionTags,
} = require("../core/versioning");

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`✓ ${name}\n`);
  } catch (err) {
    process.stderr.write(`✖ ${name}\n`);
    throw err;
  }
}

test("normalizeVersion strips leading zeros and is idempotent", () => {
  assert.strictEqual(normalizeVersion("v03-01"), "v3-1");
  assert.strictEqual(normalizeVersion("v3-1"), "v3-1");
});

test("isPadded detects padded versions only", () => {
  assert.strictEqual(isPadded("v01-0"), true);
  assert.strictEqual(isPadded("v1-0"), false);
});

test("parseVersion returns numeric segments", () => {
  assert.deepStrictEqual(parseVersion("v03-02-1"), { major: 3, minor: 2, patch: 1 });
  assert.deepStrictEqual(parseVersion("v2-5"), { major: 2, minor: 5, patch: null });
});

test("compareVersionTags sorts numerically", () => {
  const values = ["v02-0", "v1-2", "v01-1", "v2-0", "v2-0-1"];
  const sorted = values.slice().sort(compareVersionTags);
  assert.deepStrictEqual(sorted, ["v01-1", "v1-2", "v02-0", "v2-0", "v2-0-1"]);
});

console.log("versioning tests passed");
