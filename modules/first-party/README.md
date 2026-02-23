# First-Party Modules

This directory contains first-party modules shipped with Archon.

---

## Governance Position

First-party modules are **external to the kernel boundary**.

They follow the same module API contract as third-party modules.
See `docs/specs/module_api.md` for the full contract.

**There are no privileged modules in Archon.** First-party and third-party
modules are governed identically. A first-party module cannot:
- Modify kernel validation logic
- Alter snapshot hashing
- Register enforcement hooks
- Self-enable

A first-party module can:
- Declare capabilities using existing taxonomy types
- Declare intrinsic restrictions via the Archon Restriction DSL
- Declare hazard pairs
- Suggest profiles (non-authoritative)

---

## Default Posture

First-party modules are **disabled by default**.

They ship with Archon as operator convenience — not as trusted or privileged
extensions. Enabling any first-party module requires the same explicit operator
confirmation required for any other module (Confirm-on-Change posture).

No first-party module may declare `default_enabled: true`. The module loader
enforces this at load time. See `docs/specs/formal_governance.md §5` (Invariant I1).

---

## Adding a First-Party Module

Each first-party module is a separate directory under `modules/first-party/`
with its own `package.json` and module manifest.

Requirements before a first-party module can be added:
1. All capability types must exist in the core taxonomy
   (`docs/specs/capabilities.md`)
2. Module manifest must pass full `ModuleValidator` validation
3. All `default_enabled` fields must be `false`
4. Intrinsic restrictions must be valid Archon Restriction DSL
5. Hazard pairs must be declared for any hazardous capability combinations
6. A PR updating this README with the module description

See `docs/specs/module_api.md` for the complete module API contract.
