const fs = require('fs');
const path = require('path');
const { loadBatch } = require('./read-batch.cjs');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing ${src}`);
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function main(batchPath) {
  const batch = loadBatch(batchPath);
  for (const entry of batch.methods) {
    const id = entry.id;
    const version = entry.version;
    const sector = entry.sector || 'Unknown';

    const methodBase = path.join('methodologies', 'UNFCCC', sector, id, version);
    const toolBase = path.join('tools', 'UNFCCC', id, version);

    ensureDir(methodBase);
    ensureDir(path.join(methodBase, 'pdfs'));
    ensureDir(path.join(methodBase, 'txt'));
    ensureDir(toolBase);
    ensureDir(path.join(toolBase, 'txt'));
    ensureDir(path.join(toolBase, 'tools'));
    ensureDir(path.join(toolBase, 'tools', 'txt'));

    for (const pdf of entry.local_pdfs || []) {
      copyFile(pdf, path.join(methodBase, 'pdfs', path.basename(pdf)));
      copyFile(pdf, path.join(toolBase, path.basename(pdf)));
    }
    for (const txt of entry.local_txts || []) {
      copyFile(txt, path.join(methodBase, 'txt', path.basename(txt)));
      copyFile(txt, path.join(toolBase, 'txt', path.basename(txt)));
    }

    if (Array.isArray(entry.tools)) {
      for (const tool of entry.tools) {
        if (tool.pdf) {
          copyFile(tool.pdf, path.join(toolBase, 'tools', path.basename(tool.pdf)));
        }
        if (tool.txt) {
          copyFile(tool.txt, path.join(toolBase, 'tools', 'txt', path.basename(tool.txt)));
        }
      }
    }

    const metaPath = path.join(methodBase, 'META.json');
    if (!fs.existsSync(metaPath)) {
      const meta = {
        id,
        version,
        sector,
        source_page: entry.source_page || null,
        audit_hashes: {},
        references: { tools: [] },
      };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    }
  }
  console.log('[ok] offline prepared');
}

if (require.main === module) {
  const batchPath = process.argv[2] || 'offline_drop/batch.yml';
  main(batchPath);
}
