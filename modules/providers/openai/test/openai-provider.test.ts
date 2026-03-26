/**
 * OpenAI Provider Module — Unit Tests
 *
 * Tests for the OpenAI provider manifest and executeLlmInfer handler.
 * All tests use adapter stubs — no real API calls are made.
 *
 * Test IDs: OAI-U1 through OAI-U14
 */

import { describe, it, expect } from 'vitest';
import { CapabilityType, RiskTier } from '@archon/kernel';
import type {
  KernelAdapters,
  CapabilityInstance,
  AdapterCallContext,
  RuleSnapshotHash,
  ResourceConfig,
} from '@archon/kernel';
import { OPENAI_MANIFEST } from '../src/manifest.js';
import { executeLlmInfer } from '../src/execute.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeContext(): AdapterCallContext {
  return {
    agent_id: 'test-agent',
    capability_instance: makeInstance({ prompt: 'test' }),
    rs_hash: 'test-hash' as RuleSnapshotHash,
    resource_config: {
      fs_roots: [],
      net_allowlist: ['api.openai.com'],
    } as ResourceConfig,
  };
}

function makeInstance(params: Record<string, unknown>): CapabilityInstance {
  return {
    project_id: 'test-project',
    capability_id: 'llm.infer',
    module_id: 'provider.openai',
    type: CapabilityType.LlmInfer,
    tier: RiskTier.T1,
    params,
  };
}

