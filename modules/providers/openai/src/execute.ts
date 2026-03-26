/**
 * Archon OpenAI Provider Module — Execute Handler
 *
 * Real implementation: calls the OpenAI Chat Completions API via the kernel's
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
 *   - 'api.openai.com' must be in the project's net_allowlist (P5)
 *   - 'OPENAI_API_KEY' secret must exist in the project SecretStore
 *
 * @see docs/specs/module_api.md §12 (LLM provider modules)
 */

import type { CapabilityInstance, KernelAdapters, AdapterCallContext } from '@archon/kernel';

/** Shape of a choice in the OpenAI Chat Completions response. */
interface OpenAIChoice {
  readonly message: {
    readonly role: string;
    readonly content: string | null;
  };
  readonly finish_reason: string | null;
  readonly index: number;
}

/** Minimal shape of the OpenAI Chat Completions response we consume. */
interface OpenAIResponse {
  readonly id: string;
  readonly model: string;
  readonly choices: ReadonlyArray<OpenAIChoice>;
  readonly usage: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
}

/** Secret ID used to retrieve the OpenAI API key from the project SecretStore. */
const OPENAI_API_KEY_SECRET_ID = 'OPENAI_API_KEY';

/** OpenAI Chat Completions API endpoint. */
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** Default model if not specified in params. */
const DEFAULT_MODEL = 'gpt-4o';

/** Default max_tokens if not specified in params. */
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Result shape for executeLlmInfer.
 *
 * Matches the Anthropic provider's LlmInferResult interface.
 * No `stub` field — this is a real implementation.
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
 * Execute an llm.infer capability instance via the OpenAI Chat Completions API.
 *
 * @param instance - The resolved llm.infer capability instance.
 *   Expected params:
 *     - prompt (string, required): The user message to send
 *     - model_id (string, optional): OpenAI model ID (default: gpt-4o)
 *     - temperature (number, optional): Sampling temperature
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
  const apiKey = await adapters.secrets.read(OPENAI_API_KEY_SECRET_ID, context);

  // --- Build request body (OpenAI Chat Completions format) ---
  const messages: Array<{ role: string; content: string }> = [];
  if (system !== undefined) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

  const requestBody: Record<string, unknown> = {
    model: modelId,
    messages,
    max_tokens: maxTokens,
  };
  if (temperature !== undefined) {
    requestBody['temperature'] = temperature;
  }

  // --- Call the OpenAI API via network adapter ---
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');

  const response = await adapters.network.fetchHttp(
    OPENAI_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: encoder.encode(JSON.stringify(requestBody)),
    },
    context,
  );

  // --- Decode response body ---
  const responseText = decoder.decode(response.body);

  // --- Handle non-success responses ---
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `llm.infer: OpenAI API returned HTTP ${String(response.status)}: ${responseText}`,
    );
  }

  // --- Parse response ---
  const parsed = JSON.parse(responseText) as OpenAIResponse;

  if (parsed.choices.length === 0) {
    throw new Error('llm.infer: OpenAI API returned no choices');
  }

  const choice = parsed.choices[0]!;
  const content = choice.message.content ?? '';

  return {
    content,
    model_id: parsed.model,
    stop_reason: choice.finish_reason,
    usage: {
      input_tokens: parsed.usage.prompt_tokens,
      output_tokens: parsed.usage.completion_tokens,
    },
  };
}
