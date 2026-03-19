# Archon Invariant CI Checks

This document specifies the static analysis and property tests that must be
implemented and passing before Archon can be tagged v0.1.

These requirements derive directly from `docs/specs/formal_governance.md §13`
(CI enforcement requirements).

---

## Architectural Boundary Checks

These checks enforce structural invariants of the package dep graph. They are
distinct from the governance invariants (IC-1 through IC-5 below): they guard
against accidental boundary violations that would corrupt the dep order or
introduce circular dependencies.

### DEP-1: Package Dependency Order (runtime-host → module-loader)

**Status:** [x] IMPLEMENTED — `tools/ci/check-dep-graph.sh`

**Invariant:** `packages/runtime-host` must never import `@archon/module-loader`.

Package dep order: `restriction-dsl → kernel → runtime-host → module-loader → cli/desktop`

`runtime-host` sits above `kernel` and strictly below `module-loader` in the
dep graph. An import in either direction would create a circular dependency.

**What the script verifies:**
- [x] No `from '@archon/module-loader'` ES module import in `packages/runtime-host/src/`
- [x] No `from '@archon/module-loader'` ES module import in `packages/runtime-host/test/`
- [x] `packages/runtime-host/package.json` does not list `@archon/module-loader`
  in `dependencies`, `devDependencies`, or `peerDependencies`

**Local use:** `pnpm check:dep-graph` or `bash tools/ci/check-dep-graph.sh`

---

## Governance Invariant Checks

The `invariant-checks` CI job stubs IC-1 through IC-5. Each check below must
become a real enforcement gate before v0.1 is tagged.

## Checks

### IC-1: Restriction Monotonicity

**Invariant:** I2 — Dynamic restriction rules may reduce capability, never expand it.
`C_eff(S) ⊆ C(S)` must hold for all module sets S.

**What to verify:**
- [ ] No DRR rule contains a construct that permits an action that would otherwise
  be denied by capability bounds
- [ ] No DSL source in any module's `intrinsic_restrictions` contains an expansion
  construct
- [ ] The compiler rejects all expansion semantics at compile time
  (see `docs/specs/reestriction-dsl-spec.md §6`)
- [ ] Property test: for any generated capability set C and restriction set R,
  `evaluate(c, R)` never returns Permit for c ∉ C

**Implementation approach:**
Property-based test using generated capability sets and restriction rules.
Compiler-level static rejection of expansion constructs.

---

### IC-2: Snapshot Determinism

**Invariant:** I4 — Given the same snapshot and the same action, the decision is always identical.

**What to verify:**
- [ ] `SnapshotBuilder.hash(snapshot)` is deterministic: identical snapshot content
  produces identical RS_hash regardless of property insertion order
  (canonical JSON sort covers this — verify with a round-trip test)
- [ ] `ValidationEngine.evaluate(action, snapshot)` is a pure function: same inputs,
  same output, no side effects that affect the outcome
- [ ] `compiler.hash(ir)` is deterministic: identical IR produces identical hash
- [ ] Property test: serialize, deserialize, and re-hash a snapshot — must match original

**Implementation approach:**
Unit tests for `SnapshotBuilder.hash()` and `compiler.hash()` with known fixtures.
Property test: random snapshot → hash → re-serialize → re-hash → assert equal.

---

### IC-3: Delegation Non-Escalation

**Invariant:** I6 — An agent may not cause another agent to execute capabilities
it does not itself possess. Delegation does not expand authority.

**What to verify:**
- [ ] `ValidationEngine.evaluate()` checks delegation capability types against
  the requesting agent's own effective capability set
- [ ] An `agent.spawn` or `agent.delegation.grant` action is denied if the requested
  spawn profile or delegation scope exceeds the requesting agent's own capabilities
- [ ] Property test: generate a delegation request where target capabilities are a
  strict superset of requesting agent capabilities — must return Deny

**Implementation approach:**
Property-based test: for any agent A with capability set C_A and any spawn/delegation
request requesting C_B where C_B ⊄ C_A, evaluate() must return Deny.

---

### IC-4: No Module Alters Kernel Enforcement Logic

**Invariant:** Modules are declarative only. Modules cannot modify the validation
algorithm, snapshot hashing, tier ordering, or approval workflow.
`docs/specs/formal_governance.md §11`

**What to verify:**
- [ ] Static analysis: no module package imports and modifies classes from
  `packages/kernel/src/validation/` or `packages/kernel/src/snapshot/`
- [ ] Static analysis: no module registers callbacks or hooks into the
  `ValidationEngine` or `ExecutionGate`
- [ ] Module manifests contain only declarative fields (no executable code paths)
- [ ] The `KernelAdapters` interface cannot be overridden by a module

**Implementation approach:**
ESLint or AST-based static analysis rule.
Dependency analysis: packages/modules/* must not import from kernel validation internals.

---

### IC-5: No Module Auto-Enables Itself

**Invariant:** I1 — All modules start Disabled. No module can enable itself.
`ModuleRegistry.register()` enforces Disabled initial state.

**What to verify:**
- [ ] Static analysis: no module manifest sets `default_enabled: true`
  (the module loader also rejects this at runtime — this is the static check)
- [ ] `ModuleRegistry.register()` sets initial status to `ModuleStatus.Disabled`
  (verify in unit tests)
- [ ] No module manifest in `modules/first-party/` contains `default_enabled: true`
- [ ] Property test: register N random module manifests, verify all start Disabled

**Implementation approach:**
AST scan of all module manifest files for `default_enabled: true`.
Unit test for `ModuleRegistry.register()` verifying initial Disabled state.

---

## Implementation Status

All five checks are IMPLEMENTED and wired into CI as named enforcement gates.

| Check | Script | Method |
|-------|--------|--------|
| IC-1 | `tools/ci/check-ic1-monotonicity.sh` | Runs kernel monotonicity + restriction eval tests |
| IC-2 | `tools/ci/check-ic2-snapshot-determinism.sh` | Runs kernel snapshot hashing + compiler determinism tests |
| IC-3 | `tools/ci/check-ic3-delegation.sh` | Runs kernel delegation non-escalation tests |
| IC-4 | `tools/ci/check-ic4-kernel-boundary.sh` | Static analysis: no module imports kernel internals |
| IC-5 | `tools/ci/check-ic5-no-self-enable.sh` | Static scan: no module sets default_enabled: true |
