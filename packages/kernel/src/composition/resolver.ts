/**
 * Archon Kernel — Composition-Aware Capability Resolution
 *
 * Implements the traversal algorithm from module_api.md §3:
 * given a module and the full module set, computes the effective
 * capability set by traversing module_dependencies and provider_dependencies.
 *
 * All functions are pure and deterministic. No I/O.
 *
 * @see docs/specs/module_api.md §3 (capability resolution traversal)
 * @see docs/specs/formal_governance.md §2 (capability construction)
 */

import type { CapabilityDescriptor } from '../types/capability.js';
import type { CapabilityType } from '../types/capability.js';
import type { ModuleManifest } from '../types/module.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The result of composition-aware capability resolution for a single module.
 */
export interface ResolvedCapabilitySet {
  /** Effective capability descriptors reachable from the module through the DAG. */
  readonly effectiveCapabilities: ReadonlyArray<CapabilityDescriptor>;
  /** Module IDs reachable from the root module (including the root itself). */
  readonly reachableModuleIds: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective capability set for a module by traversing
 * its dependency graph.
 *
 * Algorithm (matches module_api.md §3):
 * 1. Start with module M
 * 2. Add M's declared capability descriptors
 * 3. DFS traverse module_dependencies (only enabled modules)
 * 4. For provider_dependencies: find enabled modules that declare
 *    matching capability types, include their descriptors
 * 5. Deduplicate by (module_id, capability_id) identity
 * 6. Filter: only include descriptors whose type is in enabledCapabilityTypes
 * 7. Return effective set + list of reachable module_ids
 *
 * Handles cycles gracefully via a visited set (does not infinite-loop).
 * Output is sorted by (module_id, capability_id) for determinism (I4).
 *
 * @param moduleId - The root module to resolve capabilities for
 * @param modules - Map of all registered modules (module_id → manifest)
 * @param enabledModuleIds - Set of currently enabled module_ids
 * @param enabledCapabilityTypes - Set of explicitly enabled capability types
 * @returns ResolvedCapabilitySet with effective capabilities and reachable modules
 */
export function resolveEffectiveCapabilities(
  moduleId: string,
  modules: ReadonlyMap<string, ModuleManifest>,
  enabledModuleIds: ReadonlySet<string>,
  enabledCapabilityTypes: ReadonlySet<CapabilityType>,
): ResolvedCapabilitySet {
  const visited = new Set<string>();
  const descriptorMap = new Map<string, CapabilityDescriptor>(); // key: "module_id:capability_id"
  const reachable: string[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);

    // Only traverse enabled modules.
    if (!enabledModuleIds.has(id)) return;

    const manifest = modules.get(id);
    if (manifest === undefined) return;

    reachable.push(id);

    // Step 2/3: collect this module's capability descriptors.
    for (const descriptor of manifest.capability_descriptors) {
      const key = `${descriptor.module_id}:${descriptor.capability_id}`;
      if (!descriptorMap.has(key)) {
        descriptorMap.set(key, descriptor);
      }
    }

    // Step 3: traverse module_dependencies (DFS).
    if (manifest.module_dependencies !== undefined) {
      for (const depId of manifest.module_dependencies) {
        visit(depId);
      }
    }

    // Step 4: provider_dependencies — find enabled modules that declare
    // capabilities of the required types.
    if (manifest.provider_dependencies !== undefined) {
      for (const providerDep of manifest.provider_dependencies) {
        const requiredType = providerDep.type;
        for (const [candidateId, candidateManifest] of modules) {
          if (!enabledModuleIds.has(candidateId)) continue;
          if (visited.has(candidateId)) continue;

          const provides = candidateManifest.capability_descriptors.some(
            (d) => d.type === requiredType,
          );
          if (provides) {
            visit(candidateId);
          }
        }
      }
    }
  }

  visit(moduleId);

  // Step 6: filter by enabled capability types.
  const filtered = [...descriptorMap.values()].filter((d) =>
    enabledCapabilityTypes.has(d.type),
  );

  // Sort by (module_id, capability_id) for determinism (I4).
  filtered.sort(
    (a, b) =>
      a.module_id.localeCompare(b.module_id) ||
      a.capability_id.localeCompare(b.capability_id),
  );

  reachable.sort();

  return {
    effectiveCapabilities: filtered,
    reachableModuleIds: reachable,
  };
}

// ---------------------------------------------------------------------------
// Bulk Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve effective capability sets for all enabled modules.
 *
 * Returns a map from module_id to its ResolvedCapabilitySet.
 * Useful for building a full composition picture at snapshot time.
 *
 * @param modules - Map of all registered modules
 * @param enabledModuleIds - Set of currently enabled module_ids
 * @param enabledCapabilityTypes - Set of explicitly enabled capability types
 * @returns Map from module_id to ResolvedCapabilitySet
 */
export function resolveAllEffectiveCapabilities(
  modules: ReadonlyMap<string, ModuleManifest>,
  enabledModuleIds: ReadonlySet<string>,
  enabledCapabilityTypes: ReadonlySet<CapabilityType>,
): ReadonlyMap<string, ResolvedCapabilitySet> {
  const result = new Map<string, ResolvedCapabilitySet>();

  for (const moduleId of [...enabledModuleIds].sort()) {
    result.set(
      moduleId,
      resolveEffectiveCapabilities(moduleId, modules, enabledModuleIds, enabledCapabilityTypes),
    );
  }

  return result;
}
