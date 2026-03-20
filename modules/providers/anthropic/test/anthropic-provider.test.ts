/**
 * Anthropic Provider Module — Unit Tests
 *
 * Tests for the Anthropic provider manifest and executeLlmInfer handler.
 * All tests use adapter stubs — no real API calls are made.
 *
 * The handler is tested through its adapter contract: secrets adapter
 * returns a fake API key, network adapter returns a fake HTTP response.
 * This verifies the handler correctly composes request, parses response,
 * and handles error conditions.
 *
 * Test IDs: ANT-U1 through ANT-U14
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
import { ANTHROPIC_MANIFEST } from '../src/manifest.js';
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
      net_allowlist: ['api.anthropic.com'],
    } as ResourceConfig,
  };
}

function makeInstance(params: Record<string, unknown>): CapabilityInstance {
  return {
    project_id: 'test-project',
    capability_id: 'llm.infer',
    module_id: 'provider.anthropic',
    type: CapabilityType.LlmInfer,
    tier: RiskTier.T1,
    params,
  };
}

/** Build a fake successful Anthropic API response body. */
function makeApiResponse(content: string, model?: string): string {
  return JSON.stringify({
    id: 'msg_test_123',
    model: model ?? 'claude-sonnet-4-20250514',
    content: [{ type: 'text', text: content }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 20 },
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
  const notImplemented = (): never => {
    throw new Error('Not implemented in test');
  };
  const encoder = new TextEncoder();

  return {
    filesystem: {
      read: notImplemented,
      list: notImplemented,
      write: notImplemented,
      delete: notImplemented,
    },
    exec: { run: notImplemented },
    network: {
      fetchHttp: overrides?.fetchHttp ?? (async () => ({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: encoder.encode(makeApiResponse('Hello from Claude')),
      })),
    },
    secrets: {
      read: overrides?.secretsRead ?? (async () => 'sk-ant-test-key'),
      use: notImplemented,
      injectEnv: notImplemented,
    },
    messaging: { send: notImplemented },
    ui: {
      requestApproval: notImplemented,
      presentRiskAck: notImplemented,
      requestClarification: notImplemented,
    },
  };
}

// ---------------------------------------------------------------------------
// Manifest tests
// ---------------------------------------------------------------------------

describe('Anthropic Provider Manifest', () => {
  it('ANT-U1: declares module_id "provider.anthropic"', () => {
    expect(ANTHROPIC_MANIFEST.module_id).toBe('provider.anthropic');
  });

  it('ANT-U2: declares llm.infer capability (T1)', () => {
    expect(ANTHROPIC_MANIFEST.capability_descriptors).toHaveLength(1);
    const desc = ANTHROPIC_MANIFEST.capability_descriptors[0]!;
    expect(desc.capability_id).toBe('llm.infer');
    expect(desc.type).toBe(CapabilityType.LlmInfer);
    expect(desc.tier).toBe(RiskTier.T1);
  });

  it('ANT-U3: default_enabled is false (I1)', () => {
    expect(ANTHROPIC_MANIFEST.capability_descriptors[0]!.default_enabled).toBe(false);
  });

  it('ANT-U4: declares provider_dependencies on net.fetch.http and secrets.use', () => {
    const deps = ANTHROPIC_MANIFEST.provider_dependencies;
    expect(deps).toBeDefined();
    expect(deps).toHaveLength(2);
    const types = deps!.map((d) => d.type);
    expect(types).toContain(CapabilityType.NetFetchHttp);
    expect(types).toContain(CapabilityType.SecretsUse);
  });
});

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe('executeLlmInfer', () => {
  it('ANT-U5: reads API key from secrets adapter', async () => {
    let capturedSecretId = '';
    const adapters = makeAdapters({
      secretsRead: async (secretId) => {
        capturedSecretId = secretId;
        return 'sk-ant-test-key';
      },
    });

    const instance = makeInstance({ prompt: 'Hello' });
    await executeLlmInfer(instance, adapters, makeContext());

    expect(capturedSecretId).toBe('ANTHROPIC_API_KEY');
  });

  it('ANT-U6: sends POST to api.anthropic.com/v1/messages', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const encoder = new TextEncoder();

    const adapters = makeAdapters({
      fetchHttp: async (url, options) => {
        capturedUrl = url;
        capturedMethod = options.method;
        return {
          status: 200,
          headers: {},
          body: encoder.encode(makeApiResponse('test')),
        };
      },
    });

    const instance = makeInstance({ prompt: 'Hello' });
    await executeLlmInfer(instance, adapters, makeContext());

    expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages');
    expect(capturedMethod).toBe('POST');
  });

  it('ANT-U7: includes x-api-key and anthropic-version headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    const encoder = new TextEncoder();

    const adapters = makeAdapters({
      fetchHttp: async (_url, options) => {
        capturedHeaders = options.headers ?? {};
        return {
          status: 200,
          headers: {},
          body: encoder.encode(makeApiResponse('test')),
        };
      },
    });

    const instance = makeInstance({ prompt: 'Hello' });
    await executeLlmInfer(instance, adapters, makeContext());

    expect(capturedHeaders['x-api-key']).toBe('sk-ant-test-key');
    expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
  });

  it('ANT-U8: sends prompt as user message in request body', async () => {
    let capturedBody: Record<string, unknown> = {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const adapters = makeAdapters({
      fetchHttp: async (_url, options) => {
        capturedBody = JSON.parse(decoder.decode(options.body)) as Record<string, unknown>;
        return {
          status: 200,
          headers: {},
          body: encoder.encode(makeApiResponse('response')),
        };
      },
    });

    const instance = makeInstance({ prompt: 'What is 2+2?' });
    await executeLlmInfer(instance, adapters, makeContext());

    expect(capturedBody['messages']).toEqual([{ role: 'user', content: 'What is 2+2?' }]);
  });

  it('ANT-U9: returns parsed content, model_id, stop_reason, and usage', async () => {
    const adapters = makeAdapters();

    const instance = makeInstance({ prompt: 'Hello' });
    const result = await executeLlmInfer(instance, adapters, makeContext());

    expect(result.content).toBe('Hello from Claude');
    expect(result.model_id).toBe('claude-sonnet-4-20250514');
    expect(result.stop_reason).toBe('end_turn');
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(20);
  });

  it('ANT-U10: throws on non-2xx HTTP response', async () => {
    const encoder = new TextEncoder();

    const adapters = makeAdapters({
      fetchHttp: async () => ({
        status: 401,
        headers: {},
        body: encoder.encode('{"error":{"message":"Invalid API key"}}'),
      }),
    });

    const instance = makeInstance({ prompt: 'Hello' });

    await expect(
      executeLlmInfer(instance, adapters, makeContext()),
    ).rejects.toThrow('Anthropic API returned HTTP 401');
  });

  it('ANT-U11: throws if prompt parameter is missing', async () => {
    const adapters = makeAdapters();
    const instance = makeInstance({});

    await expect(
      executeLlmInfer(instance, adapters, makeContext()),
    ).rejects.toThrow('prompt parameter is required');
  });

  it('ANT-U12: throws if prompt parameter is empty string', async () => {
    const adapters = makeAdapters();
    const instance = makeInstance({ prompt: '' });

    await expect(
      executeLlmInfer(instance, adapters, makeContext()),
    ).rejects.toThrow('prompt parameter is required');
  });

  it('ANT-U13: uses custom model_id and max_tokens from params', async () => {
    let capturedBody: Record<string, unknown> = {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const adapters = makeAdapters({
      fetchHttp: async (_url, options) => {
        capturedBody = JSON.parse(decoder.decode(options.body)) as Record<string, unknown>;
        return {
          status: 200,
          headers: {},
          body: encoder.encode(makeApiResponse('ok', 'claude-3-haiku-20240307')),
        };
      },
    });

    const instance = makeInstance({
      prompt: 'Hi',
      model_id: 'claude-3-haiku-20240307',
      max_tokens: 2048,
    });
    await executeLlmInfer(instance, adapters, makeContext());

    expect(capturedBody['model']).toBe('claude-3-haiku-20240307');
    expect(capturedBody['max_tokens']).toBe(2048);
  });

  it('ANT-U14: includes system prompt and temperature when provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const adapters = makeAdapters({
      fetchHttp: async (_url, options) => {
        capturedBody = JSON.parse(decoder.decode(options.body)) as Record<string, unknown>;
        return {
          status: 200,
          headers: {},
          body: encoder.encode(makeApiResponse('ok')),
        };
      },
    });

    const instance = makeInstance({
      prompt: 'Hi',
      system: 'You are a helpful assistant.',
      temperature: 0.7,
    });
    await executeLlmInfer(instance, adapters, makeContext());

    expect(capturedBody['system']).toBe('You are a helpful assistant.');
    expect(capturedBody['temperature']).toBe(0.7);
  });
});
