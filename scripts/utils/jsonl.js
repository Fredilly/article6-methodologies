#!/usr/bin/env node
const fs = require('fs');

function writeJSONL(filePath, records) {
  const fd = fs.openSync(filePath, 'w');
  try {
    for (const rec of records) {
      // Ensure deterministic key order by constructing objects in fixed order upstream.
      const line = JSON.stringify(rec);
      fs.writeSync(fd, line + '\n', null, 'utf8');
    }
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { writeJSONL };

