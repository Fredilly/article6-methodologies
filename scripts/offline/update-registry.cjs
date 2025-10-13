const fs = require('fs');
const { loadBatch } = require('./read-batch.cjs');

function readJSON(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function main(batchPath) {
  const registry = readJSON('registry.json') || { methods: [] };
  const batch = loadBatch(batchPath);

  for (const entry of batch.methods) {
    const sector = entry.sector || 'Unknown';
    const node = {
      id: entry.id,
      version: entry.version,
      sector,
      path: `methodologies/UNFCCC/${sector}/${entry.id}/${entry.version}`,
    };
    const idx = registry.methods.findIndex((m) => m.id === node.id && m.version === node.version);
    if (idx === -1) {
      registry.methods.push(node);
    } else {
      registry.methods[idx] = node;
    }
  }

  registry.methods.sort((a, b) => (a.id + a.version).localeCompare(b.id + b.version));
  writeJSON('registry.json', registry);
  console.log('[ok] registry.json updated');
}

if (require.main === module) {
  const batchPath = process.argv[2] || 'offline_drop/batch.yml';
  main(batchPath);
}
