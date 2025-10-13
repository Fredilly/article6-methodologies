import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { spawnSync } from "child_process";
import { createHash } from "crypto";

const INGEST_FILE = process.env.INGEST_FILE || "ingest.yml";
const DRY_RUN = process.env.DRY_RUN === "1";
const RUN_VALIDATE = (process.env.RUN_VALIDATE ?? "1") === "1";

function readYaml(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`ingest file not found: ${file}`);
  }
  const raw = fs.readFileSync(file, "utf8");
  const data = yaml.load(raw);
  if (!data || typeof data !== "object" || !Array.isArray(data.methods)) {
    throw new Error(`ingest spec missing methods[]: ${file}`);
  }
  return data.methods;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sha256(file) {
  const buf = fs.readFileSync(file);
  return createHash("sha256").update(buf).digest("hex");
}

function runCurl(args, allowFailure = false) {
  const res = spawnSync("curl", args, { encoding: "utf8" });
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || "").trim();
    const msg = detail ? detail : `curl exited with status ${res.status}`;
    if (allowFailure) return { ok: false, message: msg };
    throw new Error(msg);
  }
  return { ok: true };
}

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripTags(str) {
  return str.replace(/<[^>]*>/g, "");
}

function normalizeWhitespace(str) {
  return str.replace(/\s+/g, " ").trim();
}

function extractLinks(html) {
  const links = [];
  const regex = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = decodeEntities(match[2] || match[3] || match[4] || "");
    const inner = decodeEntities(stripTags(match[5] || ""));
    const text = normalizeWhitespace(inner);
    links.push({ text, href });
  }
  return links;
}

function absUrl(pageUrl, href) {
  if (!href) return "";
  if (/^https?:/i.test(href)) return href;
  const base = pageUrl.replace(/\/view\.html$/i, "").replace(/\/+$/, "");
  const rel = href.replace(/^\.\/?/, "");
  return `${base}/${rel}`;
}

function selectTools(links, includes, excludes) {
  const inc = includes.map((s) => s.toLowerCase()).filter(Boolean);
  const exc = excludes.map((s) => s.toLowerCase()).filter(Boolean);
  const isMatch = (text, list) => list.some((needle) => text.includes(needle));
  return links.filter(({ text, href }) => {
    if (!href || !/\.pdf($|\?)/i.test(href)) return false;
    const lowerText = (text || "").toLowerCase();
    if (inc.length && !isMatch(lowerText, inc)) return false;
    if (exc.length && isMatch(lowerText, exc)) return false;
    return Boolean(lowerText);
  });
}

function safeFilename(text) {
  const base = text.replace(/[^a-z0-9_+.\-]+/gi, "-").replace(/^-+|-+$/g, "");
  return base ? `${base}.pdf` : "tool.pdf";
}

function firstPdfLink(links) {
  const pdfs = links.filter((link) => /\.pdf($|\?)/i.test(link.href));
  if (!pdfs.length) return null;
  const preferred = pdfs.find((link) => /methodolog/i.test(link.text));
  return preferred || pdfs[0];
}

const methods = readYaml(INGEST_FILE);
for (const method of methods) {
  const { id, version, sector = "", source_page: sourcePage = "", include_text = [], exclude_text = [] } = method || {};
  if (!id || !version) {
    console.warn(`[warn] skipping entry without id/version: ${JSON.stringify(method)}`);
    continue;
  }
  if (!sourcePage) {
    console.warn(`[warn] ${id} ${version}: missing source_page`);
  }
  const parts = id.split(".");
  const publisher = parts[0];
  const sectorName = parts[1] || "";
  const methodCode = parts.slice(2).join(".");
  if (!publisher || !methodCode) {
    console.warn(`[warn] ${id} ${version}: unexpected id format`);
    continue;
  }
  const destDir = path.join("methodologies", publisher, sectorName || "", methodCode, version);
  const toolsDir = path.join("tools", publisher, methodCode, version);
  ensureDir(destDir);
  ensureDir(toolsDir);

  const pagePath = path.join(toolsDir, "page.html");
  const pdfPath = path.join(toolsDir, "source.pdf");

  if (!DRY_RUN && sourcePage) {
    try {
      const res = runCurl(["-fsSL", sourcePage, "-o", pagePath], true);
      if (!res.ok) {
        console.warn(`[warn] ${id}: failed to fetch page (${res.message})`);
      }
    } catch (error) {
      console.warn(`[warn] ${id}: page fetch error (${error.message})`);
    }
  }

  let html = "";
  try {
    html = fs.readFileSync(pagePath, "utf8");
  } catch {
    html = "";
  }
  const links = html ? extractLinks(html) : [];

  if (!DRY_RUN && links.length) {
    const mainPdf = firstPdfLink(links);
    if (mainPdf) {
      const mainUrl = absUrl(sourcePage, mainPdf.href);
      try {
        const res = runCurl(["-fsSL", mainUrl, "-o", pdfPath], true);
        if (!res.ok) {
          console.warn(`[warn] ${id}: failed to fetch main pdf (${res.message})`);
        }
      } catch (error) {
        console.warn(`[warn] ${id}: main pdf fetch error (${error.message})`);
      }
    } else {
      console.warn(`[warn] ${id}: no PDF links detected on page`);
    }
  }

  const filtered = selectTools(links, include_text, exclude_text);
  if (!DRY_RUN) {
    for (const item of filtered) {
      const fname = safeFilename(item.text);
      const target = path.join(toolsDir, fname);
      const url = absUrl(sourcePage, item.href);
      try {
        const res = runCurl(["-fsSL", url, "-o", target], true);
        if (!res.ok) {
          console.warn(`[warn] ${id}: failed to fetch tool ${fname} (${res.message})`);
        }
      } catch (error) {
        console.warn(`[warn] ${id}: tool fetch error ${fname} (${error.message})`);
      }
    }
  }

  const metaPath = path.join(destDir, "META.json");
  const sectionsPath = path.join(destDir, "sections.json");
  const rulesPath = path.join(destDir, "rules.json");
  const richPath = path.join(destDir, "rules.rich.json");

  if (!DRY_RUN) {
    const references = { tools: [] };
    const sourcePdfEntry = {
      kind: "pdf",
      path: `tools/${publisher}/${methodCode}/${version}/source.pdf`,
    };
    if (fs.existsSync(pdfPath)) {
      sourcePdfEntry.sha256 = sha256(pdfPath);
    }
    const meta = {
      id,
      version,
      sector,
      source_page: sourcePage,
      status: "draft",
      audit: {
        created_at: new Date().toISOString(),
        created_by: "scripts/node/ingest.mjs",
      },
      references,
      provenance: {
        source_pdfs: [sourcePdfEntry],
      },
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
    if (!fs.existsSync(sectionsPath)) {
      fs.writeFileSync(sectionsPath, JSON.stringify({ sections: [] }, null, 2) + "\n");
    }
    if (!fs.existsSync(rulesPath)) {
      fs.writeFileSync(rulesPath, JSON.stringify({ rules: [] }, null, 2) + "\n");
    }
    if (!fs.existsSync(richPath)) {
      fs.writeFileSync(richPath, "[]\n");
    }
  }

  console.log(`[done] ${id} ${version}`);
}

if (RUN_VALIDATE) {
  const res = spawnSync("./scripts/json-canonical-check.sh", ["--fix"], { stdio: "inherit" });
  if (res.status !== 0) {
    console.warn(`[warn] json-canonical-check exited with ${res.status}`);
  }
}

console.log("✅ ingest.mjs complete");
