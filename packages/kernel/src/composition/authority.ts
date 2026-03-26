/**
 * Archon Kernel — Authority Bounding Through Composition
 *
 * Validates that composition chains do not create authority escalation.
 *
 * The authority invariant:
 *   For any composition path A → B:
 *   The capability types that B declares must be within A's effective
 *   capability type set (direct declarations + transitive dependencies).
 *
 * This prevents a module from gaining access to capability types it
 * didn't declare (directly or through its dependency chain).
 *
 * I6 Extension: delegation non-escalation through transitive composition.
 * If module A can spawn agents, the spawned agent cannot access capabilities
 * beyond A's composition-resolved effective capability set.
 *
 * v0.1 status: I6 is enforced at the system level — delegated capabilities
 * are checked against the global C_eff(S). All agents share the same
 * effective capability set. checkDelegationNonEscalation() in engine.ts
 * takes enabledCapSet as a parameter, so per-agent scoping is a caller
 * concern, not a function change.
 *
 * v0.2 design notes (per-agent C_eff):
 *   1. Introduce AgentCapabilityProfile: { agent_id, allowed_types: Set<CapabilityType> }
 *   2. Store profiles in the RuleSnapshot (hashed, deterministic)
 *   3. At gate time, resolve the acting agent's profile and pass its
 *      allowed_types as enabledCapSet to checkDelegationNonEscalation()
 *   4. collectEffectiveTypes() in this file provides the composition-aware
 *      type resolution — reuse it for per-agent authority bounding
 *   5. Delegation graph G edges must also be stored in the snapshot
 *   6. Key constraint: per-agent C_eff(S, a_j) ⊆ C_eff(S) always —
 *      agent profiles can only restrict, never expand, system capabilities
 *
 * All functions are pure and deterministic. No I/O.
 *
 * @see docs/specs/formal_governance.md §5 (I6: delegation non-escalation)
 * @see docs/specs/module_api.md §4.1 (composition authority invariant)
 */

import type { CapabilityType } from '../types/capability.js';
import type { ModuleManifest } from '../types/module.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single authority violation found during validation.
 */
export interface AuthorityViolation {
  /** The module whose dependency introduces the violation. */
  readonly moduleId: string;
  /** The dependency module that declares unauthorized capability types. */
  readonly dependencyId: string;
  /** Capability types declared by the dependency that are not in the module's effective set. */
  readonly unauthorizedTypes: ReadonlyArray<CapabilityType>;
}

/**
 * Result of authority bounding validation.
 */
export interface AuthorityValidationResult {
  readonly ok: boolean;
  readonly violations: ReadonlyArray<AuthorityViolation>;
}

// ---------------------------------------------------------------------------
// Authority Bounding
// ---------------------------------------------------------------------------

/**
 * Compute the effective capability types reachable from a module through
 * its composition DAG (types only, not full descriptors).
 *
 * @internal
 */
function collectEffectiveTypes(
  moduleId: string,
  modules: ReadonlyMap<string, ModuleManifest>,
  enabledModuleIds: ReadonlySet<string>,
  visited: Set<string> = new Set(),
): Set<CapabilityType> {
  const types = new Set<CapabilityType>();

  if (visited.has(moduleId)) return types;
  visited.add(moduleId);

  if (!enabledModuleIds.has(moduleId)) return types;

  const manifest = modules.get(moduleId);
  if (manifest === undefined) return types;

  // Add this module's declared capability types.
  for (const desc of manifest.capability_descriptors) {
    types.add(desc.type);
  }

  // Traverse module_dependencies.
  if (manifest.module_dependencies !== undefined) {
    for (const depId of manifest.module_dependencies) {
      for (const t of collectEffectiveTypes(depId, modules, enabledModuleIds, visited)) {
        types.add(t);
      }
    }
  }

  return types;
}

/**
 * Validate that no module gains unauthorized capability types through
 * its composition chain.
 *
 * For each module with module_dependencies, verifies that every capability
 * type declared by each direct dependency is within the module's effective
 * capability type set (its own types + transitive dependency types).
 *
 * This is a set-level validation: call it after all modules are registered
 * and enabled, before building a snapshot.
 *
 * @param modules - Map of all registered modules
 * @param enabledModuleIds - Set of currently enabled module_ids
 * @returns AuthorityValidationResult with any violations found
 */
export function validateAuthorityBounds(
  modules: ReadonlyMap<string, ModuleManifest>,
  enabledModuleIds: ReadonlySet<string>,
): AuthorityValidationResult {
  const violations: AuthorityViolation[] = [];

  for (const moduleId of [...enabledModuleIds].sort()) {
    const manifest = modules.get(moduleId);
    if (manifest === undefined) continue;
    if (manifest.module_dependencies === undefined || manifest.module_dependencies.length === 0) {
      continue;
    }

    // Compute this module's effective capability types through full DAG.
    const effectiveTypes = collectEffectiveTypes(moduleId, modules, enabledModuleIds);

    // Check each direct dependency: all its declared types must be in our effective set.
    for (const depId of manifest.module_dependencies) {
      if (!enabledModuleIds.has(depId)) continue;

      const depManifest = modules.get(depId);
      if (depManifest === undefined) continue;

      const unauthorized: CapabilityType[] = [];
      for (const desc of depManifest.capability_descriptors) {
        if (!effectiveTypes.has(desc.type)) {
          unauthorized.push(desc.type);
        }
      }

      if (unauthorized.length > 0) {
        violations.push({
          moduleId,
          dependencyId: depId,
          unauthorizedTypes: [...new Set(unauthorized)].sort(),
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Check whether a specific module's action is within its composition-resolved
 * authority. Used by the ValidationEngine for per-action authority checks.
 *
 * @param moduleId - The module proposing the action
 * @param capabilityType - The capability type being requested
 * @param modules - Map of all registered modules
 * @param enabledModuleIds - Set of currently enabled module_ids
 * @returns true if the capability type is within the module's effective authority
 */
export function isWithinAuthority(
  moduleId: string,
  capabilityType: CapabilityType,
  modules: ReadonlyMap<string, ModuleManifest>,
  enabledModuleIds: ReadonlySet<string>,
): boolean {
  const effectiveTypes = collectEffectiveTypes(moduleId, modules, enabledModuleIds);
  return effectiveTypes.has(capabilityType);
}
