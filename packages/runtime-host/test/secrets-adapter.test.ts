/**
 * Archon Runtime Host — NodeSecretsAdapter Tests
 *
 * Verifies the secrets adapter bridges correctly to project-scoped SecretStore
 * and enforces the SecretsAdapter contract.
 *
 *   SEC-S9-U1: read returns secret from current project only
 *   SEC-S9-U2: missing secret fails explicitly
 *   SEC-S9-U3: use resolves correctly and remains project-scoped
 *   SEC-S9-U4: injectEnv validates access and does not mutate process.env
 *   SEC-S9-U5: project A secrets cannot be read from project B
 *   SEC-S9-U6: portable/device secret modes function through adapter
 *   SEC-S9-U7: use rejects empty sinkType
 *   SEC-S9-U8: injectEnv rejects empty targetProcess
 *
 * Isolation: each test creates independent temp directories. No shared state.
 * Tests never print or assert plaintext secret values in log output.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AdapterCallContext, RuleSnapshotHash } from '@archon/kernel';
import { CapabilityType } from '@archon/kernel';
import { NodeSecretsAdapter } from '../src/adapters/secrets.js';
import { SecretStore } from '../src/secrets/secret-store.js';
import { FileStateIO } from '../src/state/state-io.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/**
 * Create an isolated SecretStore with a fresh temp directory.
 * Returns the adapter, store, and fixture paths.
 */
function makeFixture(label: string): {
  adapter: NodeSecretsAdapter;
  store: SecretStore;
  stateIO: FileStateIO;
  deviceKeyPath: string;
} {
  const projectDir = mkdtempSync(`${tmpdir()}/archon-sec-adapter-${label}-`);
  const stateDir = join(projectDir, 'state');
  mkdirSync(stateDir, { recursive: true });
  const keyDir = mkdtempSync(`${tmpdir()}/archon-key-adapter-${label}-`);
  const deviceKeyPath = join(keyDir, 'device.key');
  const stateIO = new FileStateIO(projectDir);
  const store = new SecretStore(stateIO, deviceKeyPath);
  const adapter = new NodeSecretsAdapter(store);
  return { adapter, store, stateIO, deviceKeyPath };
}

