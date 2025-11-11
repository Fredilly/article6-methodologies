# **`markup.md` — Stage‑1 Links‑Only Ingest (v1, PA \+ SSC \+ A/R) with `codes.txt`**

## **🎯 Goal**

I will provide **either** a `*.codes.txt` (method codes) **or** a `*.links.txt` (method page URLs). You (Codex) will do everything else, **idempotently**:

* Fetch HTML → find **primary PDF** and **only tools actually referenced** on that page (exclude “Word version”, clarifications, EB/meeting reports).

* Save PDFs to **versioned** locations (`source-assets/.../<Method>/<vXX-X>/source.pdf`) and `tools/UNFCCC/common/*.pdf`.

* Generate **batch `ingest.yml`** (assets‑only).

* Emit **`META.json`** per version with `status`, `validity` dates, `sectoral_scope`.

* Maintain **`registry.json`** roll‑up of versions (active/superseded).

* Run **ingest → derive‑lean → validate → hash → PR**.

New in v1 (upgrade): an optional **discover** step that can take **method codes** and/or **approved index pages (PA, SSC, A/R)** and produce the `*.links.txt` automatically. The existing pages→assets pipeline stays the same.

---

## **🧾 What I provide (choose one)**

### **Option A — `*.codes.txt` (recommended for repeatability)**

A text file with **one code per line** (case‑insensitive, e.g., `ACM0010`, `AM0073`, `AMS-III.D`, `AR-AMS0007`).

**Example** — `batches/2025-10-17.codes.txt`

ACM0010  
AM0073  
AMS-III.D  
AMS-III.R  
AMS-III.A  
AMS-III.AU  
AMS-III.BE  
AR-AMS0007

### **Option B — `*.links.txt` (manual list)**

A text file with **one absolute URL per line** pointing to **UNFCCC method pages** (active or old) or specific version pages (`/view.html`).

**Example** — `batches/2025-10-17.links.txt`

https://cdm.unfccc.int/methodologies/DB/Q8EMKMK67G1XIUKJFED8EVFL2VH1SN  
https://cdm.unfccc.int/methodologies/DB/66DCX9DCDE8UFYYIHJEY5NRPAA8WNE/view.html  
https://cdm.unfccc.int/methodologies/DB/H9DVSB24O7GEZQYLYNWUX23YS6G4RC

### **(Optional) Index URLs (Codex can also start from these)**

* PA (Large‑scale): `https://cdm.unfccc.int/methodologies/PAmethodologies/approved.html`

* SSC (Small‑scale): `https://cdm.unfccc.int/methodologies/SSCmethodologies/approved.html`

* A/R (Forestry): `https://cdm.unfccc.int/methodologies/ARmethodologies/approved.html`

---

## **🚀 One‑time setup (Codex do this)**

git checkout \-b feat/ingest-links-stage1-$(date \+%Y%m%d-%H%M%S)

\# Git LFS for PDFs  
git lfs install  
git lfs track "\*.pdf"  
echo "\*.pdf filter=lfs diff=lfs merge=lfs \-text" \>\> .gitattributes

\# Folders  
mkdir \-p tools/UNFCCC/common  
mkdir \-p source-assets/UNFCCC/{Forestry,Agriculture,Energy,Industry,Transport,Waste,Household,Other}  
mkdir \-p batches templates scripts

\# Reference template (shape stays stable)  
cat \> templates/ingest.template.yml \<\<'YAML'  
version: 2  
methods:  
  \- id: EXAMPLE.REPLACE.METHOD  
    version: v0-0  
    sector: Example  
    source\_page: "https://example.invalid"  
    assets:  
      primary: "source-assets/UNFCCC/Example/METHOD/v0-0/source.pdf"  
      tools: \[\]  
    include\_text: \[\]  
    exclude\_text: \[\]  
YAML

---

## **🧠 Add the discoverer (codes/index → links.txt)**

Create `scripts/discover-unfccc.js` (this **adds** discovery; it does **not** replace `ingest-from-pages.js`).

