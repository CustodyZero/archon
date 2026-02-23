# Archon Module API v0.1

Status: Binding (Kernel Interface Contract)

This document defines the required interface between the Archon kernel and all modules.

There are no internal modules.

Modules may be first-party (shipped with Archon) or third-party (community), but all modules are external to the kernel boundary and are governed identically.

---

# 1. Core Principle

No module may execute any side effect outside the Archon kernel gate.

All side effects occur only after:

- deterministic validation
- explicit operator enablement
- restriction compliance
- required approvals (including typed acknowledgments where applicable)

---

# 2. Module Identity

Each module MUST declare:

- `module_id` (stable, globally unique)
- `module_name`
- `version` (semver)
- `description` (non-marketing)
- `author` (string)
- `license` (string)
- `hash` (content hash of module bundle, computed by Archon loader)
- `capability_types_used` (must be subset of core taxonomy)

A module declaring an unknown capability type MUST be rejected at load time.

---

# 3. Capability Descriptors

A module MUST provide a list of capability descriptors.

Each capability descriptor MUST include:

- `capability_id` (stable within module)
- `type` (must exist in core taxonomy)
- `tier` (T0–T3; must match taxonomy constraints)
- `params_schema` (JSON Schema fragment for params)
- `ack_required` (boolean; must match taxonomy and/or stricter)
- `default_enabled` (MUST be false unless explicitly included in a default profile)
- `hazards` (optional list of hazard pairs involving this capability type)

Capabilities are declarative metadata. They do not execute.

---

# 4. Tool Implementations

For each capability descriptor, the module MUST provide an implementation handler:

`execute(capability_instance, execution_context) -> result`

Constraints:

- The handler MUST be deterministic with respect to inputs where practicable.
- The handler MUST NOT call other module handlers directly.
- The handler MUST NOT bypass the kernel to access the filesystem, network, or OS primitives.
- The handler MUST use only kernel-provided adapters (see §6).

All execution MUST be mediated by kernel adapters to preserve governance guarantees.

---

# 5. Intrinsic Restrictions (Optional)

A module MAY provide intrinsic restrictions expressed only in the Archon Restriction DSL.

Intrinsic restrictions MUST be:

- side-effect free
- non-Turing-complete
- monotone filters over capability instances

A module MUST NOT supply executable predicate code.

The kernel MUST:

- validate intrinsic restrictions
- compile them into canonical IR
- include them in snapshot hashing

---

# 6. Kernel-Provided Adapters (Execution Surface)

Modules may execute side effects only via kernel adapters.

The kernel MUST provide adapters for:

- filesystem access
- network access
- subprocess execution
- secret retrieval / usage
- inter-agent messaging
- UI approval requests

Adapter calls MUST include:

- agent identity
- capability instance
- snapshot hash reference

The kernel MUST refuse adapter calls that are not associated with a validated action path.

---

# 7. Proposals and Configuration Hooks (Optional)

Modules MAY propose:

- profile templates
- restriction templates
- hazard recommendations

Modules MUST NOT auto-apply configuration.

All proposed changes must enter the proposal queue and require human approval under Confirm-on-Change posture.

---

# 8. Events and Logging

Modules MUST emit events only through kernel event APIs.

Kernel event emission MUST attach:

- `run_id`
- monotonic `seq`
- `module_id`
- `capability_id`
- `RS_hash`

Modules MUST NOT write directly to log files.

---

# 9. Loading, Enablement, and Defaults

## 9.1 Module Loading
The kernel MUST:

- validate module metadata
- validate capability types and schemas
- validate restriction DSL (if present)
- compute and store module hash

Invalid modules MUST be rejected.

## 9.2 Enablement
Modules are disabled by default.

Enablement requires:

- explicit operator action
- confirm-on-change flow
- typed acknowledgment if enabling T3 capabilities or elevating tier

---

# 10. Security and Integrity Constraints

Modules MUST NOT:

- execute code at load time beyond metadata registration
- register arbitrary hooks into validation
- modify kernel state outside approved configuration paths
- access environment variables directly (must use kernel adapter policy)
- implement their own network/file/exec stacks

Modules MUST be treated as untrusted extensions.

The kernel is the sole authority boundary.

---

# 11. Compatibility Requirements

A module MUST remain compatible with:

- core taxonomy enforcement
- snapshot model and hashing
- restriction monotonicity guarantees
- human-final authority approval

Any module attempting to subvert these constraints MUST be rejected.

---

End of Module API v0.1