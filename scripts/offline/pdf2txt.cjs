// Binary-free PDF→TXT shim. Vendors can drop pdfjs-dist/pdf-parse under vendor/npm/ later.
const fs = require('fs');
const path = require('path');

const USE_VENDOR = process.env.USE_VENDOR === '1';
let pdfParse = null;

if (USE_VENDOR) {
  try {
    pdfParse = require(path.resolve('vendor/npm/pdf-parse/dist/pdf-parse/cjs/index.cjs'));
  } catch (err) {
    console.error('[warn] pdf-parse vendor not found; supply TXT or disable USE_VENDOR');
    process.exit(2);
  }
}

async function convertOne(pdf, outTxt) {
  if (!USE_VENDOR) {
    throw new Error('TXT required (no pdf parser vendored). Provide offline txt or set USE_VENDOR=1 with vendor/npm/pdf-parse present.');
  }
  const data = await pdfParse(fs.readFileSync(pdf));
  fs.mkdirSync(path.dirname(outTxt), { recursive: true });
  fs.writeFileSync(outTxt, data.text || '');
}

async function main(dir) {
  const pdfDir = path.join(dir, 'pdfs');
  const txtDir = path.join(dir, 'txt');
  if (!fs.existsSync(pdfDir)) return;
  for (const file of fs.readdirSync(pdfDir)) {
    if (!file.toLowerCase().endsWith('.pdf')) continue;
    const pdf = path.join(pdfDir, file);
    const txt = path.join(txtDir, file.replace(/\.pdf$/i, '.txt'));
    if (!fs.existsSync(txt)) {
      await convertOne(pdf, txt);
      console.log('[ok] txt:', txt);
    }
  }
}

if (require.main === module) {
  const dir = process.argv[2];
  main(dir).catch((err) => {
    console.error('[err] pdf2txt:', err.message);
    process.exit(2);
  });
}
