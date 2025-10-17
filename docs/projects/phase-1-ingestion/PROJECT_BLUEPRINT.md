# Project Blueprint — Phase-1 Ingestion

**Project:** "Phase-1 — Ingestion (Article6)"
**Purpose:** Replace markdown checklists with atomic issues + Project board.

## Columns
Backlog → Ready → Running → Review → Done → Blocked

## Labels
- phase:1
- type:{protocol,batch,script,qa,bug}
- state:{ready,running,review,done,blocked}
- area:{discover,assets,meta,registry,validation,ci}

## Reference
Protocol doc: docs/protocol/Article6-Ingest-LinksOnly-v1.md  
Blueprint doc: docs/projects/phase-1-ingestion/PROJECT_BLUEPRINT.md

## Seed Issues
1. [Protocol] Article6-Ingest-LinksOnly-v1 is canonical  
2. [Script] Add discover-unfccc.js  
3. [Script] ingest-full.sh orchestration  
4. [QA] Stage-1 acceptance + stability  
5. [Batch] Forestry-01 (codes: batches/2025-10-17.codes.forestry-01.txt)

## Automation
- Labels drive Project columns (state:ready→Ready, etc.)
- CI triggers on label type:batch + state:running
