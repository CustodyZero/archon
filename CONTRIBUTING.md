# Contributing to Archon

The kernel's governance invariants are not negotiable. Read
`docs/specs/formal_governance.md` before opening a PR that touches
`packages/kernel/`.

CI enforces the invariants. PRs that bypass enforcement will not merge.

---

## Contribution Areas

### Kernel (`packages/kernel/`)

High bar. The kernel is the enforcement boundary — changes here affect the
correctness of every governance guarantee the system makes.

Requirements before opening a PR:
- Open an issue first and describe what you intend to change and why
- Read `docs/specs/formal_governance.md` in full
- Read `docs/specs/authority_and_composition_spec.md` in full
- Identify which governance invariants your change touches
- Include deterministic verification (tests) for every behavior that changes
- All seven invariant CI checks must pass

If your change would cause an agent to execute an action it was not explicitly
permitted to execute, it will not merge.

### Restriction DSL (`packages/restriction-dsl/`)

Design phase. The DSL specification is in `docs/specs/reestriction-dsl-spec.md`
and has open design questions that must be resolved before v0.1.

Discuss before implementing. Open an issue. Changes to the DSL grammar or IR
format are architectural changes with kernel-level impact.

### Module Loader (`packages/module-loader/`)

Moderate bar. The module loader implements Invariant I7 (taxonomy soundness).
Changes that weaken manifest validation or hash verification will not merge.

### CLI (`packages/cli/`) and Desktop (`packages/desktop/`)

Standard bar for operator tooling. Follow the module and kernel contracts.
CLI commands must accurately reflect system state — no fake progress, no
silent failures, no success messages on unimplemented paths.

### First-Party Modules (`modules/first-party/`)

Follow the module API contract in `docs/specs/module_api.md`. First-party
modules are governed identically to third-party modules — there is no elevated
trust. Modules are disabled by default. No exceptions.

### Documentation and Specification (`docs/specs/`)

Welcome, but precision is required. Spec documents are binding. Changes to
spec documents must be consistent with the formal governance model and must
not weaken any invariant without a corresponding formal justification.

---

## Branch Strategy

- `main` — stable, tagged releases only
- `develop` — active development, must pass all CI checks
- `feature/*` — individual contributions, branch from `develop`

PRs target `develop`. Maintainer merges `develop` → `main` at release.

---

## PR Requirements

- TypeScript strict mode must pass: no `@ts-ignore`, no untyped `any` except
  where explicitly unavoidable and documented with justification
- All invariant CI checks must pass (see `tools/ci/invariant-checks.md`)
- Spec references in JSDoc for all interfaces and classes in `packages/kernel/`
- No new `default_enabled: true` capabilities without explicit documentation
  and maintainer approval
- One primary intent per PR — no mixed-intent changes (see `CLAUDE.md`)
- Behavior that changes must have deterministic verification

---

## Licensing

Archon is Apache 2.0 permanently. Contributions are accepted under Apache 2.0.
CustodyZero will not relicense. This is not a hedged statement.

By submitting a contribution, you agree that your contribution is licensed
under Apache 2.0 and that CustodyZero may distribute it under those terms.

---

## The Line

If your contribution would cause an agent to execute an action it was not
explicitly permitted to execute, it will not merge.

This applies regardless of test coverage, code quality, or stated intent.
