/**
 * Archon Kernel — Provider Dependency Satisfaction
 *
 * Queryable functions for determining which modules have unmet
 * required or optional provider dependencies. UI layers (CLI, desktop)
 * use these to display dependency status and warn operators about
 * non-functional modules.
 *
 * All functions are pure and deterministic. No I/O.
 *
 * @see docs/specs/module_api.md §3 (capability resolution traversal)
 */

import type { CapabilityType } from '../types/capability.js';
import type { ProviderDependency } from '../types/module.js';
import type { ModuleManifest } from '../types/module.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Status of a single provider dependency for a module.
 */
export interface DependencyStatus {
  /** The declared dependency. */
  readonly dependency: ProviderDependency;
  /** Whether any enabled module provides this capability type. */
  readonly satisfied: boolean;
  /** Module IDs of enabled modules that provide this type (empty if unsatisfied). */
  readonly providedBy: ReadonlyArray<string>;
}

/**
 * Full dependency satisfaction status for a module.
 */
export interface ModuleDependencyStatus {
  /** The module being checked. */
  readonly moduleId: string;
  /** Per-dependency status. */
  readonly dependencies: ReadonlyArray<DependencyStatus>;
  /** True if all required dependencies are satisfied. */
  readonly functional: boolean;
  /** Required dependencies that are not satisfied. */
  readonly missingRequired: ReadonlyArray<DependencyStatus>;
  /** Optional dependencies that are not satisfied. */
  readonly missingOptional: ReadonlyArray<DependencyStatus>;
}

// ---------------------------------------------------------------------------
// Query Functions
// ---------------------------------------------------------------------------

/**
 * Compute the dependency satisfaction status for a single module.
 *
 * Checks each provider_dependency against the set of enabled modules
 * to determine which dependencies are satisfied and which are missing.
 *
 * A module is "functional" if all required dependencies are satisfied.
 * Missing optional dependencies degrade functionality but do not
 * prevent the module from operating.
 *
 * @param moduleId - The module to check
 * @param modules - Map of all registered modules
 * @param enabledModuleIds - Set of currently enabled module_ids
 * @param enabledCapabilityTypes - Set of explicitly enabled capability types
 * @returns ModuleDependencyStatus with per-dependency status
 */
export function getModuleDependencyStatus(
  moduleId: string,
  modules: ReadonlyMap<string, ModuleManifest>,
  enabledModuleIds: ReadonlySet<string>,
  enabledCapabilityTypes: ReadonlySet<CapabilityType>,
): ModuleDependencyStatus {
  const manifest = modules.get(moduleId);
  if (manifest === undefined || manifest.provider_dependencies === undefined || manifest.provider_dependencies.length === 0) {
    return {
      moduleId,
      dependencies: [],
      functional: true,
      missingRequired: [],
      missingOptional: [],
    };
  }

  const dependencies: DependencyStatus[] = [];

  for (const dep of manifest.provider_dependencies) {
    // A dependency is satisfied when:
    // 1. The capability type is enabled in the snapshot
    // 2. At least one enabled module provides (declares) that capability type
    const typeEnabled = enabledCapabilityTypes.has(dep.type);
    const providers: string[] = [];

    if (typeEnabled) {
      for (const [candidateId, candidateManifest] of modules) {
        if (!enabledModuleIds.has(candidateId)) continue;
        if (candidateId === moduleId) continue; // don't count self
        const provides = candidateManifest.capability_descriptors.some(
          (d) => d.type === dep.type,
        );
        if (provides) {
          providers.push(candidateId);
        }
      }
    }

    // Sort providers for determinism (I4).
    providers.sort();

    dependencies.push({
      dependency: dep,
      satisfied: typeEnabled && providers.length > 0,
      providedBy: providers,
    });
  }

  const missingRequired = dependencies.filter((d) => !d.satisfied && d.dependency.required);
  const missingOptional = dependencies.filter((d) => !d.satisfied && !d.dependency.required);

  return {
    moduleId,
    dependencies,
    functional: missingRequired.length === 0,
    missingRequired,
    missingOptional,
  };
}

/**
 * Compute dependency satisfaction status for all enabled modules.
 *
 * Returns a map from module_id to its ModuleDependencyStatus.
 * Only includes modules that have provider_dependencies declared.
 *
 * @param modules - Map of all registered modules
 * @param enabledModuleIds - Set of currently enabled module_ids
 * @param enabledCapabilityTypes - Set of explicitly enabled capability types
 * @returns Map from module_id to ModuleDependencyStatus
 */
export function getAllDependencyStatus(
  modules: ReadonlyMap<string, ModuleManifest>,
  enabledModuleIds: ReadonlySet<string>,
  enabledCapabilityTypes: ReadonlySet<CapabilityType>,
): ReadonlyMap<string, ModuleDependencyStatus> {
  const result = new Map<string, ModuleDependencyStatus>();

  for (const moduleId of [...enabledModuleIds].sort()) {
    const manifest = modules.get(moduleId);
    if (manifest === undefined) continue;
    if (manifest.provider_dependencies === undefined || manifest.provider_dependencies.length === 0) continue;

    result.set(
      moduleId,
      getModuleDependencyStatus(moduleId, modules, enabledModuleIds, enabledCapabilityTypes),
    );
  }

  return result;
}
