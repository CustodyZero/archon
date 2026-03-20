/**
 * @archon/provider-anthropic
 *
 * Archon Anthropic LLM provider module.
 *
 * Exports the module manifest and the inference handler.
 * The handler calls the Anthropic Messages API via kernel adapters
 * (network for HTTP, secrets for API key retrieval).
 *
 * @see docs/specs/module_api.md §12 (LLM provider modules)
 */

export { ANTHROPIC_MANIFEST } from './manifest.js';
export { executeLlmInfer } from './execute.js';
export type { LlmInferResult } from './execute.js';
