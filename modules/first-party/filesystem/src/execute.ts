/**
 * Archon First-Party Filesystem Module — Execute Handlers
 *
 * Handler implementations for filesystem capability instances.
 * All I/O flows through the kernel's FilesystemAdapter — this module
 * does not use node:fs directly.
 *
 * The AdapterCallContext is provided by the gate (real agentId, capability
 * instance, and activeSnapshotHash). Handlers must not construct their own
 * contexts — the gate is the sole authority for context construction.
 *
 * @see docs/specs/module_api.md §4 (tool implementations)
 * @see docs/specs/module_api.md §6 (kernel-provided adapters)
 */

import type { CapabilityInstance, KernelAdapters, AdapterCallContext } from '@archon/kernel';

/**
 * Execute an fs.read capability instance.
 *
 * Reads the file at `params.path` via the kernel filesystem adapter.
 * Returns the file content as a UTF-8 string.
 *
 * @param instance - The resolved fs.read capability instance
 * @param adapters - Kernel-provided adapters
 * @param context - Gate-constructed adapter call context (real rs_hash, agentId)
 * @returns { content: string }
 */
export async function executeFsRead(
  instance: CapabilityInstance,
  adapters: KernelAdapters,
  context: AdapterCallContext,
): Promise<{ content: string }> {
  const path = String(instance.params['path'] ?? '');
  const bytes = await adapters.filesystem.read(path, context);
  const decoder = new TextDecoder('utf-8');
  return { content: decoder.decode(bytes) };
}

/**
 * Execute an fs.list capability instance.
 *
 * Lists files at `params.path` via the kernel filesystem adapter.
 * Returns an array of file paths.
 *
 * @param instance - The resolved fs.list capability instance
 * @param adapters - Kernel-provided adapters
 * @param context - Gate-constructed adapter call context
 * @returns { paths: ReadonlyArray<string> }
 */
export async function executeFsList(
  instance: CapabilityInstance,
  adapters: KernelAdapters,
  context: AdapterCallContext,
): Promise<{ paths: ReadonlyArray<string> }> {
  const pathGlob = String(instance.params['path'] ?? '');
  const paths = await adapters.filesystem.list(pathGlob, context);
  return { paths };
}

/**
 * Execute an fs.write capability instance.
 *
 * Writes `params.content` to `params.path` via the kernel filesystem adapter.
 *
 * @param instance - The resolved fs.write capability instance
 * @param adapters - Kernel-provided adapters
 * @param context - Gate-constructed adapter call context
 */
export async function executeFsWrite(
  instance: CapabilityInstance,
  adapters: KernelAdapters,
  context: AdapterCallContext,
): Promise<void> {
  const path = String(instance.params['path'] ?? '');
  const content = String(instance.params['content'] ?? '');
  const encoder = new TextEncoder();
  await adapters.filesystem.write(path, encoder.encode(content), context);
}

/**
 * Execute an fs.delete capability instance.
 *
 * Deletes the file at `params.path` via the kernel filesystem adapter.
 *
 * @param instance - The resolved fs.delete capability instance
 * @param adapters - Kernel-provided adapters
 * @param context - Gate-constructed adapter call context
 */
export async function executeFsDelete(
  instance: CapabilityInstance,
  adapters: KernelAdapters,
  context: AdapterCallContext,
): Promise<void> {
  const path = String(instance.params['path'] ?? '');
  await adapters.filesystem.delete(path, context);
}
