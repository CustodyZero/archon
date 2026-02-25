/**
 * Archon Kernel — Deterministic Validation Engine
 *
 * The ValidationEngine is the core enforcement logic of the Archon kernel.
 * It evaluates proposed agent actions against an active Rule Snapshot and
 * returns a deterministic outcome.
 *
 * This class is responsible for maintaining all seven governance invariants:
 *
 * I1 — Deny-by-default capability:
 *   No capability exists unless explicitly enabled. S = ∅ ⇒ C(S) = ∅.
 *   If the action is not in the enabled capability set, it is denied.
 *
 * I2 — Restriction monotonicity:
 *   Dynamic restriction rules may reduce capability, never expand it.
 *   C_eff(S) ⊆ C(S). No rule may widen what an agent is permitted to do.
 *
 * I3 — Human approval required for capability expansion:
 *   Enabling a capability module requires explicit operator confirmation.
 *   The engine does not expand capability autonomously.
 *
 * I4 — Snapshot determinism:
 *   Given identical snapshot and identical action, the decision is always
 *   identical. D(action, RS₁) = D(action, RS₂) when RS₁ = RS₂.
 *   The engine has no side effects that affect evaluation outcome.
 *
 * I5 — Typed acknowledgment on tier elevation:
 *   Enabling T3 capabilities or elevating system risk tier requires typed
 *   acknowledgment. The engine enforces tier constraints.
 *
 * I6 — Delegation non-escalation:
 *   An agent may not cause another agent to execute capabilities it does
 *   not itself possess. (a_i → a_j) ∈ G ⇒ a_i may request a_j only for
 *   c ∈ C_eff(S, a_j). Delegation does not expand authority.
 *
 * I7 — Taxonomy soundness:
 *   Unknown capability types are rejected. Enforced by the module loader
 *   at load time, verified by the engine at evaluation time.
 *
 * @see docs/specs/formal_governance.md §5 (governance invariant set)
 * @see docs/specs/formal_governance.md §6 (invariant preservation under module stacking)
 * @see docs/specs/architecture.md §4 (validation flow)
 * @see docs/specs/authority_and_composition_spec.md §5 (composition semantics)
 */

import { normalize } from 'node:path';
import type { CapabilityInstance } from '../types/capability.js';
import { CapabilityType } from '../types/capability.js';
import { DecisionOutcome } from '../types/decision.js';
import type { EvaluationResult } from '../types/decision.js';
import type { RuleSnapshot } from '../types/snapshot.js';
import type { ResourceConfig } from '../types/resource.js';
import { evaluateDRRs } from '../restrictions/evaluator.js';

/**
 * The deterministic validation engine.
 *
 * Evaluates proposed agent actions against an active Rule Snapshot.
 * The engine is a pure function over its inputs — given the same snapshot
 * and the same action, it returns the same decision.
 *
 * This class cannot be modified by modules. The kernel logic is immutable
 * and not modifiable by modules (formal_governance.md §6).
 *
 * @see docs/specs/architecture.md §4 (validation flow, steps 3–4)
 * @see docs/specs/formal_governance.md §5 (seven governance invariants)
 */
