# Archon Principles

## 1. Determinism

Given identical:

- Agent
- Action
- Rule Snapshot

The decision outcome must be identical.

---

## 2. Operator Primacy

The operator alone controls:

- Enabled capability modules
- Active dynamic restrictions

No implicit authority expansion is permitted.

---

## 3. Hard Capability Bounds

Dynamic rules may restrict capability.

Dynamic rules may not expand capability.

---

## 4. Explicit Composition

Permit requires:

- Action ∈ Enabled Capability Set
- Action complies with Dynamic Restrictions

Deny overrides allow.

---

## 5. Snapshot Integrity

All decisions must reference a hashed Rule Snapshot.

Rule changes require snapshot rebuild.

No floating rule state.

---

## 6. Confirm-on-Change

The following require explicit operator confirmation:

- Enabling modules
- Applying profiles
- Modifying dynamic restrictions

---

## 7. No Emergent Autonomy

Archon prohibits:

- Self-authorizing agents
- Implicit delegation chains
- Learned permissions
- Runtime rule mutation by agents

---

## 8. Inspectability

All decisions must be:

- Logged
- Replayable
- Attributable to explicit rule sources

Silence does not imply permission.