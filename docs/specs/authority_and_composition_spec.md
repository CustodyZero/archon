# Deterministic Agent Coordination Kernel
## Authority and Composition Specification v0.1

Status: Locked  
Default Operator Posture: Confirm-on-Change  
License Context: Intended for Apache 2.0 distribution  

---

# 1. Scope

This specification defines the authority model, rule composition semantics, and enforcement invariants for a deterministic coordination kernel designed to:

- Coordinate AI agents in local environments
- Govern human + AI hybrid workflows
- Replace entropy-prone agent orchestration frameworks with bounded, inspectable execution control

This kernel is not:

- A reasoning instrument
- A simulation engine
- A governance authority
- A standards body

It is a deterministic execution constraint layer.

---

# 2. Core Design Principle

No agent action may execute unless it satisfies:

1. Explicit operator-enabled capability bounds
2. Explicit dynamic restriction rules
3. Deterministic validation

Silence does not imply permission.

---

# 3. Definitions

## 3.1 Actors

**Operator**  
Human authority configuring and supervising the system.

**Agent**  
Execution participant proposing actions.

**Kernel**  
Deterministic enforcement runtime.

---

## 3.2 Rule Sources

**Compiled Capability Modules (CCM)**  
Developer-authored modules compiled into deterministic internal representation (IR).  
Each module must be versioned and hashable.

**Dynamic Restriction Rules (DRR)**  
Operator-authored restrictions defined via UI, stored as JSON/YAML, schema-validated and canonicalized before activation.

---

## 3.3 Control Surfaces

**Module Toggles (MT)**  
Explicit operator enablement or disablement of compiled modules.

**Profiles (P)**  
Convenience wrappers mapping to explicit module toggle sets.  
Profiles are not authoritative beyond setting toggles.

---

## 3.4 Internal Artifacts

**IR (Internal Representation)**  
Canonical deterministic rule representation consumed by the enforcement engine.

**Rule Snapshot (RS)**  
Immutable evaluation bundle constructed from:

- Enabled CCM modules
- Canonicalized DRR
- Engine version
- Runtime configuration

Each RS must be hashable.

---

# 4. Authority Model

## 4.1 Operator Primacy

The operator controls:

- Which capability modules are enabled
- Which dynamic restrictions are active

The kernel must not infer or assume operator intent.

---

## 4.2 Separation of Capability and Restriction

Capability expansion is governed only by Module Toggles.

Dynamic Restriction Rules may restrict but may not expand capability.

---

# 5. Composition Semantics (Policy A)

Let:

- C = capabilities contributed by enabled CCM modules
- R_d = active dynamic restriction rules
- a = proposed agent action

Permit iff:

1. Capability containment: a ∈ C  
2. Restriction compliance: Valid(a, R_d) = true

If either condition fails:

- Deny  
or  
- Escalate (if explicitly defined)

---

## 5.1 Precedence Rules

- Deny overrides Allow
- Restrictions override capability permissions
- No implicit widening is permitted

---

## 5.2 Escalation

Escalation is a deterministic outcome requiring explicit operator approval before execution.

Escalation must be triggered only by:

- Explicit DRR conditions
- Explicit CCM-defined requirements

---

# 6. Snapshot Determinism Model

## 6.1 Snapshot Construction

Each evaluation must occur against an explicit Rule Snapshot:

RS = Build(CCM_enabled, DRR_canonical, EngineVersion, Config)

---

## 6.2 Snapshot Hash

Each snapshot must produce:

RS_hash = Hash(CCM_hashes, DRR_hash, EngineVersion, ConfigHash)

Every decision log must record RS_hash.

---

## 6.3 Snapshot Updates

Whenever:

- Module Toggles change
- Dynamic Restriction Rules change

A new Rule Snapshot must be built before further evaluation.

No implicit floating rule state is permitted.

---

# 7. Profiles and Toggles

## 7.1 Authoritative Source

Module Toggles are authoritative.  
Profiles are convenience wrappers only.

---

## 7.2 Profile Application

Applying a profile must:

- Produce a deterministic mapping P → MT_set
- Surface explicit toggle changes
- Require operator confirmation (Confirm-on-Change default)

---

## 7.3 Profile Transparency

Profiles must not:

- Hide module enablement
- Implicitly mutate rules without surfacing changes
- Mask capability expansions

Profiles may bundle DRR templates only if explicitly declared.

---

# 8. Dynamic Restriction Requirements

Dynamic Restriction Rules must undergo:

1. Schema validation
2. Canonicalization (stable ordering, normalized defaults)
3. Deterministic IR translation
4. Snapshot rebuild

Invalid DRR must not partially apply.

Dynamic rules may:

- Deny actions
- Require approvals
- Constrain delegation
- Impose quotas
- Impose rate limits

Dynamic rules may not:

- Add new action types
- Add new tools
- Bypass module toggles
- Expand delegation beyond compiled bounds

---

# 9. Compiled Capability Module Requirements

Each CCM must define:

- Module ID
- Version
- Hash
- Declared capability set
- Optional required escalation triggers

All modules must be disabled by default unless explicitly included in a documented default profile.

---

# 10. Logging and Inspectability

Every action evaluation must log:

- Agent ID
- Agent role
- Proposed action (structured form)
- Decision (Permit / Deny / Escalate)
- Triggered rule identifiers
- RS_hash
- Input hash
- Output hash (if applicable)
- Timestamp

Logs must allow replay under the same RS_hash.

---

# 11. Confirm-on-Change Operator Posture

The default system posture is Confirm-on-Change.

The following actions require explicit operator confirmation:

- Enabling or disabling modules
- Applying profiles
- Changing Dynamic Restriction Rules

Silent application is prohibited by default.

---

# 12. Contributor Constraints (Apache 2.0 Enforcement Discipline)

## 12.1 No Surprise Defaults

No contribution may introduce new active capability without operator-visible toggle change.

CI must detect expansions of default-enabled capability sets.

---

## 12.2 Capability Expansion Discipline

Dynamic rule schema must remain restriction-expressive only.

All new capabilities must ship as:

- Explicit modules
- Disabled by default
- Explicitly documented

---

## 12.3 Prohibited Constructs

The kernel must not support:

- Runtime rule code execution
- Rule self-modification
- Agent-driven permission expansion
- Learned permissions
- Implicit tool discovery

---

# 13. Compatibility With Higher-Level Systems

This kernel is structurally compatible with integration into a reasoning layer provided:

- The reasoning layer suggests
- The kernel gates
- Authority boundaries remain explicit

No epistemic authority may migrate into the kernel.

---

# 14. Closing Invariant

For every agent action:

Permit only if:

- It is within operator-enabled capability bounds
- It satisfies dynamic restrictions
- It passes deterministic validation under a hashed snapshot
- It respects human authority boundaries

No implicit autonomy is permitted.

---

End of Specification v0.1