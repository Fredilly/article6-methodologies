#!/usr/bin/env python3
import json, pathlib, re, hashlib, shutil

repo=pathlib.Path('.')
stage=repo/'docs/roadmaps/governance-v1/staging/VM0047/v1-1'
out=repo/'methodologies/Verra/AFOLU/VM0047/v1-1'
out.mkdir(parents=True,exist_ok=True)
source_hash='2fdccb9764a0b06283e974142d0ff250910f81686dc53bcc197f6cf90d53de3d'
source_path='tools/Verra/VM0047/v1-1/source.pdf'
source_size=(repo/source_path).stat().st_size

def slug(s):
    return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-') or 'section'

def prod_sid(sid):
    if re.fullmatch(r'S-\d+(?:-\d+)*',sid): return sid
    if sid=='S-A1': return 'S-11'
    if sid.startswith('S-A1-'): return 'S-11-'+sid[len('S-A1-'):]
    if sid=='S-A2': return 'S-12'
    if sid.startswith('S-A2-'): return 'S-12-'+sid[len('S-A2-'):]
    if sid=='S-A3': return 'S-13'
    if sid.startswith('S-A3-'): return 'S-13-'+sid[len('S-A3-'):]
    if sid=='S-DH': return 'S-14'
    if sid.startswith('S-DH-'): return 'S-14-'+sid[len('S-DH-'):]
    raise ValueError('unmapped staging section id '+sid)

src_sections=json.loads((stage/'sections.json').read_text())['sections']
lean_sections=[]; rich_sections=[]; by_num={}
for s in src_sections:
    sid=prod_sid(s['id']); parent=prod_sid(s['parent_id']) if s.get('parent_id') else None
    stable=f"Verra.AFOLU.VM0047.v1-1.{sid}"; anchor=slug(s['title'])
    q={'id':sid,'title':s['title'],'anchor':anchor,'section_number':s['section_number'],'stable_id':stable}
    lean_sections.append(q); by_num[s['section_number']]=q
    pages=list(range(s['page_start'],s['page_end']+1)) if s.get('page_start') and s.get('page_end') else []
    rich_sections.append({
      'id':sid,'stable_id':stable,'title':s['title'],'heading_text':s['title'],'anchor':anchor,'section_number':s['section_number'],
      'section_level':s['section_level'],'level':s['section_level'],'parent_id':parent,
      'page_start':s.get('page_start'),'page_end':s.get('page_end'),'pages':pages,'children':[],
      'locator_status':'source_audited','source_span_status':'source_audited',
      'provenance':{'source_ref':f"VM0047 v1.1 Section {s['section_number']}",'source_hash':source_hash}
    })
childmap={x['id']:[] for x in rich_sections}
for x in rich_sections:
    if x.get('parent_id') in childmap: childmap[x['parent_id']].append(x['id'])
for x in rich_sections:
    x['children']=childmap[x['id']]
(out/'sections.json').write_text(json.dumps({'sections':lean_sections},indent=2)+'\n')
(out/'sections.rich.json').write_text(json.dumps(rich_sections,indent=2)+'\n')

index=json.loads((stage/'rules.governance-v1.index.json').read_text())
source_rules=[]
for fam in index['families']:
    source_rules.extend(json.loads((stage/fam['path']).read_text())['rules'])
assert len(source_rules)==index['total_atomic_rules']==88

def primary_number(raw):
    raw=raw.strip()
    if raw in by_num: return raw
    candidates=re.findall(r'(?:A\d+|\d+)(?:\.\d+)*', raw)
    for candidate in sorted(candidates,key=len,reverse=True):
        if candidate in by_num: return candidate
    raise ValueError('unmapped rule section_number '+raw)

def rtype(r):
    tags=set(r.get('tags') or [])
    if tags & {'monitoring','monitoring-plan','database'}: return 'monitoring'
    if 'uncertainty' in tags: return 'uncertainty'
    if 'leakage' in tags: return 'leakage'
    if 'equation' in tags: return 'equation'
    if tags & {'quantification','parameter','biomass','fertilizer','ex-ante','benchmark'}: return 'calc'
    return 'eligibility'