\#\!/usr/bin/env node  
/\*\*  
 \* Usage examples:  
 \*   node scripts/discover-unfccc.js \--codes ACM0010 AM0073 AMS-III.D AR-AMS0007 \> batches/$(date \+%F).links.txt  
 \*   node scripts/discover-unfccc.js \--index https://cdm.unfccc.int/methodologies/PAmethodologies/approved.html \> batches/$(date \+%F).links.txt  
 \*   node scripts/discover-unfccc.js \--index https://cdm.unfccc.int/methodologies/SSCmethodologies/approved.html \--index https://cdm.unfccc.int/methodologies/ARmethodologies/approved.html \> batches/$(date \+%F).links.txt  
 \*  
 \* What it does:  
 \* \- From codes: resolve each code to its official method page, then harvest the current PDF and all “Previous versions” links.  
 \* \- From index pages: collect all method pages listed, then do the same harvest.  
 \* \- Output absolute URLs (one per line), deduped; skip Word/clarifications/EB/meetings.  
 \*/  
import { get as httpsGet } from "https";  
import { get as httpGet } from "http";

const argv \= process.argv.slice(2);  
const codes \= \[\];  
const indexUrls \= \[\];  
for (let i \= 0; i \< argv.length; i++) {  
  if (argv\[i\] \=== "--codes") {  
    while (argv\[i+1\] && \!argv\[i+1\].startsWith("--")) codes.push(argv\[++i\]);  
  } else if (argv\[i\] \=== "--index" && argv\[i+1\]) {  
    indexUrls.push(argv\[++i\]);  
  }  
}  
if (\!codes.length && \!indexUrls.length) {  
  console.error("Usage: \--codes \<ACM0010 ...\> and/or \--index \<approved.html URLs\>");  
  process.exit(1);  
}

