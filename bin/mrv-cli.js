#!/usr/bin/env node
/**
 * MRV CLI (strictly offline): query → top rules + refs + hashes.
 *
 * Usage:
 *   mrv-cli "query text" [--k 5] [--root methodologies]
 *
 * Behavior:
 * - Walks under <root> for versioned method dirs; prefers rich rules for refs+summary
 * - Falls back to lean rules.json when needed (no refs.tools then)
 * - Builds deterministic BM25 over rule summaries
 * - Prints top-K with rule id, section(s), summary, refs.tools and their {path,sha256,kind} when found in META
 */
const fs = require('fs');
const path = require('path');

function arg(k, def){ const i = process.argv.indexOf(k); return i>0 ? process.argv[i+1] : def; }
function has(k){ return process.argv.includes(k); }
const query = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
if (!query){
  console.error('Usage: mrv-cli "query text" [--k 5] [--root methodologies]');
  process.exit(2);
}
const K = parseInt(arg('--k','5'),10) || 5;
const ROOT = path.resolve(arg('--root','methodologies'));

function* walk(d){ if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); if (e.isDirectory()) yield* walk(p); else yield p; } }

function loadJSON(p){ try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return null; } }

function buildDocMap(metaPath){
  const meta = loadJSON(metaPath) || {};
  const tools = (((meta||{}).references||{}).tools)||[];
  const m = new Map();
  for (const t of tools){ if (t && t.doc) m.set(String(t.doc), { path: t.path, sha256: t.sha256, kind: t.kind }); }
  return m;
}

function tok(s){ return String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

function collectRules(){
  const rules = [];
  for (const p of walk(ROOT)){
    if (/\/v\d[^/]*\/rules\.rich\.json$/.test(p)){
      const dir = path.dirname(p);
      const metaPath = path.join(dir,'META.json');
      const docMap = buildDocMap(metaPath);
      const arr = loadJSON(p) || [];
      for (const r of arr){
        const txt = String(r.summary || r.logic || '')
        rules.push({
          id: r.id,
          text: txt,
          methodDir: dir,
          sections: (r.refs && Array.isArray(r.refs.sections)) ? r.refs.sections.slice() : [],
          tools: (r.refs && Array.isArray(r.refs.tools)) ? r.refs.tools.slice().sort() : [],
          docMap
        });
      }
    } else if (/\/v\d[^/]*\/rules\.json$/.test(p)){
      const dir = path.dirname(p);
      // Only include lean when rich not present
      if (fs.existsSync(path.join(dir,'rules.rich.json'))) continue;
      const arr = (loadJSON(p)||{}).rules||[];
      for (const r of arr){ rules.push({ id: r.id, text: String(r.text||''), methodDir: dir, sections: [r.section_id], tools: [], docMap: new Map() }); }
    }
  }
  // Deterministic ordering
  rules.sort((a,b)=> String(a.id).localeCompare(String(b.id)));
  return rules;
}

function buildBM25(items){
  const docs = items.map(it => ({ id: it.id, tokens: tok(it.text) }));
  const N = docs.length;
  const df = new Map(); const tf = new Map(); let total=0;
  for (const d of docs){ const tmap=new Map(); for (const t of d.tokens) tmap.set(t,(tmap.get(t)||0)+1); tf.set(d.id,tmap); total+=d.tokens.length; for (const t of new Set(d.tokens)) df.set(t,(df.get(t)||0)+1); }
  const avgdl = total/Math.max(1,N); const k1=1.2,b=0.75;
  function score(query){
    const q = Array.from(new Set(tok(query)));
    const scores = new Map();
    for (const t of q){ const n=df.get(t)||0; if (!n) continue; const idf=Math.log(1+(N-n+0.5)/(n+0.5)); for (const d of docs){ const f=(tf.get(d.id).get(t)||0); if (!f) continue; const denom=f+k1*(1-b+b*(d.tokens.length/avgdl)); const s=idf*(f*(k1+1))/denom; scores.set(d.id,(scores.get(d.id)||0)+s); } }
    return items.map(it=>({ it, s: scores.get(it.id)||0 })).sort((a,b)=> b.s-a.s || a.it.id.localeCompare(b.it.id));
  }
  return { score };
}

function main(){
  const rules = collectRules();
  if (rules.length === 0){ console.error('No rules found under', ROOT); process.exit(1); }
  const bm25 = buildBM25(rules);
  const ranked = bm25.score(query).slice(0, K);
  // Print results
  for (const {it, s} of ranked){
    console.log('—');
    console.log(`id: ${it.id}`);
    if (it.sections && it.sections.length) console.log(`sections: ${it.sections.join(', ')}`);
    console.log(`score: ${s.toFixed(6)}`);
    console.log(`summary: ${it.text}`);
    const refs = (it.tools||[]).map(t => ({ doc: t, meta: it.docMap.get(t) || null }));
    if (refs.length){
      console.log('refs:');
      for (const r of refs){
        if (r.meta) console.log(`  - ${r.doc}  [${r.meta.kind}] ${r.meta.path}  sha256=${r.meta.sha256}`);
        else console.log(`  - ${r.doc}`);
      }
    }
  }
}

if (require.main === module) main();
