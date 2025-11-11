"use strict";

const CANONICAL_VERSION_RX = /^v(?:0|[1-9]\d*)-(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*))?$/;
const LOOSE_VERSION_RX = /^v\d+-\d+(?:-\d+)?$/;
const CANONICAL_VERSION_FORMAT = "unpadded";

function splitSegments(tag) {
  return String(tag).slice(1).split("-");
}

function withoutLeadingZeros(segment) {
  const num = Number(segment);
  if (!Number.isFinite(num)) return segment;
  return String(num);
}

function isLooseVersionTag(value) {
  return LOOSE_VERSION_RX.test(String(value || ""));
}

function normalizeVersion(value) {
  const tag = String(value || "");
  if (!isLooseVersionTag(tag)) return tag;
  const normalizedSegments = splitSegments(tag).map(withoutLeadingZeros);
  return `v${normalizedSegments.join("-")}`;
}

function isCanonicalVersionTag(value) {
  return CANONICAL_VERSION_RX.test(String(value || "")) && !isPadded(value);
}

function isPadded(value) {
  if (!isLooseVersionTag(value)) return false;
  return normalizeVersion(value) !== String(value);
}

function parseVersion(value) {
  if (!isLooseVersionTag(value)) return null;
  const [majorRaw, minorRaw, patchRaw] = splitSegments(normalizeVersion(value));
  const major = Number(majorRaw);
  if (!Number.isFinite(major)) return null;
  const minor = minorRaw !== undefined ? Number(minorRaw) : 0;
  if (minorRaw !== undefined && !Number.isFinite(minor)) return null;
  const patch =
    patchRaw !== undefined
      ? Number(patchRaw)
      : null;
  if (patchRaw !== undefined && !Number.isFinite(patch)) return null;
  return { major, minor, patch };
}

function compareVersionTags(a, b) {
  const normA = normalizeVersion(a);
  const normB = normalizeVersion(b);
  const pa = parseVersion(normA);
  const pb = parseVersion(normB);
  if (!pa || !pb) return normA.localeCompare(normB);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  const patchA = pa.patch ?? -1;
  const patchB = pb.patch ?? -1;
  if (patchA !== patchB) return patchA - patchB;
  return normA.localeCompare(normB);
}

module.exports = {
  CANONICAL_VERSION_FORMAT,
  CANONICAL_VERSION_RX,
  LOOSE_VERSION_RX,
  compareVersionTags,
  isCanonicalVersionTag,
  isLooseVersionTag,
  isPadded,
  normalizeVersion,
  parseVersion,
};