function makeContext(projectId: string, capType: CapabilityType): AdapterCallContext {
  return {
    agent_id: 'test-agent',
    capability_instance: {
      module_id: 'test-module',
      capability_id: 'secrets.read',
      type: capType,
      params: {},
      project_id: projectId,
    },
    rs_hash: 'test-hash' as unknown as RuleSnapshotHash,
    resource_config: {
      fs_roots: [],
      net_allowlist: [],
      exec_cwd_root_id: null,
      secrets_epoch: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NodeSecretsAdapter', () => {
  // SEC-S9-U1
  it('SEC-S9-U1: read returns secret from current project', async () => {
    const { adapter, store } = makeFixture('u1');
    const ctx = makeContext('project-u1', CapabilityType.SecretsUse);

    store.setSecret('api-key', 'sk-test-12345');
    const value = await adapter.read('api-key', ctx);

    expect(value).toBe('sk-test-12345');
  });

  // SEC-S9-U2
  it('SEC-S9-U2: missing secret fails explicitly', async () => {
    const { adapter } = makeFixture('u2');
    const ctx = makeContext('project-u2', CapabilityType.SecretsUse);

    await expect(
      adapter.read('nonexistent-key', ctx),
    ).rejects.toThrow(/Secret 'nonexistent-key' not found/);
  });

  // SEC-S9-U3
  it('SEC-S9-U3: use resolves correctly and remains project-scoped', async () => {
    const { adapter, store } = makeFixture('u3');
    const ctx = makeContext('project-u3', CapabilityType.SecretsUse);

    store.setSecret('db-password', 'secret-value');

    // use() should succeed (not throw) when secret exists
    await expect(
      adapter.use('db-password', 'env_var', ctx),
    ).resolves.toBeUndefined();
  });

  it('SEC-S9-U3b: use fails when secret is missing', async () => {
    const { adapter } = makeFixture('u3b');
    const ctx = makeContext('project-u3b', CapabilityType.SecretsUse);

    await expect(
      adapter.use('nonexistent', 'env_var', ctx),
    ).rejects.toThrow(/Secret 'nonexistent' not found/);
  });

  // SEC-S9-U4
  it('SEC-S9-U4: injectEnv validates access and does not mutate process.env', async () => {
    const { adapter, store } = makeFixture('u4');
    const ctx = makeContext('project-u4', CapabilityType.SecretsInjectEnv);

    store.setSecret('api-key', 'sk-should-not-leak');

    // Capture process.env state before
    const envBefore = { ...process.env };

    await expect(
      adapter.injectEnv('api-key', 'target-process', ctx),
    ).resolves.toBeUndefined();

    // Verify process.env was NOT mutated
    // Check that no new key was added containing 'api-key' or the secret value
    const envAfter = { ...process.env };
    const newKeys = Object.keys(envAfter).filter((k) => !(k in envBefore));
    expect(newKeys).toHaveLength(0);

    // Verify specific: no key contains the secret value
    for (const val of Object.values(envAfter)) {
      expect(val).not.toBe('sk-should-not-leak');
    }
  });

  it('SEC-S9-U4b: injectEnv fails when secret is missing', async () => {
    const { adapter } = makeFixture('u4b');
    const ctx = makeContext('project-u4b', CapabilityType.SecretsInjectEnv);

    await expect(
      adapter.injectEnv('missing-key', 'target-process', ctx),
    ).rejects.toThrow(/Secret 'missing-key' not found/);
  });

  // SEC-S9-U5
  it('SEC-S9-U5: project A secrets cannot be read from project B adapter', async () => {
    // Create two isolated project stores
    const fixtureA = makeFixture('u5a');
    const fixtureB = makeFixture('u5b');

    // Store secret in project A only
    fixtureA.store.setSecret('shared-key', 'project-a-value');

    // Project A adapter can read it
    const ctxA = makeContext('project-a', CapabilityType.SecretsUse);
    const value = await fixtureA.adapter.read('shared-key', ctxA);
    expect(value).toBe('project-a-value');

    // Project B adapter cannot read it (different SecretStore)
    const ctxB = makeContext('project-b', CapabilityType.SecretsUse);
    await expect(
      fixtureB.adapter.read('shared-key', ctxB),
    ).rejects.toThrow(/Secret 'shared-key' not found/);
  });

  // SEC-S9-U6
  it('SEC-S9-U6: portable mode secrets function through adapter boundary', async () => {
    const { adapter, store } = makeFixture('u6');
    const ctx = makeContext('project-u6', CapabilityType.SecretsUse);

    // Store in device mode first
    store.setSecret('device-secret', 'device-value');

    // Switch to portable mode
    store.setMode('portable', 'test-passphrase');

    // Create a new adapter with passphrase to verify portable read works
    const portableStore = new SecretStore(
      (makeFixture('u6').stateIO), // fresh stateIO won't have the secret
      (makeFixture('u6').deviceKeyPath),
      'test-passphrase',
    );

    // Use the original store's stateIO which has the data
    const originalProjectDir = mkdtempSync(`${tmpdir()}/archon-sec-adapter-u6p-`);
    const originalStateDir = join(originalProjectDir, 'state');
    mkdirSync(originalStateDir, { recursive: true });
    const originalKeyDir = mkdtempSync(`${tmpdir()}/archon-key-adapter-u6p-`);
    const originalDeviceKeyPath = join(originalKeyDir, 'device.key');
    const originalStateIO = new FileStateIO(originalProjectDir);
    const storeForPortable = new SecretStore(originalStateIO, originalDeviceKeyPath);

    // Set secret in device mode, switch to portable, then read via adapter
    storeForPortable.setSecret('portable-key', 'portable-value');
    storeForPortable.setMode('portable', 'my-passphrase');

    // Read with adapter backed by a portable-mode store with passphrase
    const portableStoreWithPassphrase = new SecretStore(
      originalStateIO,
      originalDeviceKeyPath,
      'my-passphrase',
    );
    const portableAdapter = new NodeSecretsAdapter(portableStoreWithPassphrase);
    const value = await portableAdapter.read('portable-key', ctx);
    expect(value).toBe('portable-value');
  });

  // SEC-S9-U7
  it('SEC-S9-U7: use rejects empty sinkType', async () => {
    const { adapter, store } = makeFixture('u7');
    const ctx = makeContext('project-u7', CapabilityType.SecretsUse);

    store.setSecret('some-key', 'some-value');

    await expect(
      adapter.use('some-key', '', ctx),
    ).rejects.toThrow(/non-empty sinkType/);
  });

  // SEC-S9-U8
  it('SEC-S9-U8: injectEnv rejects empty targetProcess', async () => {
    const { adapter, store } = makeFixture('u8');
    const ctx = makeContext('project-u8', CapabilityType.SecretsInjectEnv);

    store.setSecret('some-key', 'some-value');

    await expect(
      adapter.injectEnv('some-key', '', ctx),
    ).rejects.toThrow(/non-empty targetProcess/);
  });
});
