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
import { ModuleStatus } from '@archon/kernel';
import { readJsonState, writeJsonState } from '@archon/runtime-host';

interface RegistryEntry {
  readonly manifest: ModuleManifest;
  status: ModuleStatus;
}

/**
 * Registry of loaded modules and their enablement status.
 *
 * All modules are registered in Disabled status (Invariant I1).
 * Enablement requires explicit operator action:
 * - Caller must pass `{ confirmed: true }` — the CLI prompt enforces this.
 * - State is persisted to `.archon/state/enabled-modules.json`.
 * - Initial enabled set is loaded from disk in constructor.
 *
 * @see docs/specs/formal_governance.md §5 (I1)
 * @see docs/specs/module_api.md §9.2
 */
export class ModuleRegistry {
  private readonly entries: Map<string, RegistryEntry> = new Map();

  /**
   * Load enabled module IDs from persisted state and apply to registry entries.
   * Called after all manifests are registered via register().
   *
   * Module IDs are persisted; manifests are always loaded from the first-party
   * catalog at startup (the loader does not persist manifest content).
   */
  private loadFromState(): void {
    const enabledIds = readJsonState<ReadonlyArray<string>>('enabled-modules.json', []);
    for (const id of enabledIds) {
      const entry = this.entries.get(id);
      if (entry !== undefined) {
        entry.status = ModuleStatus.Enabled;
      }
    }
  }

  /**
   * Persist the current set of enabled module IDs to state.
   */
  private persistEnabledState(): void {
    const enabledIds = Array.from(this.entries.values())
      .filter((e) => e.status === ModuleStatus.Enabled)
      .map((e) => e.manifest.module_id)
      .sort();
    writeJsonState('enabled-modules.json', enabledIds);
  }

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
   * The caller must provide `{ confirmed: true }` — the CLI prompt is
   * responsible for obtaining this confirmation from the operator before calling.
   * Persists the updated enabled set to `.archon/state/enabled-modules.json`.
   *
   * TODO I3: hazard combination check with currently enabled modules
   * TODO I5: typed acknowledgment check if enabling T3 capabilities
   * Snapshot rebuild is the caller's responsibility after enable().
   *
   * @param moduleId - The module_id to enable
   * @param opts - Must be { confirmed: true }; caller is responsible for prompt
   * @throws {Error} If module is not registered
   * @see docs/specs/formal_governance.md §5 (I3, I5)
   */
  enable(moduleId: string, opts: { confirmed: true }): void {
    void opts; // confirmed: true is a type-level contract; caller enforces the prompt
    const entry = this.entries.get(moduleId);
    if (entry === undefined) {
      throw new Error(`Module not registered: ${moduleId}`);
    }
    entry.status = ModuleStatus.Enabled;
    this.persistEnabledState();
  }

  /**
   * Disable a registered module.
   *
   * The caller must provide `{ confirmed: true }`.
   * Persists the updated enabled set to `.archon/state/enabled-modules.json`.
   * Snapshot rebuild is the caller's responsibility after disable().
   *
   * @param moduleId - The module_id to disable
   * @param opts - Must be { confirmed: true }; caller is responsible for prompt
   * @throws {Error} If module is not registered
   * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
   */
  disable(moduleId: string, opts: { confirmed: true }): void {
    void opts;
    const entry = this.entries.get(moduleId);
    if (entry === undefined) {
      throw new Error(`Module not registered: ${moduleId}`);
    }
    entry.status = ModuleStatus.Disabled;
    this.persistEnabledState();
  }

  /**
   * Apply persisted state to the registry. Call this after all manifests
   * have been registered to restore previous operator configuration.
   *
   * @see loadFromState
   */
  applyPersistedState(): void {
    this.loadFromState();
  }
}
