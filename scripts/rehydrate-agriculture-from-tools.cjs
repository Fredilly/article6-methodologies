const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const CODES = ["ACM0010", "AMS-III.D"];

function sha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function listVersions(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^v\d+-\d+$/.test(name))
    .sort();
}

function buildSourcePdfEntry(meta, code, version, assetPath, assetFilePath, assetSha) {
  const existingList = Array.isArray(meta?.provenance?.source_pdfs) ? meta.provenance.source_pdfs : [];
  const existing = existingList.length > 0 ? existingList[0] : {};
  const stat = fs.existsSync(assetFilePath) ? fs.statSync(assetFilePath) : null;
  const entry = {
    doc: existing.doc || `UNFCCC/${code}@${version}`,
    kind: existing.kind || "pdf",
    path: assetPath,
    sha256: assetSha
  };
  if (stat) {
    entry.size = stat.size;
  } else if (existing.size !== undefined) {
    entry.size = existing.size;
  }
  if (existing.url !== undefined) {
    entry.url = existing.url;
  }
  return entry;
}

for (const code of CODES) {
  const toolsRoot = path.join("tools", "UNFCCC", "Agriculture", code);
  const methRoot = path.join("methodologies", "UNFCCC", "Agriculture", code);

  if (!fs.existsSync(toolsRoot) || !fs.existsSync(methRoot)) {
    console.log("skip (missing tools or methodologies):", code);
    continue;
  }

  const versions = listVersions(methRoot);
  if (versions.length === 0) {
    console.log("no methodologies versions under", methRoot);
    continue;
  }

  const activeVer = versions[versions.length - 1];
  const shaByVer = {};

  const assetsRoot = path.join("source-assets", "UNFCCC", "Agriculture", code);
  fs.mkdirSync(assetsRoot, { recursive: true });

  // Copy active version from tools → source-assets
  const activeToolPdf = path.join(toolsRoot, activeVer, "source.pdf");
  if (!fs.existsSync(activeToolPdf)) {
    console.log("missing active tool source.pdf for", code, activeVer);
    continue;
  }
  const activeAssetsDir = path.join(assetsRoot, activeVer);
  fs.mkdirSync(activeAssetsDir, { recursive: true });
  const activeAssetPdf = path.join(activeAssetsDir, "source.pdf");
  fs.copyFileSync(activeToolPdf, activeAssetPdf);
  shaByVer[activeVer] = sha256(activeAssetPdf);
  console.log("rehydrated", code, activeVer, "←", activeToolPdf);

  const activeMethDir = path.join(methRoot, activeVer);
  const activeMetaPath = path.join(activeMethDir, "META.json");
  if (!fs.existsSync(activeMetaPath)) {
    console.log("missing active META for", code, activeVer);
    continue;
  }

  // Derive previous versions from methodologies active dir
  const previousDir = path.join(activeMethDir, "previous");
  let previousVersions = [];
  if (fs.existsSync(previousDir)) {
    previousVersions = fs.readdirSync(previousDir)
      .filter((ver) => fs.existsSync(path.join(previousDir, ver, "META.json")))
      .sort();
  }

  // Copy previous PDFs from tools structure
  for (const prevVer of previousVersions) {
    const toolPrevPdf = path.join(toolsRoot, activeVer, "previous", prevVer, "tools", "source.pdf");
    if (!fs.existsSync(toolPrevPdf)) {
      console.log("missing previous tool source.pdf, skipping:", code, prevVer);
      continue;
    }
    const prevAssetsDir = path.join(assetsRoot, prevVer);
    fs.mkdirSync(prevAssetsDir, { recursive: true });
    const prevAssetPdf = path.join(prevAssetsDir, "source.pdf");
    fs.copyFileSync(toolPrevPdf, prevAssetPdf);
    shaByVer[prevVer] = sha256(prevAssetPdf);
    console.log("rehydrated previous", code, prevVer, "←", toolPrevPdf);
  }

  // Update active META
  const activeMeta = JSON.parse(fs.readFileSync(activeMetaPath, "utf8"));
  if (previousVersions.length > 0) {
    activeMeta.previous_methods = previousVersions;
  }

  const activeAssetPathForMeta = path.join("source-assets", "UNFCCC", "Agriculture", code, activeVer, "source.pdf").replace(/\\/g, "/");
  activeMeta.provenance = activeMeta.provenance || {};
  activeMeta.provenance.source_pdfs = [
    buildSourcePdfEntry(activeMeta, code, activeVer, activeAssetPathForMeta, activeAssetPdf, shaByVer[activeVer])
  ];

  activeMeta.audit_hashes = activeMeta.audit_hashes || {};
  if (shaByVer[activeVer]) {
    activeMeta.audit_hashes.source_pdf_sha256 = shaByVer[activeVer];
  }

  if (Array.isArray(activeMeta.tools)) {
    activeMeta.references = activeMeta.references || {};
    if (!Array.isArray(activeMeta.references.tools) || activeMeta.references.tools.length === 0) {
      activeMeta.references.tools = activeMeta.tools;
    }
    delete activeMeta.tools;
  }

  fs.writeFileSync(activeMetaPath, JSON.stringify(activeMeta, null, 2) + "\n");
  console.log("updated active META:", activeMetaPath);

  // Update previous META
  for (const prevVer of previousVersions) {
    const prevMetaPath = path.join(previousDir, prevVer, "META.json");
    if (!fs.existsSync(prevMetaPath)) {
      console.log("missing previous META, skipping:", code, prevVer);
      continue;
    }

    const prevMeta = JSON.parse(fs.readFileSync(prevMetaPath, "utf8"));
    const prevAssetPathForMeta = path.join("source-assets", "UNFCCC", "Agriculture", code, prevVer, "source.pdf").replace(/\\/g, "/");

    prevMeta.status = "superseded";
    prevMeta.version = prevVer;
    prevMeta.provenance = prevMeta.provenance || {};
    prevMeta.provenance.source_pdfs = [
      buildSourcePdfEntry(prevMeta, code, prevVer, prevAssetPathForMeta, path.join(assetsRoot, prevVer, "source.pdf"), shaByVer[prevVer])
    ];

    prevMeta.audit_hashes = prevMeta.audit_hashes || {};
    if (shaByVer[prevVer]) {
      prevMeta.audit_hashes.source_pdf_sha256 = shaByVer[prevVer];
    }

    delete prevMeta.previous_methods;

    if (Array.isArray(prevMeta.tools)) {
      prevMeta.references = prevMeta.references || {};
      if (!Array.isArray(prevMeta.references.tools) || prevMeta.references.tools.length === 0) {
        prevMeta.references.tools = prevMeta.tools;
      }
      delete prevMeta.tools;
    }

    fs.writeFileSync(prevMetaPath, JSON.stringify(prevMeta, null, 2) + "\n");
    console.log("updated previous META:", prevMetaPath);
  }
}
