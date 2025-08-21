#!/usr/bin/env node
const fs = require('fs'); const crypto = require('crypto');
const p = process.argv[2]; const d = fs.readFileSync(p);
const h = crypto.createHash('sha256').update(d).digest('hex');
console.log(h);
