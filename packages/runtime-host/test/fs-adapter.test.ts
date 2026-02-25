/**
 * Archon Runtime Host — FsAdapter Layer 2 Enforcement Tests
 *
 * Verifies the realpath-based symlink escape prevention in FsAdapter
 * (Layer 2 enforcement, complementing the kernel's logical Layer 1 check).
 *
 *   FS-U1: path inside rw root is readable and writable
 *   FS-U2: path outside all roots is denied
 *   FS-U3: symlink inside root pointing outside is denied (realpath check)
 *   FS-U4: write to ro root is denied
 *   FS-U5: empty fsRoots skips enforcement (backward compat)
 *
 * Isolation: each test creates temp directories. No shared state.
 */

import { describe, it, expect } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { realpath } from 'node:fs/promises';
import type { AdapterCallContext, RuleSnapshotHash } from '@archon/kernel';
import { CapabilityType } from '@archon/kernel';
import { FsAdapter } from '../src/adapters/fs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReadContext(workspacePath: string): AdapterCallContext {
  return {
    agent_id: 'test-agent',
    capability_instance: {
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      params: {},
      project_id: 'test-project',
    },
    rs_hash: 'test-hash' as unknown as RuleSnapshotHash,
    resource_config: {
      fs_roots: [{ id: 'workspace', path: workspacePath, perm: 'rw' }],
      net_allowlist: [],
      exec_cwd_root_id: null,
      secrets_epoch: 0,
    },
  };
}

function makeWriteContext(workspacePath: string, perm: 'rw' | 'ro' = 'rw'): AdapterCallContext {
  return {
    agent_id: 'test-agent',
    capability_instance: {
      module_id: 'filesystem',
      capability_id: 'fs.write',
      type: CapabilityType.FsWrite,
      params: {},
      project_id: 'test-project',
    },
    rs_hash: 'test-hash' as unknown as RuleSnapshotHash,
    resource_config: {
      fs_roots: [{ id: 'workspace', path: workspacePath, perm }],
      net_allowlist: [],
      exec_cwd_root_id: null,
      secrets_epoch: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FsAdapter — Layer 2 realpath enforcement', () => {
  it('FS-U1: file inside rw root is readable and writable', async () => {
    const workspacePath = await realpath(mkdtempSync(`${tmpdir()}/archon-fs-u1-`));
    const adapter = new FsAdapter();
    const testFile = join(workspacePath, 'hello.txt');
    writeFileSync(testFile, 'hello world', 'utf-8');

    // Read
    const readCtx = makeReadContext(workspacePath);
    const bytes = await adapter.read(testFile, readCtx);
    const content = Buffer.from(bytes).toString('utf-8');
    expect(content).toBe('hello world');

    // Write
    const writeCtx = makeWriteContext(workspacePath);
    await adapter.write(join(workspacePath, 'new.txt'), new Uint8Array(Buffer.from('ok')), writeCtx);
  });

  it('FS-U2: path outside all roots is denied', async () => {
    const workspacePath = await realpath(mkdtempSync(`${tmpdir()}/archon-fs-u2-workspace-`));
    const outsideDir = await realpath(mkdtempSync(`${tmpdir()}/archon-fs-u2-outside-`));
    const outsideFile = join(outsideDir, 'outside.txt');
    writeFileSync(outsideFile, 'not accessible', 'utf-8');

    const adapter = new FsAdapter();
    const ctx = makeReadContext(workspacePath);

    await expect(adapter.read(outsideFile, ctx)).rejects.toThrow(/outside all declared/);
  });

  it('FS-U3: symlink inside root pointing to file outside root is denied', async () => {
    const workspacePath = await realpath(mkdtempSync(`${tmpdir()}/archon-fs-u3-workspace-`));
    const outsideDir = await realpath(mkdtempSync(`${tmpdir()}/archon-fs-u3-outside-`));

    // Create a real file outside the workspace
    const outsideFile = join(outsideDir, 'secret.txt');
    writeFileSync(outsideFile, 'sensitive-data', 'utf-8');

    // Create a symlink inside the workspace pointing to the outside file
    const symlinkPath = join(workspacePath, 'link-to-outside');
    symlinkSync(outsideFile, symlinkPath);

    const adapter = new FsAdapter();
    const ctx = makeReadContext(workspacePath);

    // realpath resolves the symlink → outside → denied by assertWithinFsRoots
    await expect(adapter.read(symlinkPath, ctx)).rejects.toThrow(/outside all declared/);
  });

  it('FS-U4: write to ro root is denied', async () => {
    const workspacePath = await realpath(mkdtempSync(`${tmpdir()}/archon-fs-u4-`));
    const adapter = new FsAdapter();
    const ctx = makeWriteContext(workspacePath, 'ro');

    await expect(
      adapter.write(
        join(workspacePath, 'attempt.txt'),
        new Uint8Array(Buffer.from('blocked')),
        ctx,
      ),
    ).rejects.toThrow(/read-only/);
  });

  it('FS-U5: empty fsRoots skips enforcement (backward compat — allows any path)', async () => {
    const workspacePath = await realpath(mkdtempSync(`${tmpdir()}/archon-fs-u5-`));
    const testFile = join(workspacePath, 'file.txt');
    writeFileSync(testFile, 'accessible', 'utf-8');

    const adapter = new FsAdapter();

    // No roots declared — enforcement is skipped
    const ctx: AdapterCallContext = {
      agent_id: 'test-agent',
      capability_instance: {
        module_id: 'filesystem',
        capability_id: 'fs.read',
        type: CapabilityType.FsRead,
        params: {},
        project_id: 'test-project',
      },
      rs_hash: 'test-hash' as unknown as RuleSnapshotHash,
      resource_config: {
        fs_roots: [],        // empty — no enforcement
        net_allowlist: [],
        exec_cwd_root_id: null,
        secrets_epoch: 0,
      },
    };

    // Should succeed — no roots means no restriction
    const bytes = await adapter.read(testFile, ctx);
    expect(Buffer.from(bytes).toString('utf-8')).toBe('accessible');
  });
});
