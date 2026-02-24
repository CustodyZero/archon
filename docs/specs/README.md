<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../brand/archon-wordmark-dark.svg" />
    <img src="../brand/archon-wordmark-blue.svg" alt="PlainSight Lab" width="280" />
  </picture>
</p>

# Archon Specification

This directory contains the founding specification documents for Archon.

The implementation serves these documents. If code and spec conflict, the
spec is correct and the code is wrong.

---

## Start Here

If you are new to Archon, read in this order:

**1. [archon.md](archon.md)**  
What Archon is and is not. Scope, core model, structural principles, design
position. Read this first. Everything else builds on it.

**2. [principles.md](principles.md)**  
The eight structural principles that govern every design decision.
Determinism, operator primacy, hard capability bounds, snapshot integrity,
confirm-on-change, no emergent autonomy, inspectability. These are invariants,
not guidelines.

**3. [architecture.md](architecture.md)**  
The six primary components and how they compose. Compiled Capability Modules,
Module Toggle Manager, Dynamic Restriction Engine, Rule Snapshot Builder,
Validation Engine, Execution Gate. Includes the validation flow and logging
model.

**4. [authority_and_composition_spec.md](authority_and_composition_spec.md)**  
The authoritative specification for the authority model, rule composition
semantics, and enforcement invariants. Status: Locked. This is the document
the kernel implementation is held against.

**5. [formal_governance.md](formal_governance.md)**  
The formal mathematical model. Proves deny-by-default capability construction,
restriction monotonicity, hazard composition, and delegation non-escalation
from first principles. Defines the seven governance invariants (I1–I7) that
CI must enforce. Read this before contributing to the kernel.

---

## Reference Documents

Read these when you need them:

**[capabilities.md](capabilities.md)**  
The canonical capability taxonomy. All capability types recognized by the
kernel, their risk tiers (T0–T3), parameter schemas, and acknowledgment
requirements. No module may introduce capability types not listed here.
New types require a PR updating this document.

**[module_api.md](module_api.md)**  
The binding interface contract between the kernel and all modules. First-party
and third-party modules are governed identically. Read this before writing
a module.

**[governance.md](governance.md)**  
The rule proposal and approval model. How agents propose changes, how humans
approve them, the hazard matrix for dangerous capability combinations, and
the monotonicity guarantee for dynamic restrictions.

**[profiles.md](profiles.md)**  
How profiles work as convenience wrappers over explicit module toggles.
Confirm-on-change policy, risk tier elevation, default posture, profile
transparency requirements.

**[restriction-dsl-spec.md](restriction-dsl-spec.md)**  
Design specification for the Archon Restriction DSL — the language modules
use to express intrinsic restrictions. Status: pre-v0.1, design in progress.
Non-Turing-complete, side-effect free, monotone filters only. Read this
before contributing to `packages/restriction-dsl/`.

---

## What This Spec Defines

Archon guarantees authority integrity, not domain safety.

Specifically:

- No capability exists unless explicitly enabled
- No dynamic rule may expand capability
- No module stacking weakens governance invariants
- No delegation escalates authority
- No risk tier elevation occurs silently
- No capability type may be introduced without explicit taxonomy change
- All decisions are deterministic and replayable

These guarantees are proven in `formal_governance.md` and enforced by CI.

---

## Contributing to the Spec

Spec documents are not living documents in the casual sense. Changes require
precision and justification.

Corrections and clarifications are welcome via PR. Scope changes — anything
that alters the authority model, the governance invariants, or the module
contract — require an issue first.

The kernel implementation follows the spec. The spec does not follow the
implementation.