counters={}; lean_rules=[]; rich_rules=[]
for r in source_rules:
    secnum=primary_number(r['section_number']); s=by_num[secnum]; sid=s['id']
    counters[sid]=counters.get(sid,0)+1
    rid='R-'+sid[2:]+'-'+f"{counters[sid]:04d}"; stable=f"Verra.AFOLU.VM0047.v1-1.{rid}"
    tags=sorted(set(r.get('tags') or ['governance']))
    lean_rules.append({
      'id':rid,'stable_id':stable,'title':r['title'],'logic':r['logic'],
      'section_anchor':s['anchor'],'section_id':sid,'section_number':secnum,
      'section_stable_id':s['stable_id'],'tools':['Verra/VM0047@v1-1'],'tags':tags,'when':r.get('when') or []
    })
    rich_rules.append({
      'id':stable,'stable_id':stable,'summary':r['title'],'logic':r['logic'],'type':rtype(r),
      'quality_status':'source_audited','source_span_status':'source_audited','source_span_text':r['logic'],
      'when':r.get('when') or [],'tags':tags,
      'refs':{'methodology':'Verra/VM0047@v1-1','primary_section':sid,'sections':[sid],
              'section_number':secnum,'section_anchor':s['anchor'],'section_stable_id':s['stable_id'],
              'pages':r['source_pages'],'tools':['Verra/VM0047@v1-1']},
      'provenance':{'source_ref':r['source_locator'],'source_hash':source_hash}
    })
(out/'rules.json').write_text(json.dumps({'rules':lean_rules},indent=2)+'\n')
(out/'rules.rich.json').write_text(json.dumps(rich_rules,indent=2)+'\n')

for f in ['equations.governance-v1.json','parameters.governance-v1.json','dependencies.governance-v1.json','version-diff-from-v1-0.json','rules.governance-v1.index.json']:
    shutil.copyfile(stage/f,out/f)

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
files=['sections.json','sections.rich.json','rules.json','rules.rich.json','equations.governance-v1.json','parameters.governance-v1.json','dependencies.governance-v1.json','version-diff-from-v1-0.json','rules.governance-v1.index.json']
meta={
  'active_date':'2025-05-14','effective_from':'2025-05-14','domain':'AFOLU','method':'ARR Methodology Framework',
  'standard':'VCS','stage':'Active','status':'active','title':'VM0047 Afforestation, Reforestation and Revegetation, v1.1','version':'v1-1',
  'artifact_status':{'rules':'source_audited','sections':'source_audited','source_pdf':'verified'},
  'audit_hashes':{'source_pdf_sha256':source_hash,'sections_json_sha256':sha(out/'sections.json'),'rules_json_sha256':sha(out/'rules.json'),'sections.rich_sha256':sha(out/'sections.rich.json'),'rules.rich_sha256':sha(out/'rules.rich.json')},
  'files':[{'path':f,'sha256':sha(out/f)} for f in files],
  'provenance':{'author':'Article6 Governance v1','date':'2026-09-09','source_pdfs':[{'doc':'Verra/VM0047@v1-1','kind':'pdf','path':source_path,'sha256':source_hash,'size':source_size}]},
  'references':{'tools':[{'doc':'Verra/VM0047@v1-1','kind':'pdf','path':source_path,'sha256':source_hash,'size':source_size,'url':'https://verra.org/methodologies/vm0047-afforestation-reforestation-and-revegetation-v1-1/'}]},
  'relationships':{'version':{'family':'Verra.AFOLU.VM0047','lineage':['v1-0','v1-1'],'previous_version':'v1-0','next_version':None}},
  'governance_v1':{'state':'PROVENANCE_COMPLETE','verified':False,'production_corpus':True,'blockers':['production_retrieval_execution_not_passed'],'migration_note':'Canonical v1.1 sections/rules are now present in methodologies/**. Production presence does not imply VERIFIED; retrieval must pass the governance-v1 contract first.'},
  'external_dependencies':{'status':'governed_dependency_graph','path':'dependencies.governance-v1.json','note':'Dynamic and incorporated dependency semantics are preserved in the governed dependency artifact; no dynamic dependency is silently pinned.'}
}
(out/'META.json').write_text(json.dumps(meta,indent=2)+'\n')
print(f'generated {len(lean_sections)} sections and {len(lean_rules)} rules')
