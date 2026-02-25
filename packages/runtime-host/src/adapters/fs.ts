/**
 * Archon Runtime Host — Filesystem Adapter Implementation
 *
 * Implements the FilesystemAdapter interface from @archon/kernel.
 * Uses node:fs/promises for all I/O.
 *
 * This implementation lives in runtime-host, not kernel. The kernel defines
 * the FilesystemAdapter interface (packages/kernel/src/adapters/index.ts);
 * the runtime host owns the concrete implementation. Kernel code never
 * imports node:fs directly.
 *
 * PATH SCOPE ENFORCEMENT (P5):
 * The adapter enforces two layers of path boundary checks before any I/O:
 *
 *   Layer 1 (kernel, logical): ValidationEngine.evaluate() checks the
 *     path param against declared fs_roots using string prefix matching
 *     (normalize) before the gate permits the action. This happens before
 *     the adapter is called.
 *
 *   Layer 2 (adapter, physical): This adapter resolves the path with
 *     realpath() (or realpathSync for sync operations) to eliminate
 *     symlinks, then re-checks the resolved path against all declared
 *     root paths in context.resource_config.fs_roots. This prevents
 *     symlink-based escape attacks that would fool the logical check.
 *
 * If fs_roots is empty (EMPTY_RESOURCE_CONFIG), no root boundary check
 * is applied. This preserves backward compatibility with pre-P5 projects
 * and with the kernel's own test suite (which uses /tmp paths with no roots).
 *
 * Write operations additionally check that the matched root is not read-only
 * (perm !== 'ro').
 *
 * @see docs/specs/architecture.md §P5 (resource scoping — adapter layer)
 * @see docs/specs/formal_governance.md §5 (I1: deny-by-default)
 */

import { readFile, readdir, writeFile, unlink, mkdir, realpath } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import type { FsRoot, FilesystemAdapter, AdapterCallContext } from '@archon/kernel';

// ---------------------------------------------------------------------------
// Path safety helpers
// ---------------------------------------------------------------------------

/**
 * Reject paths containing null bytes.
 *
 * Null bytes can bypass OS-level path checks on some platforms and are never
 * valid in filesystem paths. This is an unconditional guard applied before
 * any other check.
 */
function assertSafePath(path: string): void {
  if (path.includes('\0')) {
    throw new Error(`Invalid path: null byte detected in path: ${JSON.stringify(path)}`);
  }
}

/**
 * Check that `resolvedPath` is physically within one of the declared roots
 * after symlink resolution.
 *
 * This is the adapter-layer (Layer 2) root boundary check. It complements the
 * kernel-layer (Layer 1) logical prefix check by resolving symlinks first.
 *
 * If `fsRoots` is empty, the check is skipped (backward compat).
 *
 * For write operations (`isWrite=true`), also verifies that the matched root
 * has `perm === 'rw'`.
 *
 * @throws {Error} If the path is outside all declared roots
 * @throws {Error} If the matched root is read-only and a write is attempted
 */
