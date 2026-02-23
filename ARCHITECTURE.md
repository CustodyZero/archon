# Archon Architecture

This document is a navigable reference for the Archon kernel architecture.
It summarizes the formal specifications — it does not replace them.

For binding definitions, refer to the spec documents linked in each section.

---

## Primary Components

Archon consists of six primary components. See `docs/specs/architecture.md`.

### 1. Compiled Capability Modules (CCM)

Developer-authored modules compiled into deterministic internal representation (IR).
Each module declares capability surfaces, optional escalation requirements, and
optional intrinsic restrictions in the Archon Restriction DSL.

- Versioned and hashable
- Disabled by default without exception
- External to the kernel boundary — first-party and third-party modules are
  governed identically

→ `docs/specs/capabilities.md`, `docs/specs/module_api.md`

### 2. Module Toggle Manager (MT)

The authoritative record of which capability modules are enabled or disabled.
Profiles are convenience wrappers over module toggles — they are not authoritative
beyond the toggles they set.

Every toggle change requires explicit operator confirmation (Confirm-on-Change).
Enabling T3 capabilities or elevating the system risk tier requires a typed
operator acknowledgment.

→ `docs/specs/profiles.md`, `docs/specs/authority_and_composition_spec.md §7`

### 3. Dynamic Restriction Engine (DRR)

Operator-authored restriction rules defined via UI, stored as JSON/YAML,
schema-validated, canonicalized, and compiled to deterministic IR before activation.

DRR may restrict. DRR may never expand capability.
`Restrict(C, R_d) ⊆ C` — this is a formal invariant, not a design preference.

Invalid DRR must not partially apply. All-or-nothing activation.

→ `docs/specs/governance.md §3`, `docs/specs/formal_governance.md §4`

### 4. Rule Snapshot Builder (RS)

Every evaluation occurs against a Rule Snapshot — an immutable, hashed bundle
of the full rule state at a point in time.

```
RS       = Build(CCM_enabled, DRR_canonical, EngineVersion, Config)
RS_hash  = Hash(CCM_hashes, DRR_hash, EngineVersion, ConfigHash)
```

Rule changes require snapshot rebuild. No floating rule state.
Every decision log records the RS_hash that produced it.

→ `docs/specs/architecture.md §3`, `docs/specs/authority_and_composition_spec.md §6`

### 5. Deterministic Validation Engine

Evaluates proposed agent actions against the active Rule Snapshot.

Evaluation logic:
- Is the action within the enabled capability set?
- Does the action comply with all active dynamic restrictions?
- If both: Permit. If either fails: Deny or Escalate (if explicitly defined).

Deny overrides Allow. Restrictions override capability permissions.
No implicit widening is permitted.

The validation engine is kernel-internal logic. Modules cannot modify it.

→ `docs/specs/formal_governance.md §5–§10`, `docs/specs/architecture.md §4`

### 6. Execution Gate

The final enforcement boundary. No action reaches execution without passing
through the gate. The gate calls the validation engine, records the decision
log entry, and either permits execution or returns a deny/escalate outcome.

Every action evaluation — including denied ones — is logged with:
agent_id, proposed_action, decision, triggered_rules, RS_hash, input_hash,
output_hash (if applicable), timestamp.

→ `docs/specs/architecture.md §4–§6`

---

## Validation Flow

Five steps. See `docs/specs/architecture.md §4`.

```
1. Agent proposes action
        │
        ▼
2. Kernel retrieves active Rule Snapshot (RS)
        │
        ▼
3. Validation Engine evaluates:
   ├─ Is action within enabled capabilities?
   └─ Does action comply with DRR?
        │
        ▼
4. Engine returns outcome:
   ├─ Permit
   ├─ Deny
   └─ Escalate
        │
        ▼
5. Execution Gate enforces outcome
   └─ Structured log entry recorded (regardless of outcome)
```

No action executes without validation. No decision goes unlogged.

---

## Rule Snapshot Model

The snapshot is the unit of determinism. Identical snapshot + identical action
= identical decision. Always.

```
RS       = Build(CCM_enabled, DRR_canonical, EngineVersion, Config)
RS_hash  = Hash(CCM_hashes, DRR_hash, EngineVersion, ConfigHash)
```

Snapshot properties:
- Immutable once constructed
- Rebuilt whenever module toggles or DRR change
- SHA-256 hash over canonical JSON of all inputs
- Every decision log references the RS_hash that produced it

→ `docs/specs/authority_and_composition_spec.md §6`, `docs/specs/formal_governance.md §10`

---

## Module Contract

All modules are external to the kernel boundary. There are no internal modules.
First-party and third-party modules are governed identically.

**A module may:**
- Declare capabilities using existing taxonomy types (see `docs/specs/capabilities.md`)
- Declare intrinsic restrictions via the Archon Restriction DSL
- Declare hazard pairs
- Suggest profiles (non-authoritative)

**A module may not:**
- Modify the validation algorithm
- Modify snapshot hashing
- Alter risk tier ordering
- Disable or suppress the approval workflow
- Introduce unknown capability types
- Register arbitrary runtime hooks into enforcement logic
- Execute code at load time beyond metadata registration
- Access environment variables, filesystem, or network except via kernel adapters

Modules are declarative. The kernel is the sole authority boundary.

→ `docs/specs/module_api.md`, `docs/specs/formal_governance.md §11–§12`

---

## Package Dependency Diagram

Build order flows top to bottom. `^build` in the Turbo pipeline enforces this.

```
┌─────────────────────────┐
│    @archon/restriction- │
│         dsl             │  ← Capability taxonomy, DSL types,
│                         │    ConditionOperator, RestrictionIR
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│      @archon/kernel     │  ← Validation engine, execution gate,
│                         │    snapshot builder, decision log,
│                         │    kernel adapter interfaces
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  @archon/module-loader  │  ← Module validator (I7 impl),
│                         │    registry, loader
└────────────┬────────────┘
             │
     ┌───────┴───────┐
     ▼               ▼
┌─────────┐   ┌──────────────┐
│@archon/ │   │  @archon/    │
│   cli   │   │   desktop    │
│         │   │              │
└─────────┘   └──────────────┘
```

Both `cli` and `desktop` depend directly on `kernel` and `module-loader`.

---

## Governance Invariant Reference

The seven invariants from `docs/specs/formal_governance.md §5`. CI must verify all seven.

| ID | Invariant | Primary Enforcement Location |
|----|-----------|------------------------------|
| I1 | Deny-by-default capability | `kernel/validation/engine.ts` |
| I2 | Restriction monotonicity | `kernel/validation/engine.ts` |
| I3 | Human approval for capability expansion | `kernel/validation/gate.ts` |
| I4 | Snapshot determinism | `kernel/snapshot/builder.ts` |
| I5 | Typed acknowledgment on tier elevation | `kernel/validation/gate.ts` |
| I6 | Delegation non-escalation | `kernel/validation/engine.ts` |
| I7 | Taxonomy soundness | `module-loader/src/validator.ts` |

→ `docs/specs/formal_governance.md`, `tools/ci/invariant-checks.md`
