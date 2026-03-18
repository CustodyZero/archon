# Archon Factory Tracker

This document records factory system state for the Archon project.

---

## Factory System Status

| Component | Status | Location |
|---|---|---|
| Structure (F1) | Complete | `factory/` |
| Derivation (F2) | Complete | `tools/factory/derive.ts` |
| Validation (F3) | Complete (advisory) | `tools/factory/validate.ts` |
| Environment model (F4) | Not started | — |
| CI enforcement | Advisory (`continue-on-error`) | `.github/workflows/ci.yml` |

---

## Baseline Initialization

| Field | Value |
|---|---|
| Baseline document | `../archon-factory-baseline.md` |
| Machine-readable baseline | `factory/baseline.json` |
| Baseline loader | `tools/factory/load-baseline.ts` |
| Baseline commit | `16ae04980d24b0370badc87004f0617f5375ca0b` |
| Baseline branch | `main` |
| Baseline date | 2026-03-18 |
| Total surfaces | 65 |
| baseline_present | 48 |
| needs_governed_followup | 7 |
| out_of_scope_for_v0.1 | 10 |

**This baseline represents pre-factory work and does NOT indicate packet completion or verified acceptance.**

The baseline is a read-only initialization artifact. It tells the factory what already exists in the repository. It does not create packets, completion records, or acceptance records for historical work.

---

## Factory Commands

| Command | Purpose |
|---|---|
| `pnpm factory:derive` | Compute derived state from factory artifacts |
| `pnpm factory:validate` | Validate all factory artifacts (schema, integrity, invariants) |
| `npx tsx tools/factory/load-baseline.ts` | Display baseline summary |
| `npx tsx tools/factory/load-baseline.ts --followup` | List surfaces needing governed work |
| `npx tsx tools/factory/load-baseline.ts --json` | Print baseline as JSON |

---

## Design Documents (External to Repo)

| Document | Purpose |
|---|---|
| `../archon-factory-readiness.md` | Ground-truth extraction of current system |
| `../archon-factory-retrofit-design.md` | Factory overlay design with risk-proportional acceptance |
| `../archon-factory-baseline.md` | Pre-factory baseline declaration |
| `../archon-v0.1-packet-plan.md` | Governed packet sequence to v0.1 |
| `../archon-factory-bootstrap.md` | F1–F3 implementation report |
