<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="/docs/brand/archon-wordmark-dark.svg" />
    <img src="/docs/brand/archon-wordmark-blue.svg" alt="PlainSight Lab" width="280" />
  </picture>
</p>

Archon is a deterministic coordination kernel for local AI agents and
human–AI workflows.

It is not a reasoning system. It is not an orchestration framework.
It does not infer policy, simulate outcomes, or learn from agent behavior.

It gates execution.

Every proposed agent action must pass deterministic validation against
an operator-defined, hashed rule snapshot before it reaches execution.
If it doesn't pass, it doesn't run. No exceptions, no inference,
no implicit permissions.

Archon exists because emergent orchestration is not a foundation you
can build on. When an agent system's behavior depends on what the model
decides to do rather than what the operator has defined it may do,
the operator is not in control — they're hoping. Archon replaces that
hope with enforcement.

---

## Governance Invariants

These are not goals. They are properties the kernel is required to
maintain. The implementation serves the spec, not the other way around.

**I1 — Deny by default**
No capability exists unless explicitly enabled by the operator.
The system boots with no active capabilities. S = ∅ ⇒ C(S) = ∅.

**I2 — Restriction monotonicity**
Dynamic restriction rules may reduce capability. They may never
expand it. No rule may widen what an agent is permitted to do.

**I3 — Human approval required for capability expansion**
Enabling a capability module requires explicit operator confirmation.
Agents may propose. Humans approve. Always.

**I4 — Snapshot determinism**
Every decision is evaluated against an immutable, hashed rule snapshot.
Given the same snapshot and the same proposed action, the decision is
always identical. All decisions are replayable.

**I5 — Typed acknowledgment on tier elevation**
Enabling T3 capabilities or elevating system risk tier requires a
typed operator acknowledgment. Silent enablement is prohibited.

**I6 — Delegation non-escalation**
An agent may not cause another agent to execute capabilities it does
not itself possess. Delegation does not expand authority.

**I7 — Taxonomy soundness**
Unknown capability types are rejected at module load time. No module
may introduce new capability types at runtime. New types require a
core taxonomy change via PR.

---

## Architecture

Archon separates three concerns that most agent frameworks conflate:

**Capability** — what agents are allowed to do, defined by
operator-enabled Compiled Capability Modules (CCM). Disabled by default.
Declared, versioned, hashable.

**Restriction** — what is currently permitted within the capability
boundary, defined by Dynamic Restriction Rules (DRR). Operator-authored,
schema-validated, canonicalized before activation. May restrict, never
expand.

**Execution** — what actually runs. Only actions that pass deterministic
validation against both capability bounds and dynamic restrictions reach
the execution gate. Every decision is logged with the rule snapshot hash
that produced it.

The kernel enforces the boundary between all three. It does not
participate in reasoning about policy. It evaluates policy as stated.

### Rule Snapshot Model

Every evaluation occurs against a Rule Snapshot:

```
RS = Build(CCM_enabled, DRR_canonical, EngineVersion, Config)
RS_hash = Hash(CCM_hashes, DRR_hash, EngineVersion, ConfigHash)
```

The snapshot is immutable once constructed. Rule changes require
snapshot rebuild. No floating rule state. Every decision log records
the RS_hash that produced it.

### Module Contract

All modules — first-party and third-party — are external to the
kernel boundary and governed identically. There are no internal modules.

A module may:
- Declare capabilities using existing taxonomy types
- Declare intrinsic restrictions via the Archon Restriction DSL
- Declare hazard pairs
- Suggest profiles (non-authoritative)

A module may not:
- Modify the validation algorithm
- Modify snapshot hashing
- Alter tier ordering
- Disable the approval workflow
- Introduce unknown capability types
- Register arbitrary runtime hooks into enforcement logic

Modules are declarative. The kernel is the sole authority boundary.

---

## Repository Structure
```
archon/
├── packages/
│   ├── kernel/          # Enforcement engine
│   ├── restriction-dsl/ # DSL parser and compiler (v0.1 in progress)
│   ├── module-loader/   # Module validation, loading, hash verification
│   ├── cli/             # Operator CLI
│   └── desktop/         # Electron app (enthusiast distribution)
├── modules/
│   └── first-party/     # First-party modules — same contract as third-party
├── docs/
│   └── spec/            # Founding specification documents
└── tools/               # CI enforcement, build tooling
```

---

## Licensing Commitment

Archon is open source under Apache 2.0 and will remain so permanently.

The Apache 2.0 license governs the source code. It does not grant
rights to use Archon brand assets. See the
[CustodyZero brand repository](https://github.com/custodyzero/brand)
for brand usage policy.

We don't do bait-and-switch. What ships open stays open.

---

## Status

Archon is in active early development. The specification is locked at v0.1.

**What exists today:**
- Complete formal specification (see `docs/spec/`)
- Governance invariants with mathematical proofs
- Capability taxonomy v0.1
- Module API contract v0.1
- Core TypeScript interfaces

**What is being built:**
- Kernel enforcement engine
- Restriction DSL (design in progress)
- Module loader with hash verification
- CLI and Electron app

If you are evaluating Archon for your agent stack, read
`docs/spec/authority_and_composition_spec.md` first.

If you are writing a module, read `docs/spec/module_api.md`.

If you want to contribute to the kernel, read
`docs/spec/formal_governance.md` and open an issue before writing code.

---

## Contributing

Contributions are welcome. The kernel is not.

The kernel's governance invariants are not negotiable and CI enforces
them. Contributions that introduce implicit permissions, modify snapshot
hashing, suppress approval workflows, or add unknown capability types
will not merge regardless of other quality.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guide.

---


<p align="center">
  <a href="https://custodyzero.com">
    <img src="/docs/brand/custodyzero-cz-dark.svg"
         alt="A CustodyZero product" width="160" />
  </a>
</p>

*The coordination layer that doesn't guess.*
