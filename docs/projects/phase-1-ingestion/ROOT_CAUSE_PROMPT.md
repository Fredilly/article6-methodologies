# Root Cause Prompt (for new ingest / pipeline failure classes)

Paste everything below into ChatGPT/Codex **after** we’ve fixed a new class of failure (not just a typo).

---

We just fixed a new class of ingest / pipeline failure in the Article6 repository.

Bug summary:

<1–3 bullet summary of what was broken and how we fixed it>

Files or areas touched:

<list main files or folders, or paste a small diff>

Using docs/projects/phase-1-ingestion/ARTICLE6_INGEST_UPGRADE_PLAN.md as the spec, do three things:

1) Invariant / spec:

   - Propose a single new invariant bullet we should add to the plan **or**
   - Explicitly say “no spec change needed” if the current plan already covers this failure.

2) Root Cause entry:

   - Draft a concise Root Cause Template entry with these fields:
     - **Name** (short label, e.g. "AR-AM0014 tool ref mismatch")
     - **Date**
     - **Area** (META / sections / rules / previous / registry / CI / other)
     - **Symptom** (what broke: error message or surprising diff)
     - **Root cause** (why it actually happened)
     - **New invariant** (the rule the pipeline should obey from now on)
     - **Spec update** (where to add/change bullets in ARTICLE6_INGEST_UPGRADE_PLAN.md)
     - **Code/tests** (scripts, schemas, CI checks that should change)
     - **Golden fixtures touched** (which methods we should use to confirm the fix)

3) System tasks / Codex TODO:

   - Say whether we need to update our Codex/system TODOs.
   - If yes, propose at most 1–2 concrete tasks (file paths + commands) that:
     - Enforce the new invariant, and
     - Can be validated with the double-run health check on Forestry + Agriculture.

Keep the answer short and ready to paste into:
- The Root Cause Template section in ARTICLE6_INGEST_UPGRADE_PLAN.md
- A small `.todo` block for Codex or our “Next 3–5 System Tasks” list.

---
