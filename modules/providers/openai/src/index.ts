/**
 * @archon/provider-openai
 *
 * Archon OpenAI LLM provider module.
 *
 * Exports the module manifest and the inference handler.
 *
 * @see docs/specs/module_api.md §12 (LLM provider modules)
 */

export { OPENAI_MANIFEST } from './manifest.js';
export { executeLlmInfer } from './execute.js';
export type { LlmInferResult } from './execute.js';
