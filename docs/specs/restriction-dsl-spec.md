# Archon Restriction DSL
## Design Specification (pre-v0.1)

Status: Design in Progress — Subject to Change  
Target: v0.1  
Location when implemented: `packages/restriction-dsl/`

---

## 1. Purpose

The Archon Restriction DSL is the language in which modules express
intrinsic restrictions over capability instances.

It exists because the module API requires intrinsic restrictions to be:

- Side-effect free
- Non-Turing-complete
- Monotone filters over capability instances
- Compilable to canonical IR for snapshot hashing

A general-purpose language cannot satisfy these constraints without
external enforcement. A purpose-built DSL satisfies them structurally.

---

## 2. Constraints (Non-Negotiable)

These constraints derive directly from the formal governance model
and are not subject to design tradeoffs.

**Non-Turing-complete**  
No recursion. No unbounded iteration. No dynamic dispatch.
The language must terminate for all inputs.

**Side-effect free**  
Restrictions are pure predicates. They observe capability instances
and context. They do not modify state, emit events, or call external
systems.

**Monotone (restriction-only)**  
A restriction predicate may only reduce the effective capability set.
It may not expand it. There is no construct that permits an action
that was previously denied.

**Composable via conjunction**  
All restriction predicates over a capability type compose via logical
AND. A module's intrinsic restrictions AND the operator's dynamic
restrictions must both hold. There is no OR composition between
restriction sources.

**Compilable to deterministic IR**  
The kernel compiles DSL expressions to a canonical internal
representation that is included in the rule snapshot hash. Identical
DSL source must produce identical IR. The compiler is deterministic.

---

## 3. Expression Model

A restriction is a named predicate block scoped to a capability type.

```
restrict <capability_type> {
  <condition>
  <condition>
  ...
}
```

All conditions within a block must hold (implicit AND).
There is no OR within a restriction block.
There is no NOT that widens scope.

Multiple `restrict` blocks on the same capability type from different
modules compose via conjunction — all must hold.

---

## 4. Condition Syntax

A condition is a comparison between a field reference and a value.

```
<field_path> <operator> <value>
```

### 4.1 Field References

Field paths are dot-notation references into:

- `capability.params.*` — the capability instance parameters
- `context.agent.*`     — the requesting agent's properties
- `context.session.*`   — the current session properties
- `workspace.*`         — workspace-level context (root, id)

Field paths must resolve at evaluation time. Unresolvable paths
are treated as a deny condition — they do not error silently.

### 4.2 Operators

| Operator     | Meaning                                      |
|--------------|----------------------------------------------|
| `==`         | Exact equality                               |
| `!=`         | Inequality                                   |
| `<=`         | Less than or equal (numeric)                 |
| `>=`         | Greater than or equal (numeric)              |
| `<`          | Less than (numeric)                          |
| `>`          | Greater than (numeric)                       |
| `in`         | Value is a member of a declared list         |
| `not_in`     | Value is not a member of a declared list     |
| `matches`    | String matches a glob pattern (no regex)     |
| `is_defined` | Field is present and non-null                |
| `is_null`    | Field is absent or null                      |

No arbitrary expressions. No function calls. No string interpolation
beyond declared context references.

### 4.3 Values

Values may be:

- String literals: `"value"`
- Numeric literals: `10_485_760`
- Boolean literals: `true`, `false`
- List literals: `["GET", "HEAD", "OPTIONS"]`
- Context references: `workspace.root`, `context.agent.tier`
- Arithmetic on numeric literals and context references:
  `workspace.root + "/**"` (string concat for glob construction only)

No variables. No assignments. No computed values beyond the above.

---

## 5. Example Restrictions

### 5.1 Filesystem Write

```
restrict fs.write {
  # Writes must stay within declared workspace
  path matches workspace.root + "/**"

  # Size ceiling
  max_bytes <= 10_485_760

  # No overwrite unless the capability explicitly allows it
  overwrite_allowed == false
}
```

### 5.2 Network Fetch

