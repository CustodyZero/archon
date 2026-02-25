/**
 * Archon Kernel — Resource Configuration Types
 *
 * Per-project resource configuration: filesystem roots, network allowlist,
 * exec working directory constraint, and secrets epoch counter.
 *
 * These types are pure data shapes — no I/O, no enforcement logic.
 * ResourceConfig is included in the RuleSnapshot so RS_hash changes
 * whenever resource configuration changes (Invariant I4).
 *
 * Enforcement is two-layered:
 *   - Kernel ValidationEngine: logical prefix/allowlist check (pure, no I/O)
 *   - Runtime adapters: realpath / DNS resolution enforcement (I/O)
 *
 * @see docs/specs/architecture.md §P5 (resource scoping)
 * @see docs/specs/formal_governance.md §5 (I1, I4)
 */

// ---------------------------------------------------------------------------
// Filesystem Roots
// ---------------------------------------------------------------------------

/**
 * Permission mode for a filesystem root.
 *
 * - 'ro': read-only  — fs.read and fs.list are permitted; fs.write and fs.delete are denied.
 * - 'rw': read-write — all fs.* operations are permitted.
 */
export type FsRootPerm = 'ro' | 'rw';

/**
 * A declared filesystem root for a project.
 *
 * All filesystem operations by agents in this project must target a path
 * that resolves within at least one declared root. Operations targeting
 * paths outside all roots are denied.
 *
 * Path traversal is blocked at two layers:
 *   1. Kernel: logical prefix check using path.normalize() (pure, no I/O)
 *   2. Runtime: realpath check (resolves symlinks, catches bypass attempts)
 *
 * The 'workspace' root is always created at project-creation time:
 *   { id: 'workspace', path: '<archonHome>/projects/<id>/workspace', perm: 'rw' }
 *
 * Snapshot binding: fs_roots sorted by id is included in RS material.
 * RS_hash changes when roots are added, removed, or modified (path or perm).
 * Root ordering does not affect RS_hash (sorted by id before hashing).
 */
export interface FsRoot {
  /**
   * Stable operator-assigned identifier for this root.
   * Examples: 'workspace', 'docs-ro', 'output-rw'.
   * Must be unique within a project.
   */
  readonly id: string;
  /**
   * Absolute path to the root directory. Must be normalized and absolute.
   * Relative paths are rejected at proposal validation time.
   */
  readonly path: string;
  /** Permission mode for operations within this root. */
  readonly perm: FsRootPerm;
}

// ---------------------------------------------------------------------------
// Resource Configuration
// ---------------------------------------------------------------------------

/**
 * Per-project resource configuration included in the RuleSnapshot.
 *
 * All arrays are canonicalized (sorted) by the SnapshotBuilder before hashing
 * to ensure RS_hash is independent of insertion order (Invariant I4).
 */
export interface ResourceConfig {
  /**
   * Declared filesystem roots for this project.
   *
   * If empty, no FS root restriction is applied (backward-compatible default).
   * When non-empty, all fs.* operations must target a path within at least
   * one declared root with compatible permission.
   *
   * Sorted by id before hashing.
   */
  readonly fs_roots: ReadonlyArray<FsRoot>;
  /**
   * Network hostname allowlist for this project.
   *
   * Governs net.fetch.http and net.egress.raw operations.
   * Supports exact hostnames and leading wildcard patterns: '*.example.com'.
   * Empty array = deny all network operations (spec-defined default).
   *
   * Raw IP addresses are denied unless explicitly listed.
   * Sorted before hashing.
   */
  readonly net_allowlist: ReadonlyArray<string>;
  /**
   * ID of the FsRoot whose path is used as the exec working directory.
   *
   * If null, the default is the 'workspace' root path if it exists, or
   * exec operations are denied if no workspace root is declared.
   * Callers cannot override cwd — the adapter enforces the declared root.
   */
  readonly exec_cwd_root_id: string | null;
  /**
   * Monotonically increasing count of secret mutations (set/delete).
   *
   * Incorporated into RS_hash so the hash changes after each secret mutation,
   * without exposing secret keys or values in the snapshot (Invariant I4).
   * Defaults to 0 when no secrets have been mutated.
   */
  readonly secrets_epoch: number;
}

// ---------------------------------------------------------------------------
// Empty resource config (backward-compatible default)
// ---------------------------------------------------------------------------

/**
 * The default empty resource configuration.
 *
 * Used when no resource configuration has been set for a project.
 *
 * Backward-compat semantics:
 *   - Empty fs_roots: FS root validation is skipped (any path is allowed at the kernel level)
 *   - Empty net_allowlist: all net.* operations are denied
 *   - exec_cwd_root_id: null — exec uses 'workspace' root if declared, else denied
 *   - secrets_epoch: 0 — no secrets mutated
 */
export const EMPTY_RESOURCE_CONFIG: ResourceConfig = {
  fs_roots: [],
  net_allowlist: [],
  exec_cwd_root_id: null,
  secrets_epoch: 0,
} as const;
