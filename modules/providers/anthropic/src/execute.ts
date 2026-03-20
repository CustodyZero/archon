/**
 * Archon Anthropic Provider Module — Execute Handler
 *
 * Real implementation: calls the Anthropic Messages API via the kernel's
 * NetworkAdapter (P5 hostname-allowlisted) and reads the API key via
 * the SecretsAdapter (project-scoped SecretStore).
 *
 * No direct HTTP or node:crypto imports — all I/O flows through kernel
 * adapters, preserving the boundary and making the handler testable
 * with adapter stubs in unit tests.
 *
 * Required governance state before this handler can execute:
 *   - llm.infer capability must be enabled (I1 deny-by-default)
 *   - net.fetch.http capability must be enabled (provider_dependency)
 *   - secrets.use capability must be enabled (provider_dependency)
 *   - 'api.anthropic.com' must be in the project's net_allowlist (P5)
 *   - 'ANTHROPIC_API_KEY' secret must exist in the project SecretStore
 *
 * @see docs/specs/module_api.md §12 (LLM provider modules)
 */

import type { CapabilityInstance, KernelAdapters, AdapterCallContext } from '@archon/kernel';

/** Shape of a single content block in the Anthropic Messages API response. */
interface AnthropicContentBlock {
  readonly type: string;
  readonly text?: string;
}

/** Minimal shape of the Anthropic Messages API response we consume. */
interface AnthropicMessagesResponse {
  readonly id: string;
  readonly model: string;
  readonly content: ReadonlyArray<AnthropicContentBlock>;
  readonly stop_reason: string | null;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
}

/** Secret ID used to retrieve the Anthropic API key from the project SecretStore. */
const ANTHROPIC_API_KEY_SECRET_ID = 'ANTHROPIC_API_KEY';

/** Anthropic Messages API endpoint. */
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/** API version header value. */
const ANTHROPIC_API_VERSION = '2023-06-01';

/** Default model if not specified in params. */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Default max_tokens if not specified in params. */
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Result shape for executeLlmInfer.
 *
 * The return type is explicit — callers know exactly what to expect.
 * `stub` field is absent (real implementation), distinguishing from
 * the previous DEV STUB return type.
 */
export interface LlmInferResult {
  readonly content: string;
  readonly model_id: string;
  readonly stop_reason: string | null;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
}

/**
 * Execute an llm.infer capability instance via the Anthropic Messages API.
 *
 * @param instance - The resolved llm.infer capability instance.
 *   Expected params:
 *     - prompt (string, required): The user message to send
 *     - model_id (string, optional): Anthropic model ID (default: claude-sonnet-4-20250514)
 *     - temperature (number, optional): Sampling temperature (0.0–1.0)
 *     - max_tokens (number, optional): Maximum tokens to generate (default: 1024)
 *     - system (string, optional): System prompt
 * @param adapters - Kernel-provided adapters (network for HTTP, secrets for API key)
 * @param context - Gate-constructed adapter call context
 * @returns LlmInferResult with model response content and usage metadata
 */
export async function executeLlmInfer(
  instance: CapabilityInstance,
  adapters: KernelAdapters,
  context: AdapterCallContext,
): Promise<LlmInferResult> {
  // --- Extract and validate params ---
  const prompt = instance.params['prompt'];
  if (typeof prompt !== 'string' || prompt === '') {
    throw new Error('llm.infer: prompt parameter is required and must be a non-empty string');
  }

  const modelId = typeof instance.params['model_id'] === 'string'
    ? instance.params['model_id']
    : DEFAULT_MODEL;

  const temperature = typeof instance.params['temperature'] === 'number'
    ? instance.params['temperature']
    : undefined;

  const maxTokens = typeof instance.params['max_tokens'] === 'number'
    ? instance.params['max_tokens']
    : DEFAULT_MAX_TOKENS;

  const system = typeof instance.params['system'] === 'string'
    ? instance.params['system']
    : undefined;

  // --- Retrieve API key via secrets adapter ---
  const apiKey = await adapters.secrets.read(ANTHROPIC_API_KEY_SECRET_ID, context);

  // --- Build request body ---
  const requestBody: Record<string, unknown> = {
    model: modelId,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (temperature !== undefined) {
    requestBody['temperature'] = temperature;
  }
  if (system !== undefined) {
    requestBody['system'] = system;
  }

  // --- Call the Anthropic Messages API via network adapter ---
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');

  const response = await adapters.network.fetchHttp(
    ANTHROPIC_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: encoder.encode(JSON.stringify(requestBody)),
    },
    context,
  );

  // --- Decode response body ---
  const responseText = decoder.decode(response.body);

  // --- Handle non-success responses ---
  if (response.status < 200 || response.status >= 300) {
    // Surface the error truthfully — no silent fallback.
    throw new Error(
      `llm.infer: Anthropic API returned HTTP ${String(response.status)}: ${responseText}`,
    );
  }

  // --- Parse response ---
  const parsed = JSON.parse(responseText) as AnthropicMessagesResponse;

  // Extract text content blocks.
  const textBlocks = parsed.content.filter(
    (block): block is AnthropicContentBlock & { text: string } =>
      block.type === 'text' && typeof block.text === 'string',
  );
  const content = textBlocks.map((b) => b.text).join('');

  return {
    content,
    model_id: parsed.model,
    stop_reason: parsed.stop_reason,
    usage: {
      input_tokens: parsed.usage.input_tokens,
      output_tokens: parsed.usage.output_tokens,
    },
  };
}
