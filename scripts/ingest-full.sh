#!/usr/bin/env bash
set -euo pipefail

# This script implements the full ingestion pipeline for a single PDF.
# It's a starting point for the "Unified Ingestion Command" from the checklist.

# --- Configuration ---
# The PDF to process.
PDF_PATH="staging/meth_booklet.pdf"
# The output directory for the methodology.
METHODOLOGY_DIR="methodologies/UNFCCC/Booklet/v1"
# The directory for the text files.
TXT_DIR="$METHODOLOGY_DIR/txt"
# The directory for the PDF files.
PDFS_DIR="$METHODOLOGY_DIR/pdfs"

# --- Setup ---
echo "[+] Setting up directories..."
mkdir -p "$TXT_DIR"
mkdir -p "$PDFS_DIR"

# Copy the PDF to the methodology's pdfs directory.
cp "$PDF_PATH" "$PDFS_DIR/source.pdf"

# --- Pipeline ---
echo "[+] Running ingestion pipeline..."

# 1. Convert PDF to text.
echo "[1/4] Converting PDF to text..."
node scripts/offline/pdf2txt.cjs "$METHODOLOGY_DIR"

# 2. Extract rich sections.
echo "[2/4] Extracting rich sections..."
python3 scripts/py/extract_sections.py "$METHODOLOGY_DIR"

# 3. Extract rich rules.
echo "[3/4] Extracting rich rules..."
python3 scripts/py/extract_rules.py "$METHODOLOGY_DIR"

# 4. Derive lean JSON.
echo "[4/4] Deriving lean JSON..."
node scripts/derive-lean-from-rich.js "$METHODOLOGY_DIR"

echo "[+] Done."
