# Archon Formal Governance Model v0.1

Status: Binding (Kernel-Level Governance Specification)

This document defines the formal governance guarantees of Archon under module stacking, capability composition, and operator risk configuration.

This model governs:

- Module composition
- Capability expansion
- Restriction monotonicity
- Delegation safety
- Hazard composition
- Governance invariant preservation

This document does not define domain safety.
It defines authority safety.

---

# 1. Definitions

Let:

- 𝓜 = set of all modules
- S ⊆ 𝓜 = enabled module set
- 𝓣 = set of capability types (taxonomy)
- 𝓒 = set of capability instances

Each module m ∈ 𝓜 may contribute:

- Cₘ ⊆ 𝓒            (capability descriptors)
- Rₘ : 𝓒 → {0,1}    (intrinsic restriction predicate)
- Hₘ ⊆ 𝓣 × 𝓣        (hazard declarations)

Let:

- R_d : 𝓒 → {0,1}    (dynamic restriction predicate)
- G ⊆ A × A          (delegation graph over agents A)

---

# 2. Capability Construction

## 2.1 Union of Module Capabilities

C(S) = ⋃_{m ∈ S} Cₘ

System boot state:

S = ∅  
⇒ C(S) = ∅

Therefore:

∀ c ∉ C(S), Deny(c)

This proves deny-by-default capability construction.

---

# 3. Restriction Composition

## 3.1 Intrinsic Restriction Composition

Intrinsic restrictions compose via logical conjunction:

R_intr(S)(c) = ∧_{m ∈ S} Rₘ(c)

## 3.2 Effective Capability Set

C_eff(S) = { c ∈ C(S) | R_intr(S)(c) = 1 ∧ R_d(c) = 1 }

---

# 4. Monotonicity Properties

## 4.1 Restriction Monotonicity

For S ⊆ S′:

R_intr(S′)(c) ≤ R_intr(S)(c)

Therefore:

C_eff(S′) ⊆ C(S′)

Dynamic restrictions cannot expand capability:

C_eff(S) ⊆ C(S)

This guarantees restriction monotonicity.

---

# 5. Governance Invariant Set

Let 𝓘 be the set of governance invariants:

I1: Deny-by-default capability  
I2: Restriction monotonicity  
I3: Human approval required for capability expansion  
I4: Snapshot determinism  
I5: Typed acknowledgment on tier elevation  
I6: Delegation non-escalation  
I7: Taxonomy soundness (unknown types rejected)

---

# 6. Invariant Preservation Under Module Stacking

For S ⊆ S′:

∀ I ∈ 𝓘,  
I(Σ(S)) ⇒ I(Σ(S′))

Where Σ(S) is the full system state:

Σ(S) = (C_eff(S), G, Tier(S), Snapshot(S), KernelLogic)

This holds because:

- Kernel logic is immutable and not modifiable by modules.
- Modules may only contribute declarative capability descriptors and intrinsic restrictions.
- Modules cannot modify approval semantics.
- Modules cannot modify snapshot construction.
- Modules cannot alter taxonomy validation.

Therefore governance invariants are kernel-level invariants and are preserved under stacking.

---

# 7. Risk Tier Model

Define Tier: 𝓒 → {T0, T1, T2, T3}

With strict order:

T0 < T1 < T2 < T3

System tier:

Tier(S) = max_{c ∈ C_eff(S)} Tier(c)

Tier elevation occurs when:

Tier(S′) > Tier(S)

Typed acknowledgment is required for any elevation.

Modules cannot suppress typed acknowledgment requirements.

---

# 8. Hazard Composition Model

Define hazard relation:

H ⊆ 𝓣 × 𝓣

Hazards(S) = { (t_i, t_j) ∈ H |  
∃ c_i, c_j ∈ C(S): Type(c_i)=t_i ∧ Type(c_j)=t_j }

If Hazards(S) ≠ ∅:

- Explicit operator confirmation required
- Tier may escalate
- Event must be logged

Hazard evaluation occurs at configuration time.

Hazards do not prohibit capability.
They enforce explicit acknowledgment.

---

# 9. Delegation Non-Escalation

Let C_eff(S, a) be the effective capability set assigned to agent a.

Delegation rule:

(a_i → a_j) ∈ G  
⇒ a_i may request a_j to execute c only if c ∈ C_eff(S, a_j)

Agents may not cause other agents to execute capabilities they do not possess.

Delegation does not expand capability.

---

# 10. Snapshot Determinism

Define snapshot:

RS(S) = (C_eff(S), EngineVersion, ConfigHash)

Decision function:

D(action, RS)

For identical RS:

D(action, RS₁) = D(action, RS₂)

This guarantees replayability and deterministic governance.

Modules cannot alter RS construction.

---

# 11. Module Contract

A module may:

- Declare capabilities using existing taxonomy types
- Declare intrinsic restrictions via approved DSL
- Declare hazard pairs
- Suggest profiles (non-authoritative)

A module may not:

- Modify validation algorithm
- Modify snapshot hashing
- Alter tier ordering
- Disable approval workflow
- Introduce unknown capability types
- Register arbitrary runtime hooks into enforcement logic

Modules are declarative only.

---

# 12. Taxonomy Soundness

For any capability c with type t:

If t ∉ 𝓣  
⇒ Reject module load

This prevents silent namespace drift.

New types require:

- Taxonomy PR
- Risk tier declaration
- Hazard matrix update
- Documentation update

---

# 13. CI Enforcement Requirements

To maintain formal guarantees:

1. Property tests must verify:
   - Restriction monotonicity
   - Snapshot determinism
   - Delegation non-escalation

2. Static checks must verify:
   - No module alters kernel enforcement logic
   - No module auto-enables itself
   - No module suppresses confirmation requirements
   - No unknown capability types are declared

3. Hazard matrix coverage must be enforced.

---

# 14. Governance Guarantee Summary

Archon guarantees:

- No capability exists unless explicitly enabled.
- No dynamic rule may expand capability.
- No module stacking weakens governance invariants.
- No delegation escalates authority.
- No risk tier elevation occurs silently.
- No capability type may be introduced without explicit taxonomy change.
- All decisions are deterministic and replayable.

Archon does not guarantee domain safety.

It guarantees authority integrity.

---

End of Formal Governance Model v0.1