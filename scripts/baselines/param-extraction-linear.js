#!/usr/bin/env node
/**
 * Strictly-offline linear baseline for parameter/units extraction.
 * - TF-IDF features, one-vs-rest logistic regression (deterministic)
 * - No external deps, fixed epochs/learning rate, stable ordering
 * - Outputs micro-F1 for variables and units
 */
const fs = require('fs');
const path = require('path');

function readJSONL(p){ return fs.readFileSync(p,'utf8').split(/\n/).filter(Boolean).map(l=>JSON.parse(l)); }
function tok(s){ return String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

function buildVocab(train){
  const df = new Map();
  for (const r of train){ const set = new Set(tok(r.text)); for (const t of set) df.set(t,(df.get(t)||0)+1); }
  const vocab = Array.from(df.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  const N = Math.max(1, train.length);
  const idf = new Map(vocab.map(([t,dfi])=>[t, Math.log((N+1)/(dfi+1))+1]));
  const index = new Map(vocab.map(([t],i)=>[t,i]));
  return {idf,index,size:vocab.length};
}

function tfidfVec(text, vocab){
  const counts = new Map(); for (const t of tok(text)) counts.set(t,(counts.get(t)||0)+1);
  const v = new Float64Array(vocab.size);
  for (const [t,c] of counts.entries()){
    const j = vocab.index.get(t); if (j===undefined) continue;
    v[j] = c * (vocab.idf.get(t)||0);
  }
  return v;
}

function dot(a,b){ let s=0; for (let i=0;i<a.length;i++) s += a[i]*b[i]; return s; }

function trainLogRegOVR(train, vocab, labelKey, labels){
  const X = train.map(r=>tfidfVec(r.text, vocab));
  const models = new Map();
  const epochs = 8; // fixed for determinism
  const lr = 0.1;  // fixed
  const l2 = 1e-4; // fixed
  for (const label of labels){
    const w = new Float64Array(vocab.size); let b = 0;
    for (let ep=0; ep<epochs; ep++){
      for (let i=0;i<train.length;i++){
        const y = (train[i][labelKey]||[]).includes(label) ? 1 : 0;
        const x = X[i];
        const z = dot(w,x) + b;
        const p = 1 / (1 + Math.exp(-z));
        const err = p - y;
        // gradient step (L2 on w)
        for (let j=0;j<w.length;j++){
          const g = err * x[j] + l2 * w[j];
          w[j] -= lr * g;
        }
        b -= lr * err;
      }
    }
    models.set(label, { w, b });
  }
  return { models };
}

function avgLabelsPerExample(train, key){
  const n = Math.max(1, train.length);
  const s = train.reduce((a,r)=>a+((r[key]||[]).length),0);
  return Math.max(1, Math.round(s/n));
}

function predictOVR(models, labels, v, K){
  const scored = labels.map(l=>{ const m=models.get(l); const s = dot(m.w, v) + m.b; return {l,s}; });
  scored.sort((a,b)=> b.s - a.s || a.l.localeCompare(b.l));
  return scored.slice(0,K).map(x=>x.l);
}

function f1Micro(golds, preds){
  let tp=0, fp=0, fn=0;
  for (let i=0;i<golds.length;i++){
    const G=new Set(golds[i]||[]), P=new Set(preds[i]||[]);
    for (const x of P){ if (G.has(x)) tp++; else fp++; }
    for (const x of G){ if (!P.has(x)) fn++; }
  }
  const prec = tp ? tp/(tp+fp):0; const rec = tp ? tp/(tp+fn):0;
  const f1 = (prec+rec) ? (2*prec*rec)/(prec+rec) : 0;
  return { precision:prec, recall:rec, f1 };
}

function main(){
  const root = path.resolve('datasets/param-extraction/v1');
  const train = readJSONL(path.join(root,'train.jsonl'));
  const val = readJSONL(path.join(root,'val.jsonl'));
  const labels = JSON.parse(fs.readFileSync(path.join(root,'labelspaces.json'),'utf8'));
  const vocab = buildVocab(train);
  const kvar = avgLabelsPerExample(train,'variables');
  const kunit = avgLabelsPerExample(train,'units');

  const varModel = trainLogRegOVR(train, vocab, 'variables', labels.variables);
  const unitModel = trainLogRegOVR(train, vocab, 'units', labels.units);

  const varPred=[], varGold=[]; const unitPred=[], unitGold=[];
  for (const r of val){
    const v = tfidfVec(r.text, vocab);
    varPred.push(predictOVR(varModel.models, labels.variables, v, kvar));
    unitPred.push(predictOVR(unitModel.models, labels.units, v, kunit));
    varGold.push(r.variables||[]); unitGold.push(r.units||[]);
  }
  const mVar = f1Micro(varGold, varPred);
  const mUnit = f1Micro(unitGold, unitPred);
  console.log(`variables microF1=${mVar.f1.toFixed(4)} (P=${mVar.precision.toFixed(4)} R=${mVar.recall.toFixed(4)})`);
  console.log(`units microF1=${mUnit.f1.toFixed(4)} (P=${mUnit.precision.toFixed(4)} R=${mUnit.recall.toFixed(4)})`);
}

if (require.main === module) main();

