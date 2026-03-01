# Archon Context Model Specification

**Document ID:** ACM-001  
**Version:** 1.0  
**Status:** Draft — Implementation-Targeted  
**Applies To:** Archon kernel, runtime-host, module-loader, UI, CLI  
**Owner:** Archon Core Team  

---

## 1. Purpose

Archon’s portability, auditability, and concurrency require a stable context model.

This document defines the minimum canonical context entities and the required event envelope so that:

- All coordination is attributable (who/what/where)
- All decisions are project-scoped
- All logs are portable and interpretable across devices
- P8 (concurrent projects) is structurally safe

This is architecture, not UX.

---

## 2. Non-Goals

- User authentication or online identity
- Multi-user collaboration
- Cryptographic signing (may come later)
- Network sync service design
- RBAC

---

## 3. Definitions

### 3.1 Archon Home

All state is rooted under `ARCHON_HOME` (per P5):

- `<ARCHON_HOME>/index.json`
- `<ARCHON_HOME>/projects/<projectId>/...`

No runtime component may write outside `ARCHON_HOME` except:
- application-level config that stores `ARCHON_HOME` itself (OS config dir)

### 3.2 Scope Hierarchy

- **Device**: physical/virtual machine instance
- **User**: local operator identity on a device (non-network)
- **Session**: a bounded runtime execution session (boot to shutdown)
- **Project**: the primary governance namespace and isolation boundary
- **Agent**: an execution identity operating within a project/session
- **Event**: an append-only record of coordination

---

## 4. Canonical Entities

### 4.1 DeviceContext

Purpose: bind coordination logs to an origin device without requiring network identity.

Required fields:

- `device_id` (string, stable per installation; ULID or UUID)
- `device_label` (string, optional; human-friendly)
- `created_at` (ISO8601)
- `archon_version` (string)

Storage:
- `<ARCHON_HOME>/device.json`

Constraints:
- `device_id` must not change unless explicitly reset by operator action.
- `device_id` is not secret, but it is sensitive (avoid casual exposure in UI).

### 4.2 UserContext

Purpose: represent the local operator (non-auth).

Required fields:

- `user_id` (string, stable per installation; ULID or UUID)
- `display_name` (string)
- `created_at` (ISO8601)

Storage:
- `<ARCHON_HOME>/user.json`

Constraints:
- Archon does not claim “identity verification.”
- This is attribution, not authentication.

### 4.3 SessionContext

Purpose: establish bounded runtime attribution and support drift analysis.

Required fields:

- `session_id` (ULID)
- `started_at` (ISO8601)
- `ended_at` (ISO8601, nullable)
- `device_id`
- `user_id`
- `archon_version`

Storage:
- In-memory at runtime; persisted on session end:
  - `<ARCHON_HOME>/sessions/<session_id>.json`

Constraints:
- A session begins at app start and ends on clean shutdown.
- Crash recovery may leave `ended_at` null.

### 4.4 ProjectContext

Purpose: stable project identity and active selection.

Project required fields (in project metadata):

- `project_id` (string)
- `name` (string)
- `created_at` (ISO8601)

Project selection required fields (global index):

- `active_project_id` (string)
- `last_active_at` (ISO8601)

Storage:
- `<ARCHON_HOME>/index.json` (active selection)
- `<ARCHON_HOME>/projects/<projectId>/metadata.json`

Constraints:
- All governance state and logs are strictly project-scoped.
- Switching projects is a hard boundary.

### 4.5 AgentContext

Purpose: attribute actions/decisions to a specific agent identity.

Required fields:

- `agent_id` (string; ULID)
- `agent_type` (enum: `operator`, `assistant`, `module`, `system`)
- `label` (string, optional)
- `project_id`
- `session_id`

Storage:
- Persisted per project:
  - `<ARCHON_HOME>/projects/<projectId>/state/agents.json`

Constraints:
- Agents are scoped to a project; they may be re-instantiated across sessions.
- `operator` agent represents the human, but still uses explicit approvals.

---

## 5. Required Event Envelope

All append-only logs (decisions, proposals, execution) must include the canonical envelope below.

### 5.1 Envelope Fields (Required)

- `event_id` (ULID)
- `event_type` (string enum; see §5.2)
- `timestamp` (ISO8601)
- `archon_version` (string)

Attribution:
- `device_id`
- `user_id`
- `session_id`
- `project_id`
- `agent_id`

Governance binding:
- `rs_hash` (string; RuleSnapshot hash bound to the decision)
- `schema_version` (integer; event schema version, default 1)

Payload:
- `payload` (object; event-type specific)

### 5.2 Event Types (Minimum Set)

- `context.input` (operator input / statement; no side effects)
- `proposal.created`
- `proposal.approved`
- `proposal.rejected`
- `proposal.applied`
- `governance.decision` (permit/deny with reasons)
- `execution.requested`
- `execution.completed`
- `snapshot.updated`
- `drift.status` (none/unknown/conflict + reasons/metrics)

Constraints:
- Event types must be stable strings.
- New types require incrementing `schema_version` only if envelope changes.

### 5.3 Append-only Requirement

- Logs are JSONL.
- Lines are appended; never rewritten.
- Dedupe (by `event_id`) occurs on read only (P6).

---

## 6. Enforcement Requirements

### 6.1 Runtime Enforcement

The runtime host must ensure every emitted event includes a complete envelope.

No “best effort.”
Missing envelope fields are P0 defects.

### 6.2 Kernel/Validation Binding

When a decision is logged:
- `rs_hash` must match the snapshot used to compute the decision.

When an execution is logged:
- it must include the same `project_id` and `agent_id` used for the decision.

---

## 7. UI/CLI Binding Requirements

- UI must display active `project_id` explicitly (not implicit).
- Project switching must reset transient UI state that could apply to the wrong project.
- CLI commands must run under a resolved `{user, session, project, agent}` context.

---

## 8. Migration

If existing logs lack envelope fields:
- Migration does **not** rewrite logs.
- Instead:
  - Read-time adapter supplies `unknown_*` placeholders and raises drift status `unknown`.
  - New events must always include the full envelope.

---

## 9. Determinism and Portability

The context model is portable when:
- project state and logs move under a new `ARCHON_HOME`
- envelope fields remain interpretable
- drift detection can attribute anomalies to devices/sessions

Secrets portability remains governed by `secrets.mode` (P5).

---

## 10. Readiness Criteria (Gate for P8)

P8 cannot begin until:

- DeviceContext exists and is stable
- UserContext exists and is stable
- SessionContext is generated per runtime start
- AgentContext is persisted per project
- All emitted events include the full envelope
- Tests validate:
  - envelope completeness
  - project isolation in logs
  - session attribution
  - cross-device portability does not break parsing