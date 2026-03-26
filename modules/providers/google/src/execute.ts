/**
 * Archon Google Provider Module — Execute Handler
 *
 * Real implementation: calls the Google Gemini API via the kernel's
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
 *   - 'generativelanguage.googleapis.com' must be in the project's net_allowlist (P5)
 *   - 'GOOGLE_API_KEY' secret must exist in the project SecretStore
 *
 * @see docs/specs/module_api.md §12 (LLM provider modules)
 */

import type { CapabilityInstance, KernelAdapters, AdapterCallContext } from '@archon/kernel';

/** Shape of a content part in the Gemini API response. */
interface GeminiPart {
  readonly text?: string;
}

/** Shape of a candidate in the Gemini API response. */
interface GeminiCandidate {
  readonly content: {
    readonly parts: ReadonlyArray<GeminiPart>;
  };
  readonly finishReason: string;
}

/** Minimal shape of the Gemini generateContent response we consume. */
interface GeminiResponse {
  readonly candidates: ReadonlyArray<GeminiCandidate>;
  readonly usageMetadata?: {
    readonly promptTokenCount: number;
    readonly candidatesTokenCount: number;
    readonly totalTokenCount: number;
  };
}

/** Secret ID used to retrieve the Google API key from the project SecretStore. */
const GOOGLE_API_KEY_SECRET_ID = 'GOOGLE_API_KEY';

/** Default model if not specified in params. */
const DEFAULT_MODEL = 'gemini-2.0-flash';

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
 * Execute an llm.infer capability instance via the Google Gemini API.
 *
 * @param instance - The resolved llm.infer capability instance.
 *   Expected params:
 *     - prompt (string, required): The user message to send
 *     - model_id (string, optional): Gemini model ID (default: gemini-2.0-flash)
 *     - temperature (number, optional): Sampling temperature
 *     - max_tokens (number, optional): Maximum tokens to generate (default: 1024)
 *     - system (string, optional): System instruction
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
  const apiKey = await adapters.secrets.read(GOOGLE_API_KEY_SECRET_ID, context);

  // --- Build request body (Gemini generateContent format) ---
  const requestBody: Record<string, unknown> = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
    },
  };
  if (system !== undefined) {
    requestBody['systemInstruction'] = {
      parts: [{ text: system }],
    };
  }

  // --- Call the Gemini API via network adapter ---
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');

  const response = await adapters.network.fetchHttp(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
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
      `llm.infer: Google Gemini API returned HTTP ${String(response.status)}: ${responseText}`,
    );
  }

  // --- Parse response ---
  const parsed = JSON.parse(responseText) as GeminiResponse;

  if (parsed.candidates.length === 0) {
    throw new Error('llm.infer: Google Gemini API returned no candidates');
  }

  const candidate = parsed.candidates[0]!;
  const content = candidate.content.parts
    .filter((p): p is GeminiPart & { text: string } => typeof p.text === 'string')
    .map((p) => p.text)
    .join('');

  return {
    content,
    model_id: modelId,
    stop_reason: candidate.finishReason ?? null,
    usage: {
      input_tokens: parsed.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: parsed.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
