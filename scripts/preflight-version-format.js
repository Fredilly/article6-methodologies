#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  isLooseVersionTag,
  isPadded,
} = require("../core/versioning");

const TARGET_DIRS = ["methodologies", "tools", "source-assets"];
const TOKEN_RX = /v\d+(?:-\d+)+/g;
const REPORT_TIMESTAMP = "1970-01-01T00:00:00Z";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getOption(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

const strict = hasFlag("--strict");
const writeReportPath = getOption("--write-report", null);
const scopeFilter = getOption("--scope", null);
const root = path.resolve(getOption("--root", "."));

function walkTree(start, visitor) {
  if (!fs.existsSync(start)) return;
  const entries = fs.readdirSync(start, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const entry of entries) {
    const full = path.join(start, entry.name);
    visitor(full, entry);
    if (entry.isDirectory()) {
      walkTree(full, visitor);
    }
  }
}

function inScope(relPath) {
  if (!scopeFilter) return true;
  return relPath.includes(scopeFilter);
}

function scanVersionDirs() {
  const result = { zero_padded: [], unpadded: [] };
  for (const rel of TARGET_DIRS) {
    const base = path.join(root, rel);
    walkTree(base, (absPath, entry) => {
      if (!entry.isDirectory()) return;
      const name = entry.name;
      if (!isLooseVersionTag(name)) return;
      const relPath = path.relative(root, absPath).split(path.sep).join("/");
      if (!inScope(relPath)) return;
      if (isPadded(name)) result.zero_padded.push(relPath);
      else result.unpadded.push(relPath);
    });
  }
  result.zero_padded.sort();
  result.unpadded.sort();
  return result;
}

function addToken(summaryMap, token, filePath) {
  const info = summaryMap.get(token) || { count: 0, paths: new Set() };
  info.count += 1;
  if (info.paths.size < 5) {
    info.paths.add(filePath);
  }
  summaryMap.set(token, info);
}

function scanJsonTokens() {
  const zeroMap = new Map();
  const cleanMap = new Map();
  const jsonRoot = path.join(root, "methodologies");
  if (fs.existsSync(jsonRoot)) {
    walkTree(jsonRoot, (absPath, entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".json")) return;
      const filePath = absPath;
      let text;
      try {
        text = fs.readFileSync(filePath, "utf8");
      } catch {
        return;
      }
      const relPath = path.relative(root, filePath).split(path.sep).join("/");
      if (!inScope(relPath)) return;
      let match;
      while ((match = TOKEN_RX.exec(text))) {
        const token = match[0];
        if (!isLooseVersionTag(token)) continue;
        if (isPadded(token)) addToken(zeroMap, token, relPath);
        else addToken(cleanMap, token, relPath);
      }
    });
  }

  const mapToArray = (map) =>
    Array.from(map.entries())
      .map(([token, info]) => ({
        token,
        count: info.count,
        sample_paths: Array.from(info.paths).sort(),
      }))
      .sort((a, b) => a.token.localeCompare(b.token));

  return {
    zero_padded: mapToArray(zeroMap),
    unpadded: mapToArray(cleanMap),
  };
}

function writeReport(reportPath, data) {
  const resolved = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function main() {
  const dirScan = scanVersionDirs();
  const jsonTokenScan = scanJsonTokens();
  const report = {
    generated_at: REPORT_TIMESTAMP,
    dir_scan: dirScan,
    json_token_scan: jsonTokenScan,
    notes: {
      dir_scan_targets: TARGET_DIRS,
      token_regex: "v\\d+(?:-\\d+)+",
    },
  };

  if (writeReportPath) {
    writeReport(writeReportPath, report);
    console.log(`[preflight-version-format] wrote report to ${writeReportPath}`);
  }

  const zeroDirs = dirScan.zero_padded.length;
  const zeroTokens = jsonTokenScan.zero_padded.reduce(
    (sum, entry) => sum + entry.count,
    0
  );

  if (zeroDirs === 0 && zeroTokens === 0) {
    console.log("[preflight-version-format] no zero-padded versions detected");
  } else {
    console.warn(
      `[preflight-version-format] Found ${zeroDirs} zero-padded directories and ${zeroTokens} zero-padded JSON tokens`
    );
    dirScan.zero_padded.slice(0, 10).forEach((dir) =>
      console.warn(`  dir: ${dir}`)
    );
    jsonTokenScan.zero_padded.slice(0, 10).forEach((entry) =>
      console.warn(
        `  token: ${entry.token} (count=${entry.count}) e.g., ${entry.sample_paths[0]}`
      )
    );
  }

  if (strict && (zeroDirs > 0 || zeroTokens > 0)) {
    console.error(
      "[preflight-version-format] Strict mode: zero-padded versions present"
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
