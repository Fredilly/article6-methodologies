# Verra Forestry S-grade Roadmap

## Purpose

This directory tracks the Verra forestry method S-grade (Grade A) upgrade
path. S-grade means: all sections and rules source-audited, no active
blocked external dependencies, `methodology_linked_review_ready: true`.

## Files

| File | Purpose |
|------|---------|
| `phase-status.json` | **Single source of truth** for what is done, what is next. Every PR must update this. |
| Dependency maps (`methodologies/Verra/AFOLU/*/v*/dependency-resolution-map.json`) | Technical input — classifies each external ref. |

## Workflow

1. Read `phase-status.json` to find the `next` phase.
2. Execute the phase (may reference a dependency map for scope).
3. Update `phase-status.json` before closing the PR.
4. Do not skip phases. Quick wins come before heavy encoding.

## Phase convention

- `vf_s{N}_{method}_{action}` — numbered phases within the S-grade track.
- Completed phases stay in the file for audit trail.
- The `next` phase is what Codex should execute next.

## Current state

- VM0047: S-grade.
- VM0007: Not S-grade. 33 blocked rules, 19 active deps. See
  `dependency-resolution-map.json` for details.
