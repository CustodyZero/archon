# Agent Operating Instructions

This file defines how AI agents must operate in this repository.
It applies to all agents regardless of provider (Claude, GPT, Gemini, Copilot, Cursor, etc.).

These are not guidelines. They are constraints. Violating them produces incorrect work.

---

## 1. The Factory Controls All Work

This repository uses a factory system (`factory/`) to govern all implementation work.
The factory is the source of truth for what work exists, what is in progress, and what is complete.

**You must not implement code without using the factory.**

### Before Starting Any Work

```sh
pnpm factory:status
```

This tells you:
- What packets are in progress
- What is blocked
- What needs completion
- What the next legal action is

**If a feature is active:**
```sh
pnpm factory:execute <feature-id>
```

This tells you which packets are ready to implement.

### After Completing Implementation

```sh
pnpm factory:complete <packet-id>
```

This runs build + lint + tests and creates a completion record.
**Do this before committing. Completion is the deliverable, not the packet.**

The pre-commit hook will reject commits that include implementation files
without a matching completion record.

---

## 2. Factory Lifecycle

```
Feature (intent) → Plan (packets) → Human Approval → Execution → QA Report → Delivery
```

### Artifacts

| Directory | Purpose |
|---|---|
| `factory/features/` | Feature-level intents (multi-packet) |
| `factory/packets/` | Individual work units |
| `factory/completions/` | Verification evidence (build/lint/test results) |
| `factory/acceptances/` | Human approval records |
| `factory/reports/` | QA reports for completed features |

### Commands

| Command | When to Use |
|---|---|
| `pnpm factory:status` | Start of session, after context loss, when unsure what to do |
| `pnpm factory:execute <feature-id>` | Determine which packets to implement next |
| `pnpm factory:complete <packet-id>` | After implementation, before committing |
| `pnpm factory:validate` | Verify factory integrity |
| `pnpm factory:test` | Run factory tooling tests |

---

## 3. Non-Negotiable Rules

### 3.1 No Implementation Without a Packet

Every code change must be associated with a factory packet.
Do not write code and then create the packet after the fact.

### 3.2 No Commit Without Completion

Run `pnpm factory:complete <packet-id>` before committing.
The pre-commit hook enforces this. If it blocks you, create the completion first.

### 3.3 No Facades

Do not introduce code that makes the system appear correct when it is not.
No stubbed success paths, no TODO implementations that return success,
no silent fallbacks that mask failure.

If something is not implemented, it must fail explicitly.

### 3.4 Single Intent Per Change

One packet = one intent. Do not mix:
- Refactor + feature
- Cleanup + behavior change
- Dependency update + logic change

### 3.5 Tests Are Required

Non-trivial changes must include tests. A successful build is not evidence of correctness.

---

## 4. Session Reconstruction

If you are starting a new session or have lost context:

1. Run `pnpm factory:status`
2. Read the output — it tells you exactly where things stand
3. If a feature is active, run `pnpm factory:execute <feature-id>`
4. The output tells you what to do next

Do not rely on memory. Do not guess. Read the factory state.

---

## 5. Execution Protocol (for feature-level work)

When executing a feature with multiple packets:

```
loop:
  1. Run: pnpm factory:execute <feature-id>
  2. Read output: which packets are ready?
  3. Implement ready packets (parallel if independent)
  4. For each completed packet: pnpm factory:complete <packet-id>
  5. Commit with completion
  6. Go to 1

  Exit when: all_complete
  Then: produce QA report
```

Each iteration is stateless. If interrupted, re-run `factory:execute` to resume.

---

## 6. Architecture Constraints

- **Package dependency order:** restriction-dsl → kernel → runtime-host → module-loader → cli / desktop
- **Kernel boundary:** `packages/kernel` has ZERO imports of node:fs, node:child_process, node:net, fetch
- **ESM throughout:** All packages use `"type": "module"`
- **TypeScript strict mode:** exactOptionalPropertyTypes, noUncheckedIndexedAccess, NodeNext

---

## 7. Key Commands

```sh
pnpm build              # Build all packages (Turborepo)
pnpm lint               # Lint all packages
pnpm test               # Run all package tests
pnpm factory:status     # Factory state + next action
pnpm factory:execute    # Feature execution resolver
pnpm factory:complete   # Create completion record
pnpm factory:validate   # Validate factory integrity
pnpm factory:test       # Run factory tooling tests
```

---

## 8. Where to Find Things

- **Governance spec:** `docs/specs/formal_governance.md`
- **Architecture spec:** `docs/specs/authority_and_composition_spec.md`
- **Factory docs:** `factory/README.md`
- **Kernel types:** `packages/kernel/src/types/` (most important files in the repo)
- **Factory invariants:** `factory/README.md` § Factory Invariants (FI-1 through FI-7)
