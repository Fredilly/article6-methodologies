#!/usr/bin/env python3
import glob
import json
import os
import re
import sys

HEAD = re.compile(r'^(?:\d+(?:\.\d+)*\s+)?([A-Z][A-Za-z ,/()\-]{3,})$', re.M)


def load_txt(directory):
  blobs = []
  txt_dir = os.path.join(directory, 'txt')
  for path in sorted(glob.glob(os.path.join(txt_dir, '*.txt'))):
    with open(path, 'r', errors='ignore') as handle:
      blobs.append(handle.read())
  return '\n\n'.join(blobs)


def to_sections(text):
  matches = list(HEAD.finditer(text))
  out = []
  if not matches:
    return [{
      'id': 'S.1',
      'title': 'Document',
      'anchors': [],
      'content': text[:200000].strip()
    }]
  for idx, match in enumerate(matches):
    title = match.group(0).strip()
    start = match.end()
    end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
    body = text[start:end].strip()
    if body:
      out.append({
        'id': f'S.{len(out) + 1}',
        'title': title,
        'anchors': [],
        'content': body
      })
  return out


def main(directory):
  txt = load_txt(directory)
  if not txt:
    print(f"[err] No TXT in {directory}/txt; supply TXT or enable vendor pdf2txt", file=sys.stderr)
    sys.exit(2)
  sections = {'sections': to_sections(txt)}
  out_path = os.path.join(directory, 'sections.rich.json')
  with open(out_path, 'w') as handle:
    json.dump(sections, handle, indent=2, ensure_ascii=False)
    handle.write('\n')
  print('[ok] sections.rich.json')


if __name__ == '__main__':
  main(sys.argv[1])
