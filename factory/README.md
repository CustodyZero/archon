# Archon Factory

The factory is Archon's change-control system. It enforces that all work
is scoped, intentional, and accepted through a risk-proportional process
before it is considered done.

It is not a project management tool. It is a **governance artifact store**
with deterministic derivation rules.

---

## Why

AI agents can implement code. They cannot judge whether a change is safe
to ship. The factory separates implementation (which agents can do) from
acceptance (which requires human authority for high-risk changes).

Every change must declare its intent and scope before implementation
begins. Acceptance criteria are determined by change class, not by
the implementer.

---

## Artifact Types

The factory has five artifact types. Each is a JSON file validated
against a schema in `factory/schemas/`.

### Packet

A scoped unit of work. Declares **what** is changing, **why**, and
**which packages** are affected.

```
factory/packets/<packet-id>.json
```

Required fields:
- `id` — kebab-case identifier (must match filename)
- `title` — one-line summary
- `intent` — what is changing and why
- `change_class` — `trivial`, `local`, `cross_cutting`, or `architectural`
- `scope.packages` — which Archon packages are affected
- `owner` — who is responsible
- `created_at` — ISO 8601 timestamp

Optional fields:
- `started_at` — when work began
- `environment_dependencies` — external dependencies that must be satisfied
- `dependencies` — packet IDs that must be accepted first
- `tags` — freeform labels

### Completion

Evidence that a packet's implementation is done.

```
factory/completions/<packet-id>.json
```

Required fields:
- `packet_id` — must reference an existing packet
- `completed_at` — ISO 8601 timestamp
- `completed_by` — identity (`{ kind: "human" | "agent" | "cli" | "ui", id: "..." }`)
- `summary` — what was done
- `verification` — `{ tests_pass, build_pass, lint_pass, ci_pass }` (all booleans)

Optional fields:
- `files_changed` — list of modified/created files
- `verification.notes` — additional context

### Acceptance

Human approval that a completed packet is accepted.

```
factory/acceptances/<packet-id>.json
```

Required fields:
- `packet_id` — must reference a packet with a valid completion
- `accepted_at` — ISO 8601 timestamp
- `accepted_by` — identity (must be `human`, `cli`, or `ui` — **never `agent`**)

### Rejection

Reverts an auto-accepted cross-cutting packet back to completed status.

```
factory/rejections/<packet-id>.json
```

Required fields:
- `packet_id` — must reference an existing packet
- `rejected_at` — ISO 8601 timestamp
- `rejected_by` — identity (must be `human`, `cli`, or `ui` — **never `agent`**)
- `reason` — why the auto-acceptance is being reverted

### Evidence

Proof that an environment dependency has been satisfied.

```
factory/evidence/<dependency-key>.json
```

Required fields:
- `dependency_key` — must match a key declared in at least one packet
- `verified_at` — ISO 8601 timestamp
- `verified_by` — identity (must be `human`, `cli`, or `ui`)
- `verification_method` — `manual`, `automated`, or `ci`
- `description` — what was verified

Optional fields:
- `proof` — supporting evidence (URL, command output, etc.)
- `expires_at` — ISO 8601 expiration (evidence invalid after this time)

---

## Lifecycle

```
not_started → in_progress → completed → accepted
                                ↑            |
                                |  (rejection)|
                                +-------------+
```

A packet moves through states based on which artifacts exist:

| State                | Condition                                         |
|----------------------|---------------------------------------------------|
| `not_started`        | No completion, `started_at` is null               |
| `in_progress`        | No completion, `started_at` is set                |
| `environment_pending`| Completion exists, but environment deps are unmet |
| `completed`          | Completion exists, not yet accepted                |
| `accepted`           | Acceptance criteria satisfied (see below)          |

---

## Acceptance Rules

Acceptance is **proportional to risk**. The `change_class` field on the
packet determines the acceptance path.

| Change Class    | Acceptance Path                                              |
|-----------------|--------------------------------------------------------------|
| `trivial`       | Auto-accepted when verification passes                       |
| `local`         | Auto-accepted when verification passes                       |
| `cross_cutting` | Auto-accepted when verification passes, with audit flag set  |
| `architectural` | Requires explicit human acceptance record                    |

