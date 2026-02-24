/**
 * @archon/provider-anthropic
 *
 * Archon Anthropic LLM provider module.
 *
 * Exports the module manifest and the inference handler stub.
 * This module is NOT registered in the CLI first-party catalog for P0.
 *
 * @see docs/specs/module_api.md §12 (LLM provider modules)
 */

export { ANTHROPIC_MANIFEST } from './manifest.js';
export { executeLlmInfer } from './execute.js';
