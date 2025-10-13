#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path

from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextContainer, LTTextLine


def parse_args():
  parser = argparse.ArgumentParser()
  parser.add_argument("--pdf", required=True)
  parser.add_argument("--out-sections", required=True)
  parser.add_argument("--out-rules", required=True)
  return parser.parse_args()


def iter_page_text(pdf_path):
  pages = []
  for page_layout in extract_pages(pdf_path):
    buf = []
    for element in page_layout:
      if isinstance(element, LTTextContainer):
        for line in element:
          if isinstance(line, LTTextLine):
            txt = line.get_text().rstrip("\n")
            if txt.strip():
              buf.append(txt)
    pages.append("\n".join(buf))
  return pages


def detect_headings(lines):
  head_pat = re.compile(r"^([0-9]+(?:\.[0-9]+)*)\s+(.+)$")
  ann_pat = re.compile(r"^(Annex|Appendix)\s+[A-Z0-9]+(?:\.|:)?.+$")
  caps_pat = re.compile(r"^[A-Z][A-Z0-9 ,\-–()]{6,}$")

  heads = []
  for idx, line in enumerate(lines):
    match = head_pat.match(line)
    title = None
    number = None
    if match and match.group(2).strip():
      number = match.group(1)
      title = match.group(2).strip()
    elif ann_pat.match(line):
      title = line.strip()
    elif caps_pat.match(line) and len(line.split()) >= 2:
      title = line.strip()
    if title:
      heads.append((idx, number, title))
  if not heads or heads[0][0] != 0:
    heads = [(0, None, "Prelude")] + heads
  return heads


def build_page_index(pages):
  bounds = []
  total = 0
  for page in pages:
    count = len(page.splitlines())
    bounds.append((total, total + count))
    total += count
  return bounds


def line_to_page(bounds, line_index):
  for idx, (start, end) in enumerate(bounds):
    if start <= line_index < end:
      return idx + 1
  return max(1, len(bounds))


def slice_sections(lines, headings, bounds):
  sections = []
  for idx, (start_idx, number, title) in enumerate(headings):
    end_idx = headings[idx + 1][0] if idx + 1 < len(headings) else len(lines)
    body_lines = lines[start_idx + 1 : end_idx]
    text = "\n".join(body_lines).strip()
    page_start = line_to_page(bounds, start_idx + 1 if start_idx + 1 < len(lines) else start_idx)
    page_end = line_to_page(bounds, end_idx - 1 if end_idx - 1 >= 0 else start_idx)
    section_id = f"S-{idx + 1}"
    level = 1
    if number:
      level = 1 if "." not in number else 2
    anchors = [w.lower() for w in re.findall(r"[A-Za-z]{4,}", title)][:3]
    sections.append(
      {
        "id": section_id,
        "number": number,
        "title": title,
        "level": level,
        "page_start": page_start,
        "page_end": page_end,
        "text": text,
        "anchors": anchors,
      }
    )
  return sections


def classify_rule(text):
  lowered = text.lower()
  if "baseline" in lowered:
    return "baseline"
  if any(word in lowered for word in ["monitor", "measure", "record", "qa/qc"]):
    return "monitoring"
  if "leakage" in lowered:
    return "leakage"
  if any(word in lowered for word in ["additionality", "barrier", "common practice"]):
    return "additionality"
  return "unspecified"


def extract_rules(sections):
  rule_kw = re.compile(
    r"\b(shall|must|shall not|required|at least|monitor|measure|record|calculate|baseline|leakage|additionality)\b",
    re.IGNORECASE,
  )
  bullet_pat = re.compile(r"^\s*(?:[-\u2022\*]|[0-9]+\.|[a-z]\))\s+")

  rules = []
  counter = 1
  for section in sections:
    buffer = []
    lines = section["text"].splitlines()

    def flush(chunk):
      nonlocal counter
      text = chunk.strip()
      if not text:
        return
      if not rule_kw.search(text):
        return
      rules.append(
        {
          "id": f"R-{section['id']}-{counter:03d}",
          "section_id": section["id"],
          "label": text.split(".")[0][:120],
          "type": classify_rule(text),
          "page": section["page_start"],
          "text": text,
          "citations": [],
          "source": {"pdf": "pdfs/methodology.pdf"},
        }
      )
      counter += 1

    for line in lines:
      if bullet_pat.match(line):
        flush(" ".join(buffer))
        buffer = [bullet_pat.sub("", line)]
      else:
        buffer.append(line)
        if line.strip().endswith("."):
          flush(" ".join(buffer))
          buffer = []
    flush(" ".join(buffer))
  return rules


def write_json(path, payload):
  Path(path).parent.mkdir(parents=True, exist_ok=True)
  with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
    handle.write("\n")


def main():
  args = parse_args()
  pages = iter_page_text(args.pdf)
  lines = [line.rstrip() for line in "\n".join(pages).splitlines()]
  headings = detect_headings(lines)
  bounds = build_page_index(pages)
  sections = slice_sections(lines, headings, bounds)
  rules = extract_rules(sections)
  write_json(args.out_sections, sections)
  write_json(args.out_rules, rules)


if __name__ == "__main__":
  main()
