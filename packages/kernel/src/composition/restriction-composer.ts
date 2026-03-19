/**
 * Archon Kernel — Restriction Composition Through DAG
 *
 * Composes intrinsic restrictions from a module and all its transitive
 * dependencies. Restrictions compose monotonically (I2): adding more
 * restrictions through the dependency chain only tightens what is permitted.
 *
 * This is the governance counterpart to the capability resolver:
 * - The resolver tells you what a module CAN do (capabilities)
 * - The composer tells you what constraints APPLY (restrictions)
 *
 * All functions are pure and deterministic. No I/O.
 *
 * @see docs/specs/formal_governance.md §3 (restriction composition)
 * @see docs/specs/formal_governance.md §5 (I2: restriction monotonicity)
 * @see docs/specs/module_api.md §5 (intrinsic restrictions)
 */

import type { ModuleManifest } from '../types/module.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of composing restrictions through the dependency DAG.
 */
export interface ComposedRestrictions {
  /**
   * All intrinsic restriction DSL strings from the module and its
   * transitive dependencies, in topological order (dependencies first).
   * Deduplicated by exact string identity.
   */
  readonly restrictions: ReadonlyArray<string>;
  /**
   * The module_ids that contributed restrictions, in the order they
   * were collected (topological, dependencies first).
   */
  readonly contributingModules: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Collect all intrinsic restrictions from a module and its transitive
 * dependencies.
 *
 * Traversal is DFS with a visited set (handles cycles gracefully).
 * Restrictions are collected in dependency-first order: if A depends on B,
 * B's restrictions appear before A's. This is semantically correct because
 * dependency restrictions are more fundamental constraints.
 *
 * Restriction composition is monotonic (I2): adding restrictions from
 * dependencies only tightens the effective restriction set. A dependency
 * cannot relax the restrictions of its dependent.
 *
 * @param moduleId - The root module to compose restrictions for
 * @param modules - Map of all registered modules
 * @param enabledModuleIds - Set of currently enabled module_ids
 * @returns ComposedRestrictions with all applicable restriction strings
 */
export function composeRestrictionsForModule(
  moduleId: string,
  modules: ReadonlyMap<string, ModuleManifest>,
  enabledModuleIds: ReadonlySet<string>,
): ComposedRestrictions {
  const visited = new Set<string>();
  const restrictions: string[] = [];
  const seenRestrictions = new Set<string>();
  const contributing: string[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);

    if (!enabledModuleIds.has(id)) return;

    const manifest = modules.get(id);
    if (manifest === undefined) return;

    // Visit dependencies first (dependency-first ordering).
    if (manifest.module_dependencies !== undefined) {
      for (const depId of manifest.module_dependencies) {
        visit(depId);
      }
    }

    // Collect this module's intrinsic restrictions (after deps).
    if (manifest.intrinsic_restrictions.length > 0) {
      let contributed = false;
      for (const restriction of manifest.intrinsic_restrictions) {
        if (!seenRestrictions.has(restriction)) {
          seenRestrictions.add(restriction);
          restrictions.push(restriction);
          contributed = true;
        }
      }
      if (contributed) {
        contributing.push(id);
      }
    }
  }

  visit(moduleId);

  return { restrictions, contributingModules: contributing };
}

/**
 * Compose restrictions for all enabled modules.
 *
 * Returns a map from module_id to its ComposedRestrictions.
 *
 * @param modules - Map of all registered modules
 * @param enabledModuleIds - Set of currently enabled module_ids
 * @returns Map from module_id to ComposedRestrictions
 */
export function composeAllRestrictions(
  modules: ReadonlyMap<string, ModuleManifest>,
  enabledModuleIds: ReadonlySet<string>,
): ReadonlyMap<string, ComposedRestrictions> {
  const result = new Map<string, ComposedRestrictions>();

  for (const moduleId of [...enabledModuleIds].sort()) {
    result.set(
      moduleId,
      composeRestrictionsForModule(moduleId, modules, enabledModuleIds),
    );
  }

  return result;
}
