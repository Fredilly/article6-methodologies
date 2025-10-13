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


def iter_page_text(pdf):
    pages = []
    for layout in extract_pages(pdf):
        buffer = []
        for element in layout:
            if isinstance(element, LTTextContainer):
                for line in element:
                    if isinstance(line, LTTextLine):
                        text = line.get_text().rstrip("\n")
                        if text.strip():
                            buffer.append(text)
        pages.append("\n".join(buffer))
    return pages


def detect_headings(lines):
    head = re.compile(r"^([0-9]+(?:\.[0-9]+)*)\s+(.+)$")
    ann = re.compile(r"^(Annex|Appendix)\s+[A-Z0-9]+(?:\.|:)?.+$")
    caps = re.compile(r"^[A-Z][A-Z0-9 ,\-–()]{6,}$")
    headings = []
    for index, line in enumerate(lines):
        match = head.match(line)
        title = None
        number = None
        if match and match.group(2).strip():
            number = match.group(1)
            title = match.group(2).strip()
        elif ann.match(line):
            title = line.strip()
        elif caps.match(line) and len(line.split()) >= 2:
            title = line.strip()
        if title:
            headings.append((index, number, title))
    if not headings or headings[0][0] != 0:
        headings = [(0, None, "Prelude")] + headings
    return headings


def build_bounds(pages):
    bounds = []
    total = 0
    for page in pages:
        count = len(page.splitlines())
        bounds.append((total, total + count))
        total += count
    return bounds


def line_to_page(bounds, index):
    for page_number, (start, end) in enumerate(bounds):
        if start <= index < end:
            return page_number + 1
    return max(1, len(bounds))


def slice_sections(lines, headings, bounds):
    sections = []
    for offset, (start, number, title) in enumerate(headings):
        end = headings[offset + 1][0] if offset + 1 < len(headings) else len(lines)
        body = lines[start + 1 : end]
        text = "\n".join(body).strip()
        page_start = line_to_page(bounds, start + 1 if start + 1 < len(lines) else start)
        page_end = line_to_page(bounds, end - 1 if end - 1 >= 0 else start)
        level = 1 if (number is None or "." not in str(number)) else 2
        anchors = [word.lower() for word in re.findall(r"[A-Za-z]{4,}", title)][:3]
        sections.append(
            {
                "id": f"S-{offset + 1}",
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


def classify(text):
    sample = text.lower()
    if "baseline" in sample:
        return "baseline"
    if any(keyword in sample for keyword in ["monitor", "measure", "record", "qa/qc"]):
        return "monitoring"
    if "leakage" in sample:
        return "leakage"
    if any(keyword in sample for keyword in ["additionality", "barrier", "common practice"]):
        return "additionality"
    return "unspecified"


def extract_rules(sections):
    keyword = re.compile(r"\b(shall|must|required|monitor|measure|record|baseline|leakage|additionality)\b", re.IGNORECASE)
    bullet = re.compile(r"^\s*(?:[-\u2022\*]|[0-9]+\.|[a-z]\))\s+")
    rules = []
    counter = 1

    def flush(chunk, section):
        nonlocal counter
        text = chunk.strip()
        if not text or not keyword.search(text):
            return
        rules.append(
            {
                "id": f"R-{section['id']}-{counter:03d}",
                "section_id": section["id"],
                "label": text.split(".")[0][:120],
                "type": classify(text),
                "page": section["page_start"],
                "text": text,
                "citations": [],
                "source": {"pdf": "source.pdf"},
            }
        )
        counter += 1

    for section in sections:
        buffer = []
        lines = section["text"].splitlines()
        for line in lines:
            if bullet.match(line):
                flush(" ".join(buffer), section)
                buffer = [bullet.sub("", line)]
            else:
                buffer.append(line)
                if line.strip().endswith("."):
                    flush(" ".join(buffer), section)
                    buffer = []
        flush(" ".join(buffer), section)
    return rules


def main():
    args = parse_args()
    pages = iter_page_text(args.pdf)
    lines = [value.rstrip() for value in "\n".join(pages).splitlines()]
    headings = detect_headings(lines)
    bounds = build_bounds(pages)
    sections = slice_sections(lines, headings, bounds)
    rules = extract_rules(sections)
    Path(args.out_sections).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out_sections, "w", encoding="utf-8") as handle:
        json.dump(sections, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    with open(args.out_rules, "w", encoding="utf-8") as handle:
        json.dump(rules, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
