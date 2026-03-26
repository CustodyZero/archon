/**
 * Google Provider Module — Unit Tests
 *
 * Tests for the Google provider manifest and executeLlmInfer handler.
 * All tests use adapter stubs — no real API calls are made.
 *
 * Test IDs: GOO-U1 through GOO-U14
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
import { GOOGLE_MANIFEST } from '../src/manifest.js';
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
      net_allowlist: ['generativelanguage.googleapis.com'],
    } as ResourceConfig,
  };
}

function makeInstance(params: Record<string, unknown>): CapabilityInstance {
  return {
    project_id: 'test-project',
    capability_id: 'llm.infer',
    module_id: 'provider.google',
    type: CapabilityType.LlmInfer,
    tier: RiskTier.T1,
    params,
  };
}

function makeApiResponse(content: string): string {
  return JSON.stringify({
    candidates: [{
      content: { parts: [{ text: content }] },
      finishReason: 'STOP',
    }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
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
        body: encoder.encode(makeApiResponse('Hello from Gemini')),
      })),
    },
    secrets: {
      read: overrides?.secretsRead ?? (async () => 'test-google-api-key'),
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

describe('Google Provider Manifest', () => {
  it('GOO-U1: declares module_id "provider.google"', () => {
    expect(GOOGLE_MANIFEST.module_id).toBe('provider.google');
  });

  it('GOO-U2: declares llm.infer capability (T1)', () => {
    expect(GOOGLE_MANIFEST.capability_descriptors).toHaveLength(1);
    const desc = GOOGLE_MANIFEST.capability_descriptors[0]!;
    expect(desc.type).toBe(CapabilityType.LlmInfer);
    expect(desc.tier).toBe(RiskTier.T1);
  });

  it('GOO-U3: default_enabled is false (I1)', () => {
    expect(GOOGLE_MANIFEST.capability_descriptors[0]!.default_enabled).toBe(false);
  });

  it('GOO-U4: declares provider_dependencies on net.fetch.http and secrets.use', () => {
    const deps = GOOGLE_MANIFEST.provider_dependencies;
    expect(deps).toHaveLength(2);
    const types = deps!.map((d) => d.type);
    expect(types).toContain(CapabilityType.NetFetchHttp);
    expect(types).toContain(CapabilityType.SecretsUse);
  });
});

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe('executeLlmInfer (Google)', () => {
  it('GOO-U5: reads API key from secrets adapter', async () => {
    let capturedSecretId = '';
    const adapters = makeAdapters({
      secretsRead: async (secretId) => { capturedSecretId = secretId; return 'test-key'; },
    });
    await executeLlmInfer(makeInstance({ prompt: 'Hello' }), adapters, makeContext());
    expect(capturedSecretId).toBe('GOOGLE_API_KEY');
  });

  it('GOO-U6: sends POST to generativelanguage.googleapis.com', async () => {
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
    expect(capturedUrl).toContain('generativelanguage.googleapis.com');
    expect(capturedUrl).toContain('generateContent');
    expect(capturedMethod).toBe('POST');
  });

  it('GOO-U7: includes x-goog-api-key header', async () => {
    let capturedHeaders: Record<string, string> = {};
    const encoder = new TextEncoder();
    const adapters = makeAdapters({
      fetchHttp: async (_url, options) => {
        capturedHeaders = options.headers ?? {};
        return { status: 200, headers: {}, body: encoder.encode(makeApiResponse('test')) };
      },
    });
    await executeLlmInfer(makeInstance({ prompt: 'Hello' }), adapters, makeContext());
    expect(capturedHeaders['x-goog-api-key']).toBe('test-google-api-key');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
  });

  it('GOO-U8: sends prompt in Gemini contents format', async () => {
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
    const contents = capturedBody['contents'] as Array<{ parts: Array<{ text: string }> }>;
    expect(contents).toHaveLength(1);
    expect(contents[0]!.parts[0]!.text).toBe('What is 2+2?');
  });

  it('GOO-U9: returns parsed content, model_id, and usage', async () => {
    const result = await executeLlmInfer(makeInstance({ prompt: 'Hello' }), makeAdapters(), makeContext());
    expect(result.content).toBe('Hello from Gemini');
    expect(result.model_id).toBe('gemini-2.0-flash');
    expect(result.stop_reason).toBe('STOP');
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(20);
  });

  it('GOO-U10: throws on non-2xx HTTP response', async () => {
    const encoder = new TextEncoder();
    const adapters = makeAdapters({
      fetchHttp: async () => ({
        status: 403,
        headers: {},
        body: encoder.encode('{"error":{"message":"API key invalid"}}'),
      }),
    });
    await expect(executeLlmInfer(makeInstance({ prompt: 'Hello' }), adapters, makeContext()))
      .rejects.toThrow('Google Gemini API returned HTTP 403');
  });

  it('GOO-U11: throws if prompt is missing', async () => {
    await expect(executeLlmInfer(makeInstance({}), makeAdapters(), makeContext()))
      .rejects.toThrow('prompt parameter is required');
  });

  it('GOO-U12: throws if prompt is empty', async () => {
    await expect(executeLlmInfer(makeInstance({ prompt: '' }), makeAdapters(), makeContext()))
      .rejects.toThrow('prompt parameter is required');
  });

  it('GOO-U13: uses custom model_id and max_tokens', async () => {
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> = {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const adapters = makeAdapters({
      fetchHttp: async (url, options) => {
        capturedUrl = url;
        capturedBody = JSON.parse(decoder.decode(options.body)) as Record<string, unknown>;
        return { status: 200, headers: {}, body: encoder.encode(makeApiResponse('ok')) };
      },
    });
    await executeLlmInfer(makeInstance({ prompt: 'Hi', model_id: 'gemini-1.5-pro', max_tokens: 2048 }), adapters, makeContext());
    expect(capturedUrl).toContain('gemini-1.5-pro');
    const config = capturedBody['generationConfig'] as Record<string, unknown>;
    expect(config['maxOutputTokens']).toBe(2048);
  });

  it('GOO-U14: includes system instruction and temperature when provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const adapters = makeAdapters({
      fetchHttp: async (_url, options) => {
        capturedBody = JSON.parse(decoder.decode(options.body)) as Record<string, unknown>;
        return { status: 200, headers: {}, body: encoder.encode(makeApiResponse('ok')) };
      },
    });
    await executeLlmInfer(makeInstance({ prompt: 'Hi', system: 'Be helpful', temperature: 0.5 }), adapters, makeContext());
    const sysInstr = capturedBody['systemInstruction'] as { parts: Array<{ text: string }> };
    expect(sysInstr.parts[0]!.text).toBe('Be helpful');
    const config = capturedBody['generationConfig'] as Record<string, unknown>;
    expect(config['temperature']).toBe(0.5);
  });
});
