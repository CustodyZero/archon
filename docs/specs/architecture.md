# Archon Architecture

## 1. High-Level Components

Archon consists of six primary components:

1. Compiled Capability Modules (CCM)
2. Module Toggle Manager (MT)
3. Dynamic Restriction Engine (DRR)
4. Rule Snapshot Builder (RS)
5. Deterministic Validation Engine
6. Execution Gate

---

## 2. Rule Sources

### 2.1 Compiled Capability Modules (CCM)

- Developer-authored
- Compiled into deterministic internal representation (IR)
- Versioned and hashable
- Disabled by default unless explicitly enabled

Each module declares:
- Capability surfaces (actions, tools, delegation)
- Optional escalation requirements

---

### 2.2 Dynamic Restriction Rules (DRR)

- Authored via UI
- Stored as JSON/YAML
- Schema-validated
- Canonicalized
- Translated deterministically into IR

DRR may restrict but may not expand capability.

---

## 3. Snapshot Model

Every evaluation occurs against a Rule Snapshot (RS):

RS = Build(CCM_enabled, DRR_canonical, EngineVersion, Config)

RS is immutable once constructed.

Each RS produces:

RS_hash = Hash(CCM_hashes, DRR_hash, EngineVersion, ConfigHash)

All decisions reference RS_hash.

---

## 4. Validation Flow

1. Agent proposes action
2. Kernel retrieves active RS
3. Validation Engine evaluates:
   - Is action within enabled capabilities?
   - Does action comply with DRR?
4. Engine returns:
   - Permit
   - Deny
   - Escalate
5. Execution Gate enforces outcome
6. Structured log entry is recorded

No action executes without validation.

---

## 5. Profiles and Module Toggles

Profiles are deterministic mappings to module toggle sets.

Profiles:
- Are convenience wrappers
- Must surface explicit toggle changes
- Require operator confirmation (Confirm-on-Change)

Module Toggles are authoritative.

---

## 6. Logging and Replay

Each decision log includes:

- Agent ID
- Proposed action
- Decision
- Triggered rule identifiers
- RS_hash
- Input/output hashes
- Timestamp

Given RS_hash and input, decision must be reproducible.

---

## 7. Non-Goals

Archon does not include:

- Simulation branches
- Probabilistic policy evaluation
- Runtime code execution in rules
- Agent self-modification of permissions
- Learned capability expansion