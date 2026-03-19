/**
 * Archon Module Loader — Composition Graph Validator
 *
 * Validates the composition graph formed by a set of module manifests.
 * Checks referential integrity (all referenced module_ids exist),
 * acyclicity, and provider_dependency satisfaction.
 *
 * This is a set-level validation — it operates on the full module set,
 * not individual manifests. Call it after all modules are registered
 * but before building a snapshot.
 *
 * @see docs/specs/module_api.md §4.1 (graph must be acyclic)
 * @see docs/specs/formal_governance.md §5 (I7: taxonomy soundness)
 */

import type { ModuleManifest } from '@archon/kernel';
import {
  CapabilityType,
  buildCompositionGraph,
  detectCycles,
} from '@archon/kernel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of composition graph validation.
 */
export interface CompositionValidationResult {
  readonly ok: boolean;
  readonly errors: ReadonlyArray<{ readonly message: string }>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate the composition graph formed by a set of modules.
 *
 * Checks:
 * 1. All module_dependencies entries reference module_ids present in the set
 * 2. The graph is acyclic (rejects cyclic dependencies)
 * 3. All provider_dependencies reference CapabilityTypes declared by at least
 *    one module in the set
 *
 * @param modules - The full set of modules to validate
 * @returns CompositionValidationResult — ok if valid, errors if not
 */
export function validateCompositionGraph(
  modules: ReadonlyArray<ModuleManifest>,
): CompositionValidationResult {
  const errors: { message: string }[] = [];
  const moduleIds = new Set(modules.map((m) => m.module_id));

  // Check 1: referential integrity of module_dependencies.
  for (const m of modules) {
    if (m.module_dependencies === undefined) continue;
    for (const depId of m.module_dependencies) {
      if (!moduleIds.has(depId)) {
        errors.push({
          message: `Module "${m.module_id}" declares module_dependency "${depId}" which is not in the module set`,
        });
      }
    }
  }

  // Check 2: acyclicity.
  const graph = buildCompositionGraph(modules);
  const cycleResult = detectCycles(graph);
  if (cycleResult.hasCycle) {
    const path = cycleResult.cyclePath?.join(' → ') ?? 'unknown';
    errors.push({
      message: `Composition graph contains a cycle: ${path}`,
    });
  }

  // Check 3: provider_dependencies satisfaction.
  // Build a set of all CapabilityTypes declared by any module in the set.
  const declaredTypes = new Set<CapabilityType>();
  for (const m of modules) {
    for (const desc of m.capability_descriptors) {
      declaredTypes.add(desc.type);
    }
  }

  for (const m of modules) {
    if (m.provider_dependencies === undefined) continue;
    for (const provDep of m.provider_dependencies) {
      if (!declaredTypes.has(provDep.type)) {
        errors.push({
          message: `Module "${m.module_id}" declares provider_dependency "${provDep.type}" but no module in the set provides it`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