function makeApiResponse(content: string, model?: string): string {
  return JSON.stringify({
    id: 'chatcmpl-test-123',
    model: model ?? 'gpt-4o-2024-08-06',
    choices: [{
      message: { role: 'assistant', content },
      finish_reason: 'stop',
      index: 0,
    }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
}

function makeAdapters(overrides?: {
  secretsRead?: (secretId: string, context: AdapterCallContext) => Promise<string>;
  fetchHttp?: (
    url: string,
    options: { method: string; headers?: Record<string, string>; body?: Uint8Array },
    context: AdapterCallContext,
  ) => Promise<{ status: number; headers: Record<string, string>; body: Uint8Array }>;
}): KernelAdapters {
  const notImplemented = (): never => { throw new Error('Not implemented in test'); };
  const encoder = new TextEncoder();
  return {
    filesystem: { read: notImplemented, list: notImplemented, write: notImplemented, delete: notImplemented },
    exec: { run: notImplemented },
    network: {
      fetchHttp: overrides?.fetchHttp ?? (async () => ({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: encoder.encode(makeApiResponse('Hello from GPT')),
      })),
    },
    secrets: {
      read: overrides?.secretsRead ?? (async () => 'sk-test-openai-key'),
      use: notImplemented,
      injectEnv: notImplemented,
    },
    messaging: { send: notImplemented },
    ui: { requestApproval: notImplemented, presentRiskAck: notImplemented, requestClarification: notImplemented },
  };
}

// ---------------------------------------------------------------------------
// Manifest tests
// ---------------------------------------------------------------------------

describe('OpenAI Provider Manifest', () => {
  it('OAI-U1: declares module_id "provider.openai"', () => {
    expect(OPENAI_MANIFEST.module_id).toBe('provider.openai');
  });

  it('OAI-U2: declares llm.infer capability (T1)', () => {
    expect(OPENAI_MANIFEST.capability_descriptors).toHaveLength(1);
    const desc = OPENAI_MANIFEST.capability_descriptors[0]!;
    expect(desc.type).toBe(CapabilityType.LlmInfer);
    expect(desc.tier).toBe(RiskTier.T1);
  });

  it('OAI-U3: default_enabled is false (I1)', () => {
    expect(OPENAI_MANIFEST.capability_descriptors[0]!.default_enabled).toBe(false);
  });

  it('OAI-U4: declares provider_dependencies on net.fetch.http and secrets.use', () => {
    const deps = OPENAI_MANIFEST.provider_dependencies;
    expect(deps).toHaveLength(2);
    const types = deps!.map((d) => d.type);
    expect(types).toContain(CapabilityType.NetFetchHttp);
    expect(types).toContain(CapabilityType.SecretsUse);
  });
});

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe('executeLlmInfer (OpenAI)', () => {
  it('OAI-U5: reads API key from secrets adapter', async () => {
    let capturedSecretId = '';
    const adapters = makeAdapters({
      secretsRead: async (secretId) => { capturedSecretId = secretId; return 'test-key'; },
    });
    await executeLlmInfer(makeInstance({ prompt: 'Hello' }), adapters, makeContext());
    expect(capturedSecretId).toBe('OPENAI_API_KEY');
  });

  it('OAI-U6: sends POST to api.openai.com/v1/chat/completions', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const encoder = new TextEncoder();
    const adapters = makeAdapters({
      fetchHttp: async (url, options) => {
        capturedUrl = url;
        capturedMethod = options.method;
        return { status: 200, headers: {}, body: encoder.encode(makeApiResponse('test')) };
      },
    });
    await executeLlmInfer(makeInstance({ prompt: 'Hello' }), adapters, makeContext());
    expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(capturedMethod).toBe('POST');
  });

  it('OAI-U7: includes Bearer token in Authorization header', async () => {
    let capturedHeaders: Record<string, string> = {};
    const encoder = new TextEncoder();
    const adapters = makeAdapters({
      fetchHttp: async (_url, options) => {
        capturedHeaders = options.headers ?? {};
        return { status: 200, headers: {}, body: encoder.encode(makeApiResponse('test')) };
      },
    });
    await executeLlmInfer(makeInstance({ prompt: 'Hello' }), adapters, makeContext());
    expect(capturedHeaders['Authorization']).toBe('Bearer sk-test-openai-key');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
  });

  it('OAI-U8: sends prompt as user message in messages array', async () => {
    let capturedBody: Record<string, unknown> = {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const adapters = makeAdapters({
      fetchHttp: async (_url, options) => {
        capturedBody = JSON.parse(decoder.decode(options.body)) as Record<string, unknown>;
        return { status: 200, headers: {}, body: encoder.encode(makeApiResponse('response')) };
      },
    });
    await executeLlmInfer(makeInstance({ prompt: 'What is 2+2?' }), adapters, makeContext());
    const messages = capturedBody['messages'] as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'user', content: 'What is 2+2?' });
  });

  it('OAI-U9: returns parsed content, model_id, and usage', async () => {
    const result = await executeLlmInfer(makeInstance({ prompt: 'Hello' }), makeAdapters(), makeContext());
    expect(result.content).toBe('Hello from GPT');
    expect(result.model_id).toBe('gpt-4o-2024-08-06');
    expect(result.stop_reason).toBe('stop');
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(20);
  });

  it('OAI-U10: throws on non-2xx HTTP response', async () => {
    const encoder = new TextEncoder();
    const adapters = makeAdapters({
      fetchHttp: async () => ({
        status: 401,
        headers: {},
        body: encoder.encode('{"error":{"message":"Incorrect API key provided"}}'),
      }),
    });
    await expect(executeLlmInfer(makeInstance({ prompt: 'Hello' }), adapters, makeContext()))
      .rejects.toThrow('OpenAI API returned HTTP 401');
  });

  it('OAI-U11: throws if prompt is missing', async () => {
    await expect(executeLlmInfer(makeInstance({}), makeAdapters(), makeContext()))
      .rejects.toThrow('prompt parameter is required');
  });

  it('OAI-U12: throws if prompt is empty', async () => {
    await expect(executeLlmInfer(makeInstance({ prompt: '' }), makeAdapters(), makeContext()))
      .rejects.toThrow('prompt parameter is required');
  });

  it('OAI-U13: uses custom model_id and max_tokens', async () => {
    let capturedBody: Record<string, unknown> = {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const adapters = makeAdapters({
      fetchHttp: async (_url, options) => {
        capturedBody = JSON.parse(decoder.decode(options.body)) as Record<string, unknown>;
        return { status: 200, headers: {}, body: encoder.encode(makeApiResponse('ok', 'gpt-3.5-turbo')) };
      },
    });
    await executeLlmInfer(makeInstance({ prompt: 'Hi', model_id: 'gpt-3.5-turbo', max_tokens: 2048 }), adapters, makeContext());
    expect(capturedBody['model']).toBe('gpt-3.5-turbo');
    expect(capturedBody['max_tokens']).toBe(2048);
  });

  it('OAI-U14: includes system message and temperature when provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const adapters = makeAdapters({
      fetchHttp: async (_url, options) => {
        capturedBody = JSON.parse(decoder.decode(options.body)) as Record<string, unknown>;
        return { status: 200, headers: {}, body: encoder.encode(makeApiResponse('ok')) };
      },
    });
    await executeLlmInfer(makeInstance({ prompt: 'Hi', system: 'Be helpful', temperature: 0.7 }), adapters, makeContext());
    const messages = capturedBody['messages'] as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'system', content: 'Be helpful' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hi' });
    expect(capturedBody['temperature']).toBe(0.7);
  });
});
