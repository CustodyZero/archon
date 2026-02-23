/**
 * Archon Module Loader — Module Registry
 *
 * The ModuleRegistry is the authoritative record of all loaded modules
 * and their enablement status.
 *
 * Registry invariants:
 * - All modules start in Disabled status after registration (Invariant I1)
 * - There is no path from registration to Enabled without explicit operator action
 * - enable() and disable() are stubs — they require Confirm-on-Change flow
 *   which is not yet implemented
 *
 * @see docs/specs/module_api.md §9.2 (enablement)
 * @see docs/specs/formal_governance.md §5 (I1: deny-by-default)
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 */

import type { ModuleManifest } from '@archon/kernel';
import { ModuleStatus, NotImplementedError } from '@archon/kernel';

interface RegistryEntry {
  readonly manifest: ModuleManifest;
  status: ModuleStatus;
}

/**
 * Registry of loaded modules and their enablement status.
 *
 * All modules are registered in Disabled status (Invariant I1).
 * Enablement requires explicit operator action via the confirm-on-change flow.
 *
 * @see docs/specs/formal_governance.md §5 (I1)
 * @see docs/specs/module_api.md §9.2
 */
export class ModuleRegistry {
  private readonly entries: Map<string, RegistryEntry> = new Map();

  /**
   * Register a loaded module manifest.
   *
   * All modules start in Disabled status upon registration (Invariant I1).
   * There is no path from register() to Enabled without explicit operator
   * action — this is the enforcement of deny-by-default capability construction:
   * S = ∅ ⇒ C(S) = ∅.
   *
   * @param manifest - A validated, hash-verified module manifest
   * @throws {Error} If a module with the same module_id is already registered
   * @see docs/specs/formal_governance.md §5 (I1)
   */
  register(manifest: ModuleManifest): void {
    if (this.entries.has(manifest.module_id)) {
      throw new Error(
        `Module already registered: ${manifest.module_id}. ` +
        `Duplicate module_id is not permitted.`,
      );
    }
    // INVARIANT I1: all modules start Disabled. This is not configurable.
    // There is no constructor argument, default, or flag that bypasses this.
    this.entries.set(manifest.module_id, {
      manifest,
      status: ModuleStatus.Disabled,
    });
  }

  /**
   * Retrieve a module manifest by ID.
   *
   * @param moduleId - The module_id to look up
   * @returns ModuleManifest if found, undefined if not registered
   */
  get(moduleId: string): ModuleManifest | undefined {
    return this.entries.get(moduleId)?.manifest;
  }

  /**
   * List all registered module manifests.
   *
   * @returns Immutable array of all registered manifests
   */
  list(): ReadonlyArray<ModuleManifest> {
    return Array.from(this.entries.values()).map((e) => e.manifest);
  }

  /**
   * Get the status of a registered module.
   *
   * @param moduleId - The module_id to look up
   * @returns ModuleStatus if registered, undefined if not registered
   */
  getStatus(moduleId: string): ModuleStatus | undefined {
    return this.entries.get(moduleId)?.status;
  }

  /**
   * List all enabled module manifests.
   * Used by the SnapshotBuilder to construct the CCM_enabled set.
   *
   * @returns Immutable array of enabled module manifests
   */
  listEnabled(): ReadonlyArray<ModuleManifest> {
    return Array.from(this.entries.values())
      .filter((e) => e.status === ModuleStatus.Enabled)
      .map((e) => e.manifest);
  }

  /**
   * Enable a registered module.
   *
   * Stub — throws NotImplementedError. Full implementation requires:
   * - Confirm-on-Change operator flow
   * - Typed acknowledgment if enabling T3 capabilities or elevating tier
   * - Snapshot rebuild after enablement
   * - Hazard combination check for newly enabled capabilities
   *
   * @throws {NotImplementedError} — stub implementation
   * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
   * @see docs/specs/formal_governance.md §5 (I3, I5)
   */
  enable(_moduleId: string): void {
    // TODO: verify module is registered and currently Disabled
    // TODO: implement confirm-on-change operator confirmation flow (I3)
    // TODO: check for T3 capability escalation — require typed acknowledgment (I5)
    // TODO: check hazard combinations with currently enabled modules
    // TODO: set status to Enabled
    // TODO: trigger snapshot rebuild
    throw new NotImplementedError(
      'authority_and_composition_spec.md §11, formal_governance.md §5 I3/I5 (module enablement)',
    );
  }

  /**
   * Disable a registered module.
   *
   * Stub — throws NotImplementedError. Full implementation requires:
   * - Confirm-on-Change operator flow
   * - Snapshot rebuild after disablement
   *
   * @throws {NotImplementedError} — stub implementation
   * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
   */
  disable(_moduleId: string): void {
    // TODO: verify module is registered and currently Enabled
    // TODO: implement confirm-on-change operator confirmation flow
    // TODO: set status to Disabled
    // TODO: trigger snapshot rebuild
    throw new NotImplementedError(
      'authority_and_composition_spec.md §11 (module disablement)',
    );
  }
}
