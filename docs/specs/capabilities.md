# Archon Capability Taxonomy v0.1

Status: Binding (Core Taxonomy)

This document defines the canonical capability types recognized by the Archon kernel.

No module may introduce new capability types at runtime.
New types require a core taxonomy change via PR.

---

# 1. Taxonomy Principles

1. Deny by default.
2. Capabilities are structured and typed.
3. Each capability declares a risk tier.
4. High-risk capabilities require typed acknowledgment.
5. Unknown capability types are rejected.

---

# 2. Risk Tier Model

Risk tiers are strictly ordered:

T0 < T1 < T2 < T3

### T0 — Chat Only
- No tool invocation
- No spawning
- No I/O
- No network

### T1 — Read-Only / Low Risk
- Limited file read
- Restricted HTTP fetch
- No mutation

### T2 — Mutating / Bounded
- Controlled file writes
- Agent spawning (restricted)
- Bounded delegation

### T3 — High Risk
- Subprocess execution
- Credential usage
- Broad network egress
- Delegation that expands authority

Enabling T3 capabilities requires typed acknowledgment.

---

# 3. Capability Families

## A. Agent Coordination

### agent.spawn
Tier: T2  
Params:
- model_id
- profile
- resource_limits

### agent.message.send
Tier: T1  
Params:
- target_agent
- channel

### agent.delegation.grant
Tier: T2  
Params:
- from_agent
- to_agent
- scope

### agent.delegation.revoke
Tier: T1  

### agent.terminate
Tier: T2  

---

## B. Filesystem

### fs.read
Tier: T1  
Params:
- path_glob
- max_bytes

### fs.list
Tier: T1  
Params:
- path_glob

### fs.write
Tier: T2  
Params:
- path_glob
- max_bytes
- overwrite_allowed

### fs.delete
Tier: T3  
Params:
- path_glob

Typed acknowledgment required.

---

## C. Execution

### exec.run
Tier: T3  
Params:
- cmd_glob
- cwd
- env_allowlist
- cpu_limit
- memory_limit
- timeout

Typed acknowledgment required.

---

## D. Network

### net.fetch.http
Tier: T1  
Params:
- domain_allowlist
- method_allowlist
- max_bytes

### net.egress.raw
Tier: T3  
Params:
- address_allowlist

Typed acknowledgment required.

---

## E. Credentials / Secrets

### secrets.read
Tier: T2  
Params:
- secret_ids

### secrets.use
Tier: T3  
Params:
- secret_id
- sink_type

Typed acknowledgment required.

### secrets.inject.env
Tier: T3  
Params:
- secret_id
- target_process

Typed acknowledgment required.

---

## F. Operator Interaction

### ui.request_approval
Tier: T0

### ui.present_risk_ack
Tier: T0

### ui.request_clarification
Tier: T0

---

## G. Inference

### llm.infer
Tier: T1
Params:
- model_id
- temperature
- max_tokens

ack_required: false

Inference is exposure risk only.
Downstream execution (tool calls, code execution, data writes) requires
separate capability enablement. Enabling llm.infer does not implicitly
grant any other capability.

---

# 4. Typed Acknowledgment Rule

Any capability marked as requiring acknowledgment must trigger:

- Explicit toggle diff display
- Typed operator confirmation phrase
- Logged acceptance event
- Snapshot rebuild

No silent enablement permitted.

---

# 5. Taxonomy Extension Rule

Adding a new capability type requires:

1. PR updating this document
2. Declared risk tier
3. Parameter schema
4. Hazard matrix update (see GOVERNANCE.md)
5. Version increment

Kernel must reject unknown capability types.

Taxonomy version: v0.1 → v0.2 (added llm.infer in Section G).