function assertWithinFsRoots(
  resolvedPath: string,
  fsRoots: ReadonlyArray<FsRoot>,
  isWrite: boolean,
): void {
  // Backward compat: no roots declared → skip check.
  if (fsRoots.length === 0) return;

  const matchedRoot = fsRoots.find((root) => {
    const normalizedRoot = root.path.endsWith('/') ? root.path : root.path + '/';
    const normalizedFile = resolvedPath.endsWith('/') ? resolvedPath : resolvedPath + '/';
    return normalizedFile.startsWith(normalizedRoot) || resolvedPath === root.path;
  });

  if (matchedRoot === undefined) {
    throw new Error(
      `Access denied: path is outside all declared filesystem roots. ` +
        `Resolved path: ${resolvedPath}. ` +
        `Declared roots: [${fsRoots.map((r) => `${r.id}:${r.path}`).join(', ')}]. ` +
        `Add a filesystem root via 'archon resource fs-roots set' to grant access.`,
    );
  }

  if (isWrite && matchedRoot.perm === 'ro') {
    throw new Error(
      `Access denied: filesystem root '${matchedRoot.id}' (${matchedRoot.path}) is read-only. ` +
        `Write, create, and delete operations require a root with perm='rw'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// FsAdapter
// ---------------------------------------------------------------------------

/**
 * Node.js filesystem adapter with P5 root boundary enforcement.
 *
 * All module file I/O must flow through this adapter — modules must not
 * use node:fs directly. This adapter enforces the FilesystemAdapter contract
 * including P5 root boundary checks.
 *
 * DEV: glob matching for list() is not yet implemented. The pathGlob
 * parameter is treated as a literal directory path.
 *
 * @see docs/specs/module_api.md §6
 */
export class FsAdapter implements FilesystemAdapter {
  /**
   * Read a file and return its contents as Uint8Array.
   *
   * Resolves symlinks before checking root boundaries (P5 Layer 2 enforcement).
   */
  async read(path: string, context: AdapterCallContext): Promise<Uint8Array> {
    assertSafePath(path);
    const resolved = await resolveReal(path);
    assertWithinFsRoots(resolved, context.resource_config.fs_roots, false);
    const buffer = await readFile(resolved);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  /**
   * List files in a directory.
   *
   * DEV: pathGlob is treated as a literal directory path.
   * Glob pattern matching is not yet implemented.
   *
   * Resolves symlinks before checking root boundaries (P5 Layer 2 enforcement).
   */
  async list(pathGlob: string, context: AdapterCallContext): Promise<ReadonlyArray<string>> {
    assertSafePath(pathGlob);
    const resolved = await resolveReal(pathGlob);
    assertWithinFsRoots(resolved, context.resource_config.fs_roots, false);
    const entries = await readdir(resolved, { withFileTypes: true });
    return entries.map((e) => join(resolved, e.name));
  }

  /**
   * Write content to a file, creating parent directories as needed.
   *
   * Resolves the target path's nearest existing ancestor with realpath,
   * then applies root boundary enforcement (P5 Layer 2 enforcement).
   * Write access requires the matched root to have perm='rw'.
   */
  async write(path: string, content: Uint8Array, context: AdapterCallContext): Promise<void> {
    assertSafePath(path);
    // For write, the target file may not exist yet. Resolve the parent dir
    // to handle symlinks at the directory level, then reconstruct the full path.
    const resolvedDir = await resolveReal(dirname(resolve(path)));
    const filename = resolve(path).substring(dirname(resolve(path)).length);
    const resolvedPath = resolvedDir + filename;
    assertWithinFsRoots(resolvedPath, context.resource_config.fs_roots, true);
    await mkdir(resolvedDir, { recursive: true });
    await writeFile(resolvedPath, content);
  }

  /**
   * Delete a file.
   *
   * Resolves symlinks before checking root boundaries (P5 Layer 2 enforcement).
   * Delete requires the matched root to have perm='rw'.
   */
  async delete(path: string, context: AdapterCallContext): Promise<void> {
    assertSafePath(path);
    const resolved = await resolveReal(path);
    assertWithinFsRoots(resolved, context.resource_config.fs_roots, true);
    await unlink(resolved);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a path to its real (symlink-free) form.
 *
 * Falls back to `resolve()` (logical normalization) if realpath() fails
 * with ENOENT (file does not exist yet — normal for pre-write checks).
 * Other errors are rethrown.
 */
async function resolveReal(path: string): Promise<string> {
  try {
    return await realpath(resolve(path));
  } catch (err: unknown) {
    if (isNodeError(err, 'ENOENT')) {
      // File doesn't exist yet (e.g. write target). Use logical resolution.
      return resolve(path);
    }
    throw err;
  }
}

function isNodeError(err: unknown, code: string): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === code
  );
}
