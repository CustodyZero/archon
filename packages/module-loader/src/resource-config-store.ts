/**
 * Archon Module Loader — Resource Configuration Store
 *
 * The ResourceConfigStore manages per-project resource configuration:
 *   - Filesystem roots (FsRoot array)
 *   - Network hostname allowlist
 *   - Exec working directory root ID
 *   - Secrets epoch counter (increments on secret mutation)
 *
 * State is persisted to `<projectDir>/state/resource-config.json` via
 * the injected StateIO instance, keeping it project-scoped.
 *
 * ResourceConfig is included in the RuleSnapshot so RS_hash changes
 * whenever any resource configuration changes (Invariant I4, P5).
 *
 * Proposal integration:
 *   Resource changes are applied via ProposalQueue. The ResourceConfigStore
 *   is the apply target for set_project_fs_roots, set_project_net_allowlist,
 *   set_project_exec_root, and secrets epoch management.
 *
 * P4 invariant: Each ResourceConfigStore instance is bound to exactly one
 * project via its StateIO. Multiple instances are fully isolated.
 *
 * @see docs/specs/architecture.md §P5 (resource scoping)
 * @see docs/specs/formal_governance.md §5 (I1, I4)
 */

import type { StateIO } from '@archon/runtime-host';
import type { FsRoot, ResourceConfig } from '@archon/kernel';
import { EMPTY_RESOURCE_CONFIG } from '@archon/kernel';

/** Filename for resource config state within the project state directory. */
const RESOURCE_CONFIG_FILE = 'resource-config.json';

// ---------------------------------------------------------------------------
// ResourceConfigStore
// ---------------------------------------------------------------------------

/**
 * Project-scoped resource configuration store.
 *
 * Reads and writes resource configuration for a single project.
 * The StateIO instance provided at construction determines which
 * project's state is accessed (P4 isolation boundary).
 *
 * All reads are fresh from StateIO (no in-memory cache) to match
 * the existing AckStore pattern and ensure cross-process consistency.
 */
export class ResourceConfigStore {
  constructor(private readonly stateIO: StateIO) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Return the current resource configuration for this project.
   *
   * Returns EMPTY_RESOURCE_CONFIG if no config has been persisted yet
   * (backward compat: pre-P5 projects have no resource config file).
   */
  getResourceConfig(): ResourceConfig {
    return this.stateIO.readJson<ResourceConfig>(
      RESOURCE_CONFIG_FILE,
      EMPTY_RESOURCE_CONFIG,
    );
  }

  // -------------------------------------------------------------------------
  // FS Roots
  // -------------------------------------------------------------------------

  /**
   * Replace the complete set of filesystem roots.
   *
   * The provided `roots` array replaces the current fs_roots entirely.
   * To add or remove a root, call with the full desired array.
   * Persists the change immediately.
   *
   * @param roots - New complete set of filesystem roots
   */
  setFsRoots(roots: ReadonlyArray<FsRoot>): void {
    const current = this.getResourceConfig();
    this.stateIO.writeJson<ResourceConfig>(RESOURCE_CONFIG_FILE, {
      ...current,
      fs_roots: [...roots],
    });
  }

  // -------------------------------------------------------------------------
  // Network Allowlist
  // -------------------------------------------------------------------------

  /**
   * Replace the network hostname allowlist.
   *
   * Empty array = deny all net.* operations (spec default).
   * Persists the change immediately.
   *
   * @param allowlist - New complete hostname allowlist
   */
  setNetAllowlist(allowlist: ReadonlyArray<string>): void {
    const current = this.getResourceConfig();
    this.stateIO.writeJson<ResourceConfig>(RESOURCE_CONFIG_FILE, {
      ...current,
      net_allowlist: [...allowlist],
    });
  }

  // -------------------------------------------------------------------------
  // Exec CWD Root
  // -------------------------------------------------------------------------

  /**
   * Set the exec working directory root ID.
   *
   * @param rootId - ID of the FsRoot to use as exec cwd, or null to use
   *   the 'workspace' default (or deny if no workspace root exists).
   */
  setExecCwdRootId(rootId: string | null): void {
    const current = this.getResourceConfig();
    this.stateIO.writeJson<ResourceConfig>(RESOURCE_CONFIG_FILE, {
      ...current,
      exec_cwd_root_id: rootId,
    });
  }

  // -------------------------------------------------------------------------
  // Secrets Epoch
  // -------------------------------------------------------------------------

  /**
   * Increment the secrets epoch counter by 1.
   *
   * Called by ProposalQueue after applying a set_secret or delete_secret
   * proposal. The epoch increment ensures RS_hash changes after each
   * secret mutation without exposing secret values in the snapshot.
   */
  incrementSecretsEpoch(): void {
    const current = this.getResourceConfig();
    this.stateIO.writeJson<ResourceConfig>(RESOURCE_CONFIG_FILE, {
      ...current,
      secrets_epoch: current.secrets_epoch + 1,
    });
  }
}
