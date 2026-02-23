# Archon Governance and Rule Proposal Model v0.1

Archon enforces human authority over capability expansion.

Agents may propose changes.
Humans must approve.

---

# 1. Rule Proposal Flow

## Step 1: Proposal

An agent may propose:

- Module enablement/disablement
- Dynamic restriction change
- Delegation modification
- Profile creation

Proposal must include:

- Structured diff
- Reason
- Risk tier impact
- Hazard combination flags
- Proposed resulting snapshot hash

---

## Step 2: Review (Optional)

Other agents may:

- Analyze proposal
- Comment
- Suggest revisions

Review does not activate changes.

---

## Step 3: Human Approval

Only a human operator may:

- Approve
- Reject
- Modify proposal

Approval requires:

- Confirm-on-change flow
- Typed acknowledgment (if required)
- Snapshot rebuild

---

# 2. Hazard Matrix (Bounded Composition Safety)

Certain capability combinations trigger hazard flags.

Examples:

- fs.read + exec.run
- net.fetch.http + fs.write
- secrets.use + net.fetch.http
- agent.spawn + exec.run

When a flagged combination is enabled:

- Operator must explicitly confirm
- May require higher risk tier
- Event must be logged

Hazard evaluation occurs at configuration time, not action time.

---

# 3. Monotonicity Guarantee

Dynamic restriction rules may only reduce capability.

They may not expand capability.

Formal property:

Restrict(C, R_d) ⊆ C

---

# 4. Snapshot Integrity

All decisions reference a Rule Snapshot hash.

Rule changes require snapshot rebuild.

No implicit rule mutation permitted.

---

# 5. Extension Governance

New capability types require:

- Taxonomy PR
- Risk tier declaration
- Hazard matrix update
- Documentation update

Kernel must reject modules using undefined capability types.

---

# 6. Authority Boundary

Agents may:

- Propose rule changes

Agents may not:

- Self-approve rule changes
- Elevate risk tier autonomously
- Modify snapshot directly

Human authority is final.