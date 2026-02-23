# Security Policy

Archon is an enforcement system. A security vulnerability that allows an agent
to bypass kernel validation is a fundamental failure of the product's core
guarantee, not a standard bug. These reports are treated accordingly.

---

## Priority Vulnerabilities

The following classes of vulnerability are treated as **critical** regardless
of perceived exploitability, CVSS score, or required preconditions:

1. **Validation bypass** — any path that allows a capability to execute
   without passing through the execution gate
2. **Snapshot tampering** — any path that allows rule state to diverge from
   the active snapshot hash without triggering a rebuild
3. **Module enforcement hook** — any path that allows a module to register
   logic into the validation or gate flow
4. **Delegation escalation** — any path that allows an agent to cause another
   agent to execute capabilities it does not possess
5. **Silent capability expansion** — any path that enables a capability
   without surfacing an operator-visible toggle change
6. **Governance invariant bypass** — any mechanism that causes any of the
   seven formal invariants (I1–I7) to be violated at runtime

For these classes: if it can happen at all, it is critical.

---

## Reporting

**Email:** security@custodyzero.com

Include:
- Description of the vulnerability
- Which governance invariant(s) it violates (if applicable)
- Steps to reproduce
- Impact assessment
- Whether you have a proposed fix

Do not open a public GitHub issue for security vulnerabilities.

---

## Response Commitments

| Milestone | Commitment |
|-----------|-----------|
| Acknowledgment | Within 48 hours of receipt |
| Initial assessment | Within 5 business days |
| Coordinated disclosure | Agreed upon with reporter before public disclosure |
| Credit | Offered to reporter (opt-in) |

---

## In Scope

| Area | Examples |
|------|---------|
| Kernel validation logic | Bypasses, incorrect outcomes, missing log entries |
| Snapshot construction and hashing | Determinism failures, hash collisions, tampering |
| Module loader validation | Unknown type acceptance, hash bypass, manifest spoofing |
| Execution gate enforcement | Gate bypass, missing confirmation flow |
| Delegation enforcement | Authority escalation, transitive capability expansion |
| Governance invariant violations | Any of I1–I7 being violated at runtime |
| CLI and desktop IPC security | IPC privilege escalation, kernel bypass via UI |

## Out of Scope

| Area | Notes |
|------|-------|
| Social engineering | Not a code vulnerability |
| Physical access attacks | Out of scope for this product |
| Vulnerabilities in dependencies | Report upstream; we track transitive risk |
| UI/UX issues that do not affect enforcement | File as standard issues |
| Performance issues | File as standard issues |

---

## Coordinated Disclosure

We follow coordinated disclosure. We will work with reporters to agree on a
disclosure timeline before publishing details. We will not disclose without
reporter consent except where legally required or where active exploitation
is observed.

Given Archon is an enforcement kernel, all vulnerability reports related to
governance invariant bypass are treated as critical regardless of perceived
exploitability. The threat model for Archon includes adversarial modules and
adversarial agents — "low severity because it requires a malicious module" is
not a mitigation.