export class ValidationEngine {
  /**
   * Evaluate a proposed capability instance against the active Rule Snapshot.
   *
   * Evaluation logic (composition semantics, Policy A):
   *   Permit iff:
   *     1. Capability containment: action ∈ C(S)  [Invariant I1, I7]
   *     2. Restriction compliance: Valid(action, R_d) = true  [Invariant I2]
   *   If (1) fails → Deny
   *   If (2) fails → Deny or Escalate (per explicit DRR/CCM conditions)
   *   Deny overrides Allow. No implicit widening.
   *
   * @param action - The capability instance proposed by the agent
   * @param snapshot - The active, immutable Rule Snapshot to evaluate against
   * @returns EvaluationResult — outcome plus triggered rule IDs
   *
   * @see docs/specs/formal_governance.md §5 (I1–I7 invariants)
   * @see docs/specs/authority_and_composition_spec.md §5 (composition semantics)
   */
  evaluate(
    action: CapabilityInstance,
    snapshot: RuleSnapshot,
  ): EvaluationResult {
    // I2-P4: project isolation — action and snapshot must belong to the same project.
    // An action scoped to project A cannot be evaluated against project B's snapshot.
    // This enforces the governance isolation invariant introduced in P4 (Project Scoping).
    if (action.project_id !== snapshot.project_id) {
      return { outcome: DecisionOutcome.Deny, triggered_rules: ['project_mismatch'] };
    }

    // I7: taxonomy soundness — defense-in-depth check at evaluation time.
    // The module loader enforces I7 at load time; this is the evaluation-time check.
    const validTypes = new Set<string>(Object.values(CapabilityType));
    if (!validTypes.has(action.type)) {
      return { outcome: DecisionOutcome.Deny, triggered_rules: [] };
    }

    // I1 (capability level): the action's type must appear in enabled_capabilities.
    // Both conditions are required: type in enabled_capabilities AND type declared
    // by an enabled module (checked below).
    const enabledCapSet = new Set<string>(snapshot.enabled_capabilities);
    if (!enabledCapSet.has(action.type)) {
      return { outcome: DecisionOutcome.Deny, triggered_rules: [] };
    }

    // I1 (module level): the action must match a capability descriptor in an
    // enabled module. Both module_id and capability_id must match.
    const found = snapshot.ccm_enabled.some((module) =>
      module.capability_descriptors.some(
        (d) =>
          d.module_id === action.module_id &&
          d.capability_id === action.capability_id,
      ),
    );
    if (!found) {
      return { outcome: DecisionOutcome.Deny, triggered_rules: [] };
    }

    // P5: Resource config pre-checks (kernel logical validation layer).
    // These checks are defense-in-depth: the runtime adapter also enforces
    // these constraints via realpath/DNS resolution for complete protection.
    const resourceCheck = checkResourceConfig(action, snapshot.resource_config);
    if (resourceCheck !== null) {
      return { outcome: DecisionOutcome.Deny, triggered_rules: [resourceCheck] };
    }

    // I2: Dynamic Restriction Rule evaluation.
    // DRRs may only reduce capability, never expand it (restriction monotonicity).
    // Allowlist policy: if allow rules exist for this type, an allow match is required.
    const drrResult = evaluateDRRs(action, snapshot.drr_canonical);
    if (drrResult.outcome === 'deny') {
      return { outcome: DecisionOutcome.Deny, triggered_rules: drrResult.triggeredRules };
    }

    // TODO I5: tier acknowledgment enforcement — formal_governance.md §5 I5
    // When implemented: check action.tier against system tier; deny if typed
    // acknowledgment was not recorded for this tier level.

    // TODO I6: delegation non-escalation — formal_governance.md §5 I6
    // When implemented: for agent.spawn and delegation capability types, verify
    // the requesting agent's effective capability set contains the delegated scope.

    return { outcome: DecisionOutcome.Permit, triggered_rules: drrResult.triggeredRules };
  }
}

// ---------------------------------------------------------------------------
// P5: Resource Config Pre-Check Helpers (pure — no I/O)
// ---------------------------------------------------------------------------

/** Set of filesystem capability types (require FS root validation). */
const FS_CAPABILITY_TYPES = new Set<string>([
  CapabilityType.FsRead,
  CapabilityType.FsList,
  CapabilityType.FsWrite,
  CapabilityType.FsDelete,
]);

/** Set of network capability types (require net allowlist validation). */
const NET_CAPABILITY_TYPES = new Set<string>([
  CapabilityType.NetFetchHttp,
  CapabilityType.NetEgressRaw,
]);

/** Set of exec capability types (require exec CWD validation). */
const EXEC_CAPABILITY_TYPES = new Set<string>([
  CapabilityType.ExecRun,
]);

/** Set of write-or-delete filesystem capability types (require rw root). */
const FS_WRITE_TYPES = new Set<string>([
  CapabilityType.FsWrite,
  CapabilityType.FsDelete,
]);

/**
 * Check resource configuration constraints for the proposed action.
 *
 * Returns a denial rule ID string if the action is denied, or null if
 * the resource config check passes (allowing evaluation to continue).
 *
 * This is the kernel's logical pre-check. The runtime adapter performs
 * an additional realpath-based check for complete path traversal prevention.
 *
 * @param action - The proposed capability instance
 * @param config - The snapshot's resource configuration
 * @returns Denial rule ID, or null if permitted at this layer
 *
 * @internal
 */
function checkResourceConfig(
  action: CapabilityInstance,
  config: ResourceConfig,
): string | null {
  if (FS_CAPABILITY_TYPES.has(action.type)) {
    return checkFsRootConfig(action, config);
  }
  if (NET_CAPABILITY_TYPES.has(action.type)) {
    return checkNetAllowlist(action, config);
  }
  if (EXEC_CAPABILITY_TYPES.has(action.type)) {
    return checkExecCwd(config);
  }
  return null;
}

/**
 * Validate an fs.* action against the configured filesystem roots.
 *
 * Skip check if no roots are configured (backward-compatible: empty roots
 * means no restriction at the resource-config level).
 *
 * Rules:
 *   - Path must be within at least one declared root (logical prefix check)
 *   - fs.write / fs.delete require an rw root
 *
 * @returns Denial rule ID, or null if permitted
 */
function checkFsRootConfig(
  action: CapabilityInstance,
  config: ResourceConfig,
): string | null {
  // If no roots configured, skip the check (backward compat / unconfigured project).
  if (config.fs_roots.length === 0) {
    return null;
  }

  const rawPath = action.params['path'];
  if (typeof rawPath !== 'string') {
    return 'fs_path_missing';
  }

  const normalizedPath = normalize(rawPath);
  const requiresWrite = FS_WRITE_TYPES.has(action.type);

  // Find the matching root(s): path must start with root.path.
  const matchingRoots = config.fs_roots.filter((root) =>
    isLogicallyWithinRoot(normalizedPath, root.path),
  );

  if (matchingRoots.length === 0) {
    return 'fs_path_outside_roots';
  }

  // For write/delete: at least one matching root must be rw.
  if (requiresWrite) {
    const hasRwMatch = matchingRoots.some((root) => root.perm === 'rw');
    if (!hasRwMatch) {
      return 'fs_write_to_readonly_root';
    }
  }

  return null;
}