const fetchText \= (url) \=\> new Promise((resolve, reject) \=\> {  
  const mod \= url.startsWith("https") ? httpsGet : httpGet;  
  mod(url, (res) \=\> {  
    if (res.statusCode \>= 300 && res.statusCode \< 400 && res.headers.location) {  
      const redir \= new URL(res.headers.location, url).toString();  
      return fetchText(redir).then(resolve, reject);  
    }  
    if (res.statusCode \!== 200\) return reject(new Error(\`HTTP ${res.statusCode} for ${url}\`));  
    let data \= ""; res.setEncoding("utf8");  
    res.on("data", c \=\> data \+= c); res.on("end", () \=\> resolve(data));  
  }).on("error", reject);  
});

const abs \= (base, href) \=\> href.startsWith("http") ? href : new URL(href, base).toString();  
const isPDF \= (href) \=\> /\\.pdf(\\?|$)/i.test(href);  
const isWord \= (txt) \=\> /word version/i.test(txt || "");  
const isClar \= (txt, href) \=\> /clarification|SSC\[\\\_\\s-\]\*\\d+|Panel\\/WG|meeting report|EB report/i.test(\`${txt||""} ${href||""}\`);

const anchors \= (html, base) \=\> {  
  const list \= \[\];  
  if (\!html) return list;  
  for (const m of html.matchAll(/\<a\[^\>\]+href=\["'\](\[^"'\]+)\["'\]\[^\>\]\*\>(.\*?)\<\\/a\>/gis)) {  
    const href \= abs(base, m\[1\]);  
    const text \= (m\[2\]||"").replace(/\<\[^\>\]+\>/g," ").replace(/\\s+/g," ").trim();  
    list.push({ href, text });  
  }  
  return list;  
};

const looksLikeMethodPage \= (a) \=\>  
  /\\/methodologies\\/DB\\/\[A-Z0-9\]{24,}\\/?$/i.test(a.href) ||  
  /\\/PAmethodologies\\/\[^\\"\]\*\\/view\\.html/i.test(a.href) ||  
  /\\/SSCmethodologies\\/\[^\\"\]\*\\/view\\.html/i.test(a.href) ||  
  /\\/ARmethodologies\\/\[^\\"\]\*\\/view\\.html/i.test(a.href);

const pickMethodPageForCode \= (code, all) \=\> {  
  const byText \= all.find(a \=\> a.text && a.text.includes(code) && looksLikeMethodPage(a));  
  if (byText) return byText.href;  
  const any \= all.find(looksLikeMethodPage);  
  return any?.href || null;  
};

const harvestMethodPage \= async (url) \=\> {  
  const html \= await fetchText(url).catch(()=\>"");  
  const a \= anchors(html, url);

  const pdfs \= a  
    .filter(x \=\> isPDF(x.href) && \!isWord(x.text) && \!isClar(x.text, x.href))  
    .map(x \=\> x.href);

  // “Previous versions” pages (and similar view pages) → pull PDFs from them too  
  const prevPages \= a  
    .filter(x \=\> /previous versions?/i.test(x.text || "") || (/\\/view\\.html/i.test(x.href) && /version/i.test(x.text || "")))  
    .map(x \=\> x.href);

  const morePDFs \= \[\];  
  for (const p of prevPages) {  
    const ph \= await fetchText(p).catch(()=\> "");  
    for (const y of anchors(ph, p)) {  
      if (isPDF(y.href) && \!isWord(y.text) && \!isClar(y.text, y.href)) morePDFs.push(y.href);  
    }  
  }

  // Include older method view pages so the ingest step can resolve their primary PDFs  
  const oldViews \= a  
    .filter(x \=\> /\\/methodologies\\/DB\\/\[A-Z0-9\]{24,}\\/?$/i.test(x.href) || /\\/view\\.html/i.test(x.href))  
    .map(x \=\> x.href);

  return \[...new Set(\[url, ...oldViews, ...pdfs, ...morePDFs\])\];  
};

const defaultIndices \= \[  
  "https://cdm.unfccc.int/methodologies/PAmethodologies/approved.html",  
  "https://cdm.unfccc.int/methodologies/SSCmethodologies/approved.html",  
  "https://cdm.unfccc.int/methodologies/ARmethodologies/approved.html",  
\];

const main \= async () \=\> {  
  const seeds \= indexUrls.length ? indexUrls : defaultIndices;  
  const seedHtmls \= await Promise.all(seeds.map(u \=\> fetchText(u).catch(()=\> "")));  
  const seedAnchors \= seedHtmls.flatMap((html, i) \=\> anchors(html, seeds\[i\]));  
  const out \= new Set();

  for (const code of codes) {  
    const page \= pickMethodPageForCode(code, seedAnchors);  
    if (\!page) { console.error(\`\[warn\] could not resolve page for code ${code}\`); continue; }  
    const links \= await harvestMethodPage(page);  
    links.forEach(u \=\> out.add(u));  
  }

  // Also harvest every method listed on the provided indices  
  for (const a of seedAnchors.filter(looksLikeMethodPage)) {  
    const links \= await harvestMethodPage(a.href);  
    links.forEach(u \=\> out.add(u));  
  }

  const lines \= \[...out\]; lines.sort();  
  process.stdout.write(lines.join("\\n") \+ "\\n");  
};

main().catch(e \=\> { console.error(e); process.exit(1); });

Make it executable:

chmod \+x scripts/discover-unfccc.js

---

## **🔗 Keep pages→assets step (no change)**

* **Do not replace** `scripts/ingest-from-pages.js` — it still consumes your `*.links.txt` and does assets/META/registry.

* If needed, re-use the earlier `ingest-from-pages.js` you already have.

---

## **🟩 Runbook (every batch)**

### **A) Codes‑only flow (recommended)**

\# 1\) Prepare codes  
cat \> batches/$(date \+%F).codes.txt \<\<'CODES'  
ACM0010  
AM0073  
AMS-III.D  
AMS-III.R  
AR-AMS0007  
CODES

\# 2\) Build links.txt from codes (auto‑resolves PA/SSC/A/R \+ Previous Versions)  
node scripts/discover-unfccc.js \\  
  \--codes $(tr '\\n' ' ' \< batches/$(date \+%F).codes.txt) \\  
  \> batches/$(date \+%F).links.txt  
wc \-l batches/$(date \+%F).links.txt

\# 3\) Ingest pages → assets/META/registry  
./scripts/ingest-full.sh batches/$(date \+%F).links.txt batches/$(date \+%F).ingest.yml

\# 4\) Commit \+ PR  
git add batches tools source-assets methodologies registry.json ingest.yml scripts templates .gitattributes  
git commit \-s \-m "feat(ingest): stage-1 links-only (codes→discover→ingest); PDFs, META(status+validity), registry"  
gh pr create \--fill

### **B) Manual links flow**

\# 1\) Provide/curate links file (one URL per line)  
\#    e.g., batches/2025-10-17.links.txt

\# 2\) Ingest  
./scripts/ingest-full.sh batches/2025-10-17.links.txt batches/2025-10-17.ingest.yml

\# 3\) Commit \+ PR (same as above)

---

## **✅ Acceptance checks**

* `batches/*.links.txt` contains deduped **method pages \+ version pages \+ primary PDFs** (absolute URLs, one per line).

* Primary PDFs saved under `source-assets/UNFCCC/<Sector>/<MethodCode>/<vXX-X>/source.pdf`.

* Tools saved under `tools/UNFCCC/common/*.pdf` (no Word/clarifications/meeting reports).

* `methodologies/**/META.json` present with `status`, `validity`, `sectoral_scope`.

* `registry.json` lists versions with correct `status/valid_from/valid_to`.

* Re-running the same inputs yields **no diffs** (idempotent).

---

## **🔒 Rules baked in**

* **Include ALL versions** found (active \+ old). Each version → its own folder; never overwrite.

* **Only include tools actually linked** on that method/version page. Exclude Word, clarifications, EB/meeting reports.

* Keep `ingest.yml` **assets-only**; lifecycle lives in `META.json` \+ `registry.json`.

* Idempotent runs; **dedupe tools globally** by URL; skip download if file exists.

---

## **🔁 Persistent setup for future batches**

Codex, save this entire ingestion workflow as **the default “Article6 Ingest Protocol” (v1)**.

For every new batch I provide, automatically reuse this process without another markup file.

**Inputs supported (any one or a mix):**

* A `.codes.txt` file (**one code per line**, e.g., `ACM0010`, `AM0073`, `AMS-III.D`, `AR-AMS0007`), and/or

* A `.links.txt` file (**one absolute URL per line**), and/or

* Approved index URLs (PA/SSC/A/R).

**Protocol to persist:**

1. **Discovery (optional/automatic):**

   * If a `.codes.txt` is provided (or codes are pasted), run `scripts/discover-unfccc.js --codes ...` to produce `batches/<date>.links.txt`.

   * If index URLs are provided, include them via `--index <url>` (PA, SSC, A/R supported). If none are provided, default to the official PA/SSC/A/R approved indices.

   * The discover step must resolve each code to its **official method page**, expand **“Previous versions”**, emit a deduped links list, and skip Word/clarifications/EB/meetings.

2. **Ingest (pages → assets):** always generate batch `ingest.yml` from the `*.links.txt` using `scripts/ingest-from-pages.js`; auto‑download PDFs (primary \+ on‑page tools only); write `META.json` per version; merge/update `registry.json`.

3. **Validate & finalize:** run `ingest.sh → json-canonical-check.sh → hash-all.sh → ci-run-tests.sh`; create and push PR with a standard commit message; never overwrite existing versions; ensure idempotency.

**Template name to persist:** `Article6-Ingest-LinksOnly-v1`.

**For future runs:**

* When I upload a `.codes.txt` and/or `.links.txt`, apply this protocol end‑to‑end automatically.

* Only ask for confirmation if new tooling or schema fields are added.

* If the protocol changes, save it as `Article6-Ingest-LinksOnly-v<next>` and summarize changes in the PR body.

