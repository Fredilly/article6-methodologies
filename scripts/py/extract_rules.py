#!/usr/bin/env python3
import glob
import json
import os
import re
import sys

RULE = re.compile(r'\b(Requirement|Shall|Must|Should|The project proponent shall)\b', re.I)


def load_txt(directory):
  blobs = []
  txt_dir = os.path.join(directory, 'txt')
  for path in sorted(glob.glob(os.path.join(txt_dir, '*.txt'))):
    with open(path, 'r', errors='ignore') as handle:
      blobs.append(handle.read())
  return '\n'.join(blobs)


def to_rules(text):
  rules = []
  for line in text.splitlines():
    snippet = line.strip()
    if not snippet:
      continue
    if RULE.search(snippet):
      rules.append({
        'id': f'R-{len(rules) + 1:04d}',
        'title': snippet[:160],
        'clause': None,
        'requirement': snippet,
        'scope': None,
        'sources': []
      })
  if not rules:
    raise ValueError('no requirement-like sentences detected')
  return rules


def main(directory):
  txt = load_txt(directory)
  if not txt:
    print(f"[err] No TXT in {directory}/txt; supply TXT or enable vendor pdf2txt", file=sys.stderr)
    sys.exit(2)
  try:
    payload = to_rules(txt)
  except ValueError as err:
    print(f"[err] {err}", file=sys.stderr)
    sys.exit(4)
  rules = {'rules': payload}
  out_path = os.path.join(directory, 'rules.rich.json')
  with open(out_path, 'w') as handle:
    json.dump(rules, handle, indent=2, ensure_ascii=False)
    handle.write('\n')
  print('[ok] rules.rich.json')


if __name__ == '__main__':
  main(sys.argv[1])