/**
 * Validate a net.* action against the configured hostname allowlist.
 *
 * Empty allowlist → deny all (spec: "Default: empty array (deny all)").
 *
 * Attempts to extract hostname from:
 *   - action.params.url (for net.fetch.http — full URL)
 *   - action.params.host (for net.egress.raw — hostname or IP)
 *
 * @returns Denial rule ID, or null if permitted
 */
function checkNetAllowlist(
  action: CapabilityInstance,
  config: ResourceConfig,
): string | null {
  if (config.net_allowlist.length === 0) {
    return 'net_no_allowlist';
  }

  // Extract hostname from params.
  let hostname: string | null = null;

  const urlParam = action.params['url'];
  const hostParam = action.params['host'];

  if (typeof urlParam === 'string') {
    try {
      hostname = new URL(urlParam).hostname;
    } catch {
      return 'net_invalid_url';
    }
  } else if (typeof hostParam === 'string') {
    hostname = hostParam;
  } else {
    return 'net_host_missing';
  }

  if (!hostnameMatchesAllowlist(hostname, config.net_allowlist)) {
    return 'net_host_not_allowlisted';
  }

  return null;
}

/**
 * Validate an exec.run action against the configured exec CWD root.
 *
 * If exec_cwd_root_id is null and no 'workspace' root exists, deny.
 * If exec_cwd_root_id is null but 'workspace' root exists, permit
 * (workspace is the default CWD).
 *
 * @returns Denial rule ID, or null if permitted
 */
function checkExecCwd(config: ResourceConfig): string | null {
  // If an explicit CWD root is configured, validate it exists in fs_roots.
  if (config.exec_cwd_root_id !== null) {
    const rootExists = config.fs_roots.some(
      (root) => root.id === config.exec_cwd_root_id,
    );
    if (!rootExists) {
      return 'exec_cwd_root_not_found';
    }
    return null;
  }

  // exec_cwd_root_id is null: check for a 'workspace' fallback root.
  // If a workspace root exists, permit exec (workspace is the default CWD).
  // If no workspace root and no explicit CWD is configured, deny.
  if (config.fs_roots.length === 0) {
    // No roots configured at all: skip CWD enforcement (backward compat).
    return null;
  }

  const workspaceRoot = config.fs_roots.find((root) => root.id === 'workspace');
  if (workspaceRoot === undefined) {
    return 'exec_no_cwd_configured';
  }

  return null;
}

/**
 * Check whether a path is logically within a root directory.
 *
 * Uses string prefix matching after normalization. Does NOT resolve symlinks
 * (that is the adapter's responsibility). This is the kernel's logical check.
 *
 * A path is within a root if:
 *   - The normalized path equals the normalized root path, or
 *   - The normalized path starts with the normalized root path followed by '/'.
 *
 * @param filePath - Normalized absolute file path
 * @param rootPath - Root directory path
 * @returns true if filePath is within rootPath
 *
 * @internal
 */
function isLogicallyWithinRoot(filePath: string, rootPath: string): boolean {
  const normalizedRoot = normalize(rootPath);
  // Ensure root ends with separator for prefix check (avoids '/foobar' matching '/foo').
  const rootWithSep = normalizedRoot.endsWith('/') ? normalizedRoot : normalizedRoot + '/';
  return filePath === normalizedRoot || filePath.startsWith(rootWithSep);
}

/**
 * Check whether a hostname matches a network allowlist entry.
 *
 * Supports:
 *   - Exact match: 'api.example.com' matches 'api.example.com'
 *   - Leading wildcard: '*.example.com' matches 'foo.example.com' and
 *     'bar.baz.example.com' but NOT 'example.com'
 *
 * @param hostname - The hostname to check (e.g. 'api.example.com')
 * @param allowlist - Array of allowed patterns
 * @returns true if the hostname matches any allowlist entry
 *
 * @internal
 */
function hostnameMatchesAllowlist(
  hostname: string,
  allowlist: ReadonlyArray<string>,
): boolean {
  const lower = hostname.toLowerCase();
  for (const entry of allowlist) {
    const pattern = entry.toLowerCase();
    if (pattern.startsWith('*.')) {
      const domain = pattern.slice(2); // 'example.com'
      // Wildcard matches subdomain.example.com but not example.com itself.
      if (lower.endsWith('.' + domain)) {
        return true;
      }
    } else {
      if (lower === pattern) {
        return true;
      }
    }
  }
  return false;
}

// Export internal helpers for use in unit tests.
export { isLogicallyWithinRoot, hostnameMatchesAllowlist };
