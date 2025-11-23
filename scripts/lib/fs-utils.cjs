const fs = require('fs');
const path = require('path');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeFileIfChanged(filePath, data) {
  const payload = typeof data === 'string' ? data : String(data ?? '');
  let existing = null;
  try {
    existing = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (existing === payload) return false;
  ensureDir(filePath);
  fs.writeFileSync(filePath, payload);
  return true;
}

module.exports = {
  writeFileIfChanged,
};
