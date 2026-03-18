# Archon Module API v0.1.1

**Status:** Binding (Kernel Interface Contract)  
**Supersedes:** Module API v0.1  
**Scope:** All modules (first-party and third-party), including provider modules  

---

# 1. Core Principle

No module may execute any side effect outside the Archon kernel gate.

All side effects occur only after:

- deterministic validation
- explicit operator enablement
- restriction compliance
- required approvals (including typed acknowledgments)

Modules do not inherit authority.

Modules do not compose authority.

All execution is kernel-mediated.

---

# 2. Module Manifest

The manifest is a static, load-time validated contract.

## Required Fields

- module_id
- module_name
- version
- description
- author
- license
- main
- capability_descriptors
- intrinsic_restrictions

## Optional Fields

- module_dependencies: ReadonlyArray<string>
- provider_dependencies: ReadonlyArray<CapabilityType>
- hazard_declarations
- suggested_profiles

## Loader Fields

- hash (content-derived)
- compiled_restrictions (IR)

## Validation

Loader MUST enforce:

- schema correctness
- taxonomy validity
- DAG integrity
- no cycles

---

# 2.1 Package Structure

Modules MUST:

- expose a single canonical entrypoint
- export a static manifest
- avoid runtime side effects during load

---

# 3. Capability Model

Capabilities are declarative.

They do not execute.

## Declared vs Effective

effective = reachable ∩ permitted

### Reachable

- module enabled
- dependencies traversed
- provider dependencies satisfied

### Permitted

- intrinsic restrictions
- dynamic rules
- resource scope

### Traversal Algorithm (Normative)

1. Start with module M
2. Add M.declared_capabilities
3. Traverse module_dependencies (DFS)
4. Include provider capability types
5. Deduplicate by capability identity
6. Filter disabled capabilities
7. Apply restriction filters
8. Apply resource scope filters

Result = effective capability set

---

# 4. Execution Model

Handlers MUST:

- be deterministic where possible
- use only kernel adapters
- never invoke modules directly

Execution signature:

execute(capability_instance, execution_context)

---

# 4.1 Composition

Composition is contract-level and DAG-based.

## Rules

- graph MUST be acyclic
- traversal is unrestricted by depth (contract-level)
- all execution is kernel-mediated

## Invocation

Module A invoking B:

1. A requests capability via kernel
2. Kernel evaluates B capability
3. Kernel enforces A authority bounds
4. Execution proceeds or is denied

## Authority Invariant

For any path A → B:

Authority(A) ⊇ RequestedCapability(B)

Else: deny

## Runtime Safety

Runtime MAY enforce:

- max call depth
- cycle re-entry protection
- execution budget

These are safety constraints, not semantic limits.

---

# 5. Restrictions

Intrinsic restrictions:

- DSL only
- monotonic
- side-effect free

Compiled and hashed.

---

# 6. Execution Surface (Adapters)

All side effects must pass through adapters.

## Stable

- Filesystem
- Network
- Exec
- Secrets

## Provisional

- Messaging
- UI

## Invariant

Every adapter call MUST include:

- project_id
- agent_id
- capability_id
- rs_hash

Calls without valid context MUST be rejected.

---

# 7. Proposals

Modules MAY suggest:

- profiles
- restrictions
- hazards

All require explicit approval.

---

# 8. Logging

All logs are kernel-controlled.

Modules MUST NOT:

- write files
- emit logs directly

---

# 9. Enablement

Modules:

- disabled by default
- require explicit enablement
- require acknowledgment for elevated capabilities

---

# 10. Security Model

Modules are untrusted.

They MUST NOT:

- access OS primitives directly
- open network connections
- execute subprocesses
- read secrets

All must go through adapters.

---

# 10.1 Non-Escalation

Composition MUST NOT increase authority.

Delegation MUST NOT increase authority.

If ambiguity exists → deny.

---

# 11. Compatibility

Modules MUST preserve:

- snapshot determinism
- restriction monotonicity
- DAG integrity
- governance invariants

---

# 12. Providers

Providers are modules.

## Naming

provider.{vendor}

## Behavior

Expose service capabilities.

## Transport

All external calls go through kernel adapters.

## Dependencies

Declared via provider_dependencies.

## Discovery

Filesystem only.

---

# 12.1 MCP

Archon is MCP-informed.

Archon is not MCP-dependent.

---

# 13. UI Boundary

No UI extensibility.

Only kernel-mediated UI interaction.

---

# 14. Summary

- Providers are modules
- Composition is DAG-based and unbounded (contract)
- Execution is kernel-mediated
- Authority is bounded
- Runtime limits are safety only
- UI is out of scope

---

End of Module API v0.1.1
