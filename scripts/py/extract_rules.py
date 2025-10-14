#!/usr/bin/env python3
import glob
import json
import os
import re
import sys

RULE = re.compile(r'^(?:Requirement|Shall|Must|Should|The project proponent shall)\b', re.I)


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
    if RULE.search(line):
      snippet = line.strip()
      rules.append({
        'id': f'R.{len(rules) + 1}',
        'title': snippet[:160],
        'clause': None,
        'requirement': snippet,
        'scope': None,
        'sources': []
      })
  if not rules:
    rules.append({
      'id': 'R.1',
      'title': 'Document-level requirements (manual triage pending)',
      'clause': None,
      'requirement': None,
      'scope': None,
      'sources': []
    })
  return rules


def main(directory):
  txt = load_txt(directory)
  if not txt:
    print(f"[err] No TXT in {directory}/txt; supply TXT or enable vendor pdf2txt", file=sys.stderr)
    sys.exit(2)
  rules = {'rules': to_rules(txt)}
  out_path = os.path.join(directory, 'rules.rich.json')
  with open(out_path, 'w') as handle:
    json.dump(rules, handle, indent=2, ensure_ascii=False)
    handle.write('\n')
  print('[ok] rules.rich.json')


if __name__ == '__main__':
  main(sys.argv[1])
