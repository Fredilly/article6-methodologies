#!/usr/bin/env node
/**
 main
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
 main
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

 main
    }
  }
  return hits;
}

 main
  catch (e) {
    console.error(`✖ ${type}: ${file} — invalid JSON: ${e.message}`);
    failed++; continue;
  }
  const ok = validate(data);
  if (!ok) {
    console.error(`✖ ${type}: ${file}`);
main
      console.error(`  - ${err.instancePath || '(root)'} ${err.message}`);
    }
    failed++;
  } else {
    console.log(`✓ ${type}: ${file} valid`);
  }
}

 main
process.exit(failed ? 1 : 0);
