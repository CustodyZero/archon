/**
 * Archon Anthropic Provider Module — Execute Handler
 *
 * DEV STUB: This handler returns a placeholder response.
 * No network calls are made. No Anthropic API is contacted.
 *
 * This is explicitly labeled as a skeleton implementation for P0.
 * Real inference requires: API key via SecretsAdapter, HTTP call via
 * NetworkAdapter to api.anthropic.com, response parsing.
 *
 * The placeholder is clearly isolated behind this module boundary.
 * Production code paths must not depend on this stub returning real results.
 *
 * @see docs/specs/module_api.md §12 (LLM provider modules)
 */

import type { CapabilityInstance, KernelAdapters, AdapterCallContext } from '@archon/kernel';

/**
 * Execute an llm.infer capability instance.
 *
 * DEV STUB: Returns a placeholder indicating inference is not yet wired.
 * No network calls. No API credentials accessed.
 *
 * @param instance - The resolved llm.infer capability instance
 * @param _adapters - Kernel-provided adapters (not used in stub)
 * @param _context - Gate-constructed adapter call context (not used in stub)
 * @returns Placeholder response object
 */
export async function executeLlmInfer(
  instance: CapabilityInstance,
  _adapters: KernelAdapters,
  _context: AdapterCallContext,
): Promise<{ content: string; model_id: string; stub: true }> {
  // DEV STUB: real inference not implemented for P0.
  // When implemented: use adapters.secrets to retrieve API key,
  // adapters.network to call the Anthropic API, parse the response.
  const modelId = String(instance.params['model_id'] ?? 'unknown');
  return {
    content: `[DEV STUB] llm.infer placeholder — model: ${modelId}. Real inference not implemented for P0.`,
    model_id: modelId,
    stub: true,
  };
}