**Verification passing** means all four fields in `completion.verification`
are `true`: `tests_pass`, `build_pass`, `lint_pass`, `ci_pass`.

**Audit flag** means the cross-cutting packet is accepted and work can
proceed, but it remains flagged for human review. A rejection record
can revert it to `completed` status.

**Human acceptance** overrides all other rules, including
`environment_pending`.

---

## Factory Invariants

These are enforced by validation and derivation tooling.

**FI-1 — One completion per packet.**
A packet may have at most one completion record.

**FI-2 — One acceptance per packet.**
A packet may have at most one acceptance record.

**FI-3 — No agent acceptance or rejection.**
Only `human`, `cli`, or `ui` identities may author acceptance or
rejection records. Agent-authored acceptances are forbidden.

**FI-4 — No acceptance without completion.**
An acceptance record requires a corresponding completion record.

**FI-5 — Architectural packets cannot auto-accept.**
Architectural changes always require an explicit human acceptance record,
regardless of verification status.

**FI-6 — No progression without completion.**
If a started packet lacks a completion record, no newer packet (by
`started_at` timestamp) may have a completion. Work must not progress
past an incomplete packet. Packets explicitly marked with
`status: "abandoned"` or `status: "deferred"` are exempt.

**FI-7 — Commit-time completion enforcement.**
A commit must not include non-factory implementation files while any
started packet lacks a completion record. Enforced by the pre-commit
hook via `tools/factory/completion-gate.ts`. Allowed exceptions:
factory-only commits (all staged files under `factory/` or
`tools/factory/`), infrastructure-only commits (`.githooks/`,
`.github/`, root config files), and packets marked with
`status: "abandoned"` or `status: "deferred"`.

---

## Tooling

### Validate

```sh
pnpm factory:validate
```

Runs structural and semantic validation across all factory artifacts:
- Schema validation (required fields, types, patterns)
- Referential integrity (cross-references between artifacts)
- Authority rules (FI-3 enforcement)
- Change class consistency heuristics (warnings)
- Invariant enforcement (FI-1 through FI-6)

Exit code 0 on pass, 1 on errors. This runs in CI.

### Derive

```sh
pnpm factory:derive           # print derived state to stdout
pnpm factory:derive -- --write  # write to factory/derived-state.json
```

Pure derivation function: reads all artifacts, applies the acceptance
rules, and produces the current factory state as JSON.

The output includes per-packet status, acceptance mode, audit flags,
unmet dependencies, and a summary. `derived-state.json` is never
committed — it is always recomputed.

### Status

```sh
pnpm factory:status              # human-readable report
pnpm factory:status -- --json    # machine-readable JSON
```

Reconstructs workflow state from factory artifacts on disk and reports:
- Current factory summary (counts by status)
- Incomplete packets (started, no completion)
- Packets awaiting human acceptance
- Audit-pending packets
- Blocked packets (unmet dependencies)
- **Recommended next action** with exact command

Use this at the start of any session, after context loss, or when
unsure what to do next. The command reads only factory artifacts —
no chat memory, no commit history, no ambient state.

### Complete

```sh
pnpm factory:complete <packet-id> [--summary "..."]
```

Runs build, lint, and tests, then creates a completion record with
truthful verification results. Re-validates the factory after writing.
Use this immediately after implementation is done — completion is the
deliverable, not the packet.

---

## Directory Structure

```
factory/
├── README.md              # This file
├── baseline.json          # Pre-factory surface inventory
├── derived-state.json     # Computed state (not committed)
├── schemas/               # JSON schemas for all artifact types
│   ├── packet.schema.json
│   ├── completion.schema.json
│   ├── acceptance.schema.json
│   ├── rejection.schema.json
│   └── evidence.schema.json
├── packets/               # Work unit declarations
├── completions/           # Implementation evidence
├── acceptances/           # Human approval records
├── rejections/            # Audit reversals
└── evidence/              # Environment dependency proofs
```

---

## Creating a Packet

1. Create `factory/packets/<id>.json` with a kebab-case ID
2. Declare intent, change class, scope, and owner
3. Run `pnpm factory:validate` to confirm it passes
4. Implement the work
5. Create `factory/completions/<id>.json` with verification results
6. For architectural changes, create `factory/acceptances/<id>.json`

Change class determines how much process is required.
When in doubt, classify higher rather than lower.
