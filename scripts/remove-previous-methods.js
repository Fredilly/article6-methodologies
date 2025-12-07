const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node remove-previous-methods.js <file1> <file2> ...');
  process.exit(1);
}
files.forEach((filePath) => {
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Object.prototype.hasOwnProperty.call(json, 'previous_methods')) {
    delete json.previous_methods;
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
    console.log(`[updated] ${filePath}`);
  } else {
    console.log(`[skipped] ${filePath} (no previous_methods)`);
  }
});
