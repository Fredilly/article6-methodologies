'use strict';

const fs = require('fs');
const path = require('path');

const durations = [];
const WINDOW_SIZE = Number(process.env.ENGINE_METRICS_WINDOW || 200) || 200;
const LOG_PATH = process.env.ENGINE_METRICS_LOG ? path.resolve(process.env.ENGINE_METRICS_LOG) : null;
let total = 0;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const idx = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[idx];
}

function recordRequest(durationMs) {
  total += 1;
  durations.push(durationMs);
  if (durations.length > WINDOW_SIZE) durations.shift();

  const p95 = percentile(durations, 95);
  const line = `[engine] requests=${total} p95_ms=${p95.toFixed(2)}`;
  console.log(line);

  if (LOG_PATH) {
    const entry = `${new Date().toISOString()} ${line}\n`;
    fs.appendFile(LOG_PATH, entry, (err) => {
      if (err) console.warn('[engine] metrics log append failed', err.message || err);
    });
  }
}

module.exports = { recordRequest };
