#!/usr/bin/env python3
"""
Generate sections.rich.json and rules.rich.json for a methodology directory.

Inputs:
  - <methodology dir>/txt/source.txt (text extracted from PDF)
  - <methodology dir>/META.json (for id/version)

Outputs:
  - sections.rich.json (array of sections with id/title/content)
  - rules.rich.json    (array of rules with summaries anchored to sections)

Heuristics:
  * Removes high-frequency header/footer lines.
  * Detects headings via numbering, roman numerals, uppercase ratio, or keywords.
  * Aggregates remaining lines into sections.
  * Extracts candidate rules from lines containing modal verbs (shall/must/should/etc).
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Tuple

HEADER_THRESHOLD = 5
MIN_RULE_LEN = 25


@dataclass
class SectionDraft:
  title: str
  start_line: int
  content: List[str]

  def finalize(self, section_id: str) -> Tuple[dict, Tuple[int, int, str]]:
    text = "\n".join(self.content).strip()
    if not text:
      raise ValueError("empty section")
    section = {
      "id": section_id,
      "title": normalize_spaces(self.title),
      "content": text,
    }
    return section


def normalize_spaces(text: str) -> str:
  return re.sub(r"\s+", " ", text.strip())


def preprocess(text: str) -> Tuple[List[str], dict]:
  text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\f", "\n")
  lines = text.split("\n")
  freq = {}
  for line in lines:
    key = line.strip()
    if key:
      freq[key] = freq.get(key, 0) + 1
  return lines, freq


def heading_ratio(line: str) -> float:
  letters = [c for c in line if c.isalpha()]
  if not letters:
    return 0.0
  return sum(1 for c in letters if c.isupper()) / len(letters)


def looks_like_heading(line: str, freq: dict) -> bool:
  stripped = line.strip()
  if not stripped:
    return False
  if freq.get(stripped, 0) > HEADER_THRESHOLD:
    return False
  if re.match(r"^(?:[IVXLCDM]+|\d+(?:\.\d+)*)[).:\s-]+", stripped):
    return True
  if stripped.endswith(":") and len(stripped) <= 100:
    return True
  ratio = heading_ratio(stripped)
  if ratio >= 0.65 and len(stripped) <= 80:
    return True
  keywords = {
    "scope",
    "applicability",
    "definitions",
    "monitoring",
    "baseline",
    "project boundary",
    "leakage",
    "data and parameters",
    "equations",
    "annexes",
  }
  if stripped.lower() in keywords:
    return True
  return False


def build_sections(lines: List[str], freq: dict) -> Tuple[List[dict], List[Tuple[int, int, str]]]:
  sections: List[dict] = []
  ranges: List[Tuple[int, int, str]] = []
  current_title: str | None = None
  content: List[str] = []
  start_line = 0
  counter = 0

  def flush(end_line: int) -> None:
    nonlocal current_title, content, counter, start_line
    if current_title is None:
      return
    text = "\n".join(content).strip()
    if not text:
      current_title = None
      content = []
      return
    counter += 1
    section_id = f"S-{counter}"
    sections.append({"id": section_id, "title": normalize_spaces(current_title), "content": text})
    ranges.append((start_line, end_line, section_id))
    current_title = None
    content = []

  for idx, raw in enumerate(lines):
    stripped = raw.strip()
    if not stripped:
      if content:
        content.append("")
      continue
    if freq.get(stripped, 0) > HEADER_THRESHOLD:
      continue
    if looks_like_heading(raw, freq):
      flush(idx)
      current_title = raw.strip()
      start_line = idx
      content = []
      continue
    if current_title is None:
      current_title = "Document"
      start_line = idx
      content = []
    content.append(stripped)

  flush(len(lines))

  if not sections:
    body = "\n".join(line for line in lines if line.strip()).strip()
    if body:
      sections.append({"id": "S-1", "title": "Document", "content": body})
      ranges.append((0, len(lines), "S-1"))

  # Merge adjacent sections with identical titles
  merged_sections: List[dict] = []
  merged_ranges: List[Tuple[int, int, str]] = []
  for section, span in zip(sections, ranges):
    if merged_sections and merged_sections[-1]["title"] == section["title"]:
      merged_sections[-1]["content"] += "\n" + section["content"]
      start, _, sid = merged_ranges[-1]
      merged_ranges[-1] = (start, span[1], sid)
    else:
      merged_sections.append(section)
      merged_ranges.append(span)

  return merged_sections, merged_ranges


def section_for_line(line_idx: int, spans: Iterable[Tuple[int, int, str]]) -> str:
  for start, end, sid in spans:
    if start <= line_idx < end:
      return sid
  first = next(iter(spans), None)
  return first[2] if first else "S-1"


RULE_RE = re.compile(r"\b(shall|must|should|required|required to|shall not|must not)\b", re.I)


def extract_rules(
  lines: List[str],
  spans: List[Tuple[int, int, str]],
  method_id: str,
  version: str,
) -> List[dict]:
  rules: List[dict] = []
  seen = set()
  per_section_counter: dict[str, int] = {}

  for idx, line in enumerate(lines):
    stripped = line.strip()
    if len(stripped) < MIN_RULE_LEN:
      continue
    if RULE_RE.search(stripped):
      logic = normalize_spaces(stripped)
      if logic in seen:
        continue
      seen.add(logic)
      section_id = section_for_line(idx, spans)
      per_section_counter.setdefault(section_id, 0)
      per_section_counter[section_id] += 1
      suffix = section_id.split("-", 1)[1] if "-" in section_id else section_id
      rule_id = f"{method_id}.{version}.R-{suffix}-{per_section_counter[section_id]:04d}"
      rules.append(
        {
          "id": rule_id,
          "type": "requirement",
          "summary": logic[:280],
          "logic": logic,
          "refs": {"sections": [section_id]},
          "tags": ["requirement"],
        }
      )

  if not rules:
    default = spans[0][2] if spans else "S-1"
    rules.append(
      {
        "id": f"{method_id}.{version}.R-0-0001",
        "type": "note",
        "summary": "Document-level review pending",
        "logic": "Document-level review pending",
        "refs": {"sections": [default]},
        "tags": ["todo"],
      }
    )
  return rules


def main() -> None:
  if len(sys.argv) != 2:
    print("Usage: python generate_rich_from_txt.py <methodology_dir>", file=sys.stderr)
    sys.exit(2)

  target = Path(sys.argv[1]).resolve()
  meta = json.loads((target / "META.json").read_text("utf-8"))
  method_id = meta["id"]
  version = meta["version"]
  text = (target / "txt" / "source.txt").read_text("utf-8", errors="ignore")

  lines, freq = preprocess(text)
  sections, spans = build_sections(lines, freq)
  rules = extract_rules(lines, spans, method_id, version)

  (target / "sections.rich.json").write_text(json.dumps(sections, indent=2, ensure_ascii=False) + "\n", "utf-8")
  (target / "rules.rich.json").write_text(json.dumps(rules, indent=2, ensure_ascii=False) + "\n", "utf-8")


if __name__ == "__main__":
  main()
