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
 * PATH SCOPE ENFORCEMENT:
 * Full path-scope enforcement (restricting operations to declared path_glob
 * params from the capability descriptor) requires DRR evaluation and context
 * validation, which are not yet implemented. Until that is in place, this
 * adapter applies one unconditional safety guard: null bytes in paths are
 * rejected immediately, as they can bypass OS-level path checks.
 *
 * The capability's params_schema (path_glob, max_bytes) provides the intended
 * scope contract. Enforcement of that scope is a kernel-level concern that
 * will be wired when context validation is implemented.
 *
 * DEV: context not yet enforced against snapshot.
 *
 * @see docs/specs/module_api.md §6 (kernel-provided adapters)
 */

import { readFile, readdir, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import type { FilesystemAdapter, AdapterCallContext } from '@archon/kernel';

/**
 * Reject paths containing null bytes.
 *
 * Null bytes can bypass OS-level path checks on some platforms and are never
 * valid in filesystem paths. This is the one unconditional safety guard applied
 * before any I/O operation.
 */
function assertSafePath(path: string): void {
  if (path.includes('\0')) {
    throw new Error(`Invalid path: null byte detected in path: ${JSON.stringify(path)}`);
  }
}

/**
 * Node.js filesystem adapter.
 *
 * All module file I/O must flow through this adapter — modules must not
 * use node:fs directly. This adapter is the enforcement point for the
 * FilesystemAdapter contract.
 *
 * DEV: glob matching for list() is not yet implemented. The pathGlob
 * parameter is treated as a literal directory path for P0.
 *
 * @see docs/specs/module_api.md §6
 */
export class FsAdapter implements FilesystemAdapter {
  /**
   * Read a file and return its contents as Uint8Array.
   *
   * DEV: context not yet enforced against snapshot.
   */
  async read(path: string, _context: AdapterCallContext): Promise<Uint8Array> {
    assertSafePath(path);
    const resolved = resolve(path);
    const buffer = await readFile(resolved);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  /**
   * List files in a directory.
   *
   * DEV: pathGlob is treated as a literal directory path for P0.
   * Glob pattern matching is not yet implemented.
   * DEV: context not yet enforced against snapshot.
   */
  async list(pathGlob: string, _context: AdapterCallContext): Promise<ReadonlyArray<string>> {
    assertSafePath(pathGlob);
    const resolved = resolve(pathGlob);
    const entries = await readdir(resolved, { withFileTypes: true });
    return entries.map((e) => join(resolved, e.name));
  }

  /**
   * Write content to a file, creating parent directories as needed.
   *
   * DEV: context not yet enforced against snapshot.
   */
  async write(path: string, content: Uint8Array, _context: AdapterCallContext): Promise<void> {
    assertSafePath(path);
    const resolved = resolve(path);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content);
  }

  /**
   * Delete a file.
   *
   * DEV: context not yet enforced against snapshot.
   */
  async delete(path: string, _context: AdapterCallContext): Promise<void> {
    assertSafePath(path);
    const resolved = resolve(path);
    await unlink(resolved);
  }
}
