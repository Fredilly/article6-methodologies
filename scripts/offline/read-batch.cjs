const fs = require('fs');

function parseYAML(text) {
  const lines = text.split(/\r?\n/);
  const stack = [{ indent: -1, value: {} }];

  function assign(parent, key, val) {
    if (Array.isArray(parent)) {
      parent.push(val);
    } else {
      parent[key] = val;
    }
  }

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^ */)[0].length;
    const trimmed = raw.trim();

    while (stack.length && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    if (!stack.length) {
      throw new Error('invalid indentation structure');
    }

    let parent = stack[stack.length - 1].value;

    if (trimmed.startsWith('- ')) {
      if (!Array.isArray(parent)) {
        throw new Error('expected array scope for list item');
      }
      const item = trimmed.slice(2);
      if (item.includes(': ')) {
        const [key, rest] = item.split(/:\s+/, 2);
        const obj = {};
        obj[key] = rest?.replace(/^"|"$/g, '') ?? '';
        parent.push(obj);
        stack.push({ indent, value: obj });
      } else {
        parent.push(item.replace(/^"|"$/g, ''));
      }
      continue;
    }

    const colon = trimmed.indexOf(':');
    if (colon === -1) {
      throw new Error('unsupported line: ' + trimmed);
    }

    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();
    if (rest === '') {
      const next = {};
      assign(parent, key, next);
      stack.push({ indent, value: next });
    } else if (rest === '|') {
      throw new Error('multiline scalars not supported');
    } else if (rest === '[]') {
      const arr = [];
      assign(parent, key, arr);
      stack.push({ indent, value: arr });
    } else {
      assign(parent, key, rest.replace(/^"|"$/g, ''));
    }
  }

  return stack[0].value;
}

function loadBatch(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const doc = parseYAML(raw);
  if (!doc || !Array.isArray(doc.methods)) {
    throw new Error('batch.yml must define methods[]');
  }
  return doc;
}

if (require.main === module) {
  const file = process.argv[2] || 'offline_drop/batch.yml';
  process.stdout.write(JSON.stringify(loadBatch(file), null, 2));
}

module.exports = { loadBatch };