```
restrict net.fetch.http {
  # Domain must be in the capability's declared allowlist
  domain in capability.params.domain_allowlist

  # Only read-only HTTP methods
  method in ["GET", "HEAD", "OPTIONS"]

  # Response size ceiling
  max_bytes <= 1_048_576
}
```

### 5.3 Agent Spawn

```
restrict agent.spawn {
  # Spawned agent tier cannot exceed the spawning agent's tier
  profile.max_tier <= context.agent.tier

  # Resource limits must be explicitly declared
  resource_limits is_defined
}
```

### 5.4 Secret Use

```
restrict secrets.use {
  # Secret may only flow to declared sink types
  sink_type in ["env_var", "file"]

  # Target process must be declared
  target_process is_defined
}
```

---

## 6. What the DSL Cannot Express

The following are intentionally out of scope and must remain so:

- **Expansion conditions** — no construct may permit an action that
  would otherwise be denied by capability bounds or other restrictions.

- **Side-effecting predicates** — no logging, no counters, no state
  mutation within a restriction expression.

- **Recursive structures** — no self-referential conditions, no
  indirect recursion through context references.

- **Arbitrary code execution** — no eval, no dynamic dispatch, no
  embedded scripting.

- **Cross-capability reasoning** — a restriction on `fs.write` may
  not reference the state of a `net.fetch.http` capability instance.
  Restrictions are scoped to their declared capability type.

- **Time-based conditions** — restrictions must be stateless with
  respect to time. Rate limits and quotas are implemented at the
  kernel level, not in the DSL.

---

## 7. Compilation and IR

The DSL compiler produces a canonical internal representation (IR)
consumed by the validation engine.

Compilation is:

- Deterministic: identical source produces identical IR
- Rejecting: invalid DSL fails at compile time, never at evaluation
- Hashing: IR is included in the rule snapshot hash

The IR format is an internal kernel concern and is not part of the
module API contract. Modules interact with the DSL source only.

### 7.1 Compiler Responsibilities

1. Parse DSL source
2. Validate field references against declared capability type schema
3. Validate operator applicability (e.g., `matches` only on strings)
4. Validate value types
5. Reject any construct outside the permitted grammar
6. Produce canonical IR with stable ordering
7. Compute and return IR hash for snapshot inclusion

### 7.2 Compiler Rejection Criteria

The compiler MUST reject:

- Unknown capability types
- Unknown field references
- Type mismatches between field and value
- Use of prohibited operators or constructs
- DSL that attempts expansion semantics
- DSL that references external state

---

## 8. Relationship to Dynamic Restriction Rules

The DSL is used for module-level intrinsic restrictions only.

Dynamic Restriction Rules (DRR) are operator-authored via UI and
stored as JSON/YAML. They are validated against a separate schema
and compiled to the same IR format.

Both restriction sources compose via conjunction at evaluation time.
Neither source can override the other.

DRR and intrinsic restrictions share the IR format and are both
included in the rule snapshot hash.

---

## 9. Open Design Questions (pre-v0.1)

The following questions require resolution before v0.1 tagging:

1. **Glob semantics** — what glob standard governs `matches`?
   Recommend: minimatch-compatible, documented explicitly.

2. **Context reference scope** — exact set of available context
   references needs to be enumerated and stabilized before the
   compiler can be fully implemented.

3. **Error message format** — when a restriction denies an action,
   what information does the decision log include about which
   specific condition failed?

4. **Numeric type handling** — are all numerics treated as 64-bit
   floats, or is there a distinction between integer and float
   contexts?

5. **List value size limits** — should there be a maximum number
   of items in a list literal to prevent abuse?

---

## 10. Implementation Notes

The restriction DSL compiler will live in `packages/restriction-dsl/`.

The package will export:

- `compile(source: string, capabilityType: CapabilityType): RestrictionIR`
- `validate(source: string, capabilityType: CapabilityType): ValidationResult`
- `hash(ir: RestrictionIR): string`

The validation engine in `packages/kernel/` will consume
`RestrictionIR` only — it will never parse DSL source directly.

---

*Archon Restriction DSL — Design Specification (pre-v0.1)*  
*Subject to change prior to v0.1 tagging.*  
*Part of the Archon founding specification — see `docs/spec/`.*