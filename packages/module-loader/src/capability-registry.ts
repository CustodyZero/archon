/**
 * Archon Module Loader — Capability Registry
 *
 * Tracks which capability types have been explicitly enabled by the operator.
 * A capability type must be enabled here AND declared by an enabled module
 * before the validation engine will permit actions of that type (Invariant I1).
 *
 * P4 (Project Scoping): The constructor takes a StateIO instance so capability
 * enablement state is scoped to the active project. Each project maintains its
 * own enabled-capabilities.json, preventing cross-project state bleed.
 *
 * @see docs/specs/formal_governance.md §5 (I1: deny-by-default)
 * @see docs/specs/capabilities.md §5 (taxonomy extension rule)
 */

import { CapabilityType } from '@archon/kernel';
import type { StateIO } from '@archon/runtime-host';
import type { ModuleRegistry } from './registry.js';

/**
 * Registry of explicitly enabled capability types.
 *
 * Capability enablement is a two-gate system:
 * 1. The module declaring the capability must be enabled in ModuleRegistry.
 * 2. The capability type must be explicitly enabled here.
 *
 * Both conditions are required before the ValidationEngine permits an action.
 *
 * @see docs/specs/formal_governance.md §5 (I1)
 */
export class CapabilityRegistry {
  private readonly enabled: Set<CapabilityType> = new Set();

  /**
   * @param moduleRegistry - Registry used to verify declaring module is enabled.
   * @param stateIO - Project-scoped I/O for `enabled-capabilities.json` persistence.
   *   Use `FileStateIO(projectDir)` from @archon/runtime-host in production.
   *   Use `MemoryStateIO` in unit tests.
   */
  constructor(
    private readonly moduleRegistry: ModuleRegistry,
    private readonly stateIO: StateIO,
  ) {
    this.loadFromState();
  }

  /**
   * Load enabled capability types from persisted state.
   */
  private loadFromState(): void {
    const persisted = this.stateIO.readJson<ReadonlyArray<string>>(
      'enabled-capabilities.json',
      [],
    );
    const validTypes = new Set<string>(Object.values(CapabilityType));
    for (const raw of persisted) {
      if (validTypes.has(raw)) {
        this.enabled.add(raw as CapabilityType);
      }
    }
  }

  /**
   * Persist the current enabled capability set via StateIO.
   */
  private persistState(): void {
    const sorted = Array.from(this.enabled).sort();
    this.stateIO.writeJson('enabled-capabilities.json', sorted);
  }

  /**
   * Enable a capability type.
   *
   * Requires at least one enabled module that declares this capability type.
   * The caller must provide `{ confirmed: true }` — the CLI prompt enforces this.
   *
   * TODO I5: typed acknowledgment for T3 capability types
   *
   * @param type - The capability type to enable
   * @param opts - Must be { confirmed: true }
   * @throws {Error} If no enabled module declares this capability type
   * @see docs/specs/formal_governance.md §5 (I1)
   */
  enableCapability(type: CapabilityType, opts: { confirmed: true }): void {
    void opts;

    // Verify at least one enabled module declares this capability type.
    const enabledModules = this.moduleRegistry.listEnabled();
    const isDeclared = enabledModules.some((m) =>
      m.capability_descriptors.some((d) => d.type === type),
    );
    if (!isDeclared) {
      throw new Error(
        `Cannot enable capability '${type}': no enabled module declares this capability type. ` +
          `Enable a module that declares '${type}' first.`,
      );
    }

    this.enabled.add(type);
    this.persistState();
  }

  /**
   * Disable a capability type.
   *
   * Removes from the enabled set and persists via StateIO.
   * Snapshot rebuild is the caller's responsibility.
   *
   * @param type - The capability type to disable
   * @param opts - Must be { confirmed: true }
   */
  disableCapability(type: CapabilityType, opts: { confirmed: true }): void {
    void opts;
    this.enabled.delete(type);
    this.persistState();
  }

  /**
   * List all explicitly enabled capability types.
   *
   * @returns Immutable sorted array of enabled capability types
   */
  listEnabledCapabilities(): ReadonlyArray<CapabilityType> {
    return Array.from(this.enabled).sort();
  }

  /**
   * Check whether a capability type is explicitly enabled.
   *
   * @param type - The capability type to check
   * @returns true if enabled, false otherwise
   */
  isEnabled(type: CapabilityType): boolean {
    return this.enabled.has(type);
  }
}
