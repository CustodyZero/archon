/**
 * Archon Module Loader — ResourceConfigStore Tests
 *
 * Tests for ResourceConfigStore: per-project resource configuration
 * persistence and mutation.
 *
 * Coverage:
 *   R1: getResourceConfig returns EMPTY_RESOURCE_CONFIG when no file exists
 *   R2: setFsRoots persists and retrieves correctly
 *   R3: setFsRoots replaces the entire array (not append)
 *   R4: setFsRoots with empty array clears all roots
 *   R5: setNetAllowlist persists and retrieves correctly
 *   R6: setNetAllowlist with empty array clears allowlist
 *   R7: setExecCwdRootId sets a root ID
 *   R8: setExecCwdRootId sets null (reset to workspace default)
 *   R9: incrementSecretsEpoch starts at 0 and increments by 1
 *   R10: incrementSecretsEpoch is monotonically increasing across multiple calls
 *   R11: mutations are independent — setFsRoots does not overwrite net_allowlist
 *   R12: mutations are independent — setNetAllowlist does not overwrite fs_roots
 *   R13: combined state: all fields persist together after sequential mutations
 *
 * P4 isolation: each test uses a fresh MemoryStateIO — no filesystem I/O,
 * no ARCHON_STATE_DIR dependency.
 */

import { describe, it, expect } from 'vitest';
import type { FsRoot } from '@archon/kernel';
import { EMPTY_RESOURCE_CONFIG } from '@archon/kernel';
import { MemoryStateIO } from '@archon/runtime-host';
import { ResourceConfigStore } from '../src/resource-config-store.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Root fixture A — read-only. */
const ROOT_A: FsRoot = { id: 'workspace', path: '/home/user/workspace', perm: 'rw' };

/** Root fixture B — read-only. */
const ROOT_B: FsRoot = { id: 'docs', path: '/home/user/docs', perm: 'ro' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResourceConfigStore', () => {
  // -------------------------------------------------------------------------
  // R1: Default state
  // -------------------------------------------------------------------------

  it('R1: getResourceConfig returns EMPTY_RESOURCE_CONFIG when no file exists', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    const config = store.getResourceConfig();

    expect(config).toEqual(EMPTY_RESOURCE_CONFIG);
    expect(config.fs_roots).toHaveLength(0);
    expect(config.net_allowlist).toHaveLength(0);
    expect(config.exec_cwd_root_id).toBeNull();
    expect(config.secrets_epoch).toBe(0);
  });

  // -------------------------------------------------------------------------
  // R2–R4: FS roots
  // -------------------------------------------------------------------------

  it('R2: setFsRoots persists a single root and retrieves it correctly', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.setFsRoots([ROOT_A]);
    const config = store.getResourceConfig();

    expect(config.fs_roots).toHaveLength(1);
    expect(config.fs_roots[0]).toEqual(ROOT_A);
  });

  it('R3: setFsRoots replaces the entire array — not append', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.setFsRoots([ROOT_A]);
    store.setFsRoots([ROOT_B]);
    const config = store.getResourceConfig();

    expect(config.fs_roots).toHaveLength(1);
    expect(config.fs_roots[0]).toEqual(ROOT_B);
  });

  it('R4: setFsRoots with empty array clears all roots', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.setFsRoots([ROOT_A, ROOT_B]);
    store.setFsRoots([]);
    const config = store.getResourceConfig();

    expect(config.fs_roots).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // R5–R6: Net allowlist
  // -------------------------------------------------------------------------

  it('R5: setNetAllowlist persists hostnames and retrieves them correctly', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.setNetAllowlist(['api.example.com', '*.cdn.example.com']);
    const config = store.getResourceConfig();

    expect(config.net_allowlist).toHaveLength(2);
    expect(config.net_allowlist).toContain('api.example.com');
    expect(config.net_allowlist).toContain('*.cdn.example.com');
  });

  it('R6: setNetAllowlist with empty array clears allowlist', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.setNetAllowlist(['api.example.com']);
    store.setNetAllowlist([]);
    const config = store.getResourceConfig();

    expect(config.net_allowlist).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // R7–R8: Exec CWD root
  // -------------------------------------------------------------------------

  it('R7: setExecCwdRootId sets a root ID string', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.setExecCwdRootId('workspace');
    const config = store.getResourceConfig();

    expect(config.exec_cwd_root_id).toBe('workspace');
  });

  it('R8: setExecCwdRootId(null) resets to null (workspace default)', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.setExecCwdRootId('custom-root');
    store.setExecCwdRootId(null);
    const config = store.getResourceConfig();

    expect(config.exec_cwd_root_id).toBeNull();
  });

  // -------------------------------------------------------------------------
  // R9–R10: Secrets epoch
  // -------------------------------------------------------------------------

  it('R9: incrementSecretsEpoch starts at 0 and increments to 1', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    expect(store.getResourceConfig().secrets_epoch).toBe(0);

    store.incrementSecretsEpoch();

    expect(store.getResourceConfig().secrets_epoch).toBe(1);
  });

  it('R10: incrementSecretsEpoch is monotonically increasing across multiple calls', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.incrementSecretsEpoch();
    store.incrementSecretsEpoch();
    store.incrementSecretsEpoch();

    expect(store.getResourceConfig().secrets_epoch).toBe(3);
  });

  // -------------------------------------------------------------------------
  // R11–R12: Mutation independence
  // -------------------------------------------------------------------------

  it('R11: setFsRoots does not overwrite net_allowlist', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.setNetAllowlist(['api.example.com']);
    store.setFsRoots([ROOT_A]);
    const config = store.getResourceConfig();

    // Both mutations preserved.
    expect(config.fs_roots).toHaveLength(1);
    expect(config.net_allowlist).toHaveLength(1);
    expect(config.net_allowlist[0]).toBe('api.example.com');
  });

  it('R12: setNetAllowlist does not overwrite fs_roots', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.setFsRoots([ROOT_A, ROOT_B]);
    store.setNetAllowlist(['api.example.com']);
    const config = store.getResourceConfig();

    // Both mutations preserved.
    expect(config.fs_roots).toHaveLength(2);
    expect(config.net_allowlist).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // R13: Combined state
  // -------------------------------------------------------------------------

  it('R13: all fields persist together after sequential mutations', () => {
    const stateIO = new MemoryStateIO();
    const store = new ResourceConfigStore(stateIO);

    store.setFsRoots([ROOT_A]);
    store.setNetAllowlist(['api.example.com', '*.cdn.example.com']);
    store.setExecCwdRootId('workspace');
    store.incrementSecretsEpoch();
    store.incrementSecretsEpoch();

    const config = store.getResourceConfig();

    expect(config.fs_roots).toHaveLength(1);
    expect(config.fs_roots[0]).toEqual(ROOT_A);
    expect(config.net_allowlist).toHaveLength(2);
    expect(config.exec_cwd_root_id).toBe('workspace');
    expect(config.secrets_epoch).toBe(2);
  });
});
