/**
 * Kernel P5 Resource Scoping Tests
 *
 * Verifies that ValidationEngine.evaluate() correctly enforces per-project
 * resource configuration constraints (P5: Resource Scoping Hardening).
 *
 * Invariants exercised:
 *   I1 (resource level): FS root boundaries, net allowlist, exec CWD
 *   I4: resource_config is included in snapshot hash (changes → different RS_hash)
 *
 * These tests are pure (no I/O) and deterministic.
 *
 * @see docs/specs/formal_governance.md §5 (I1, I4)
 * @see docs/specs/architecture.md §P5 (resource scoping)
 */

import { describe, it, expect } from 'vitest';
import { ValidationEngine } from '../src/validation/engine.js';
import { SnapshotBuilder } from '../src/snapshot/builder.js';
import { DecisionOutcome, CapabilityType, RiskTier, EMPTY_RESOURCE_CONFIG } from '../src/index.js';
import type { ModuleManifest, ModuleHash, CapabilityInstance, ResourceConfig } from '../src/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXED_CLOCK = () => '2026-01-01T00:00:00.000Z';
const TEST_PROJECT = 'test-project';
const ENGINE_VERSION = '0.0.1';

// ---------------------------------------------------------------------------
// Test manifest — includes all capability types exercised in this file
// ---------------------------------------------------------------------------

/**
 * A test module manifest declaring one capability of each type used in tests.
 * All capabilities are enabled in the snapshots constructed below.
 */
const TEST_MANIFEST: ModuleManifest = {
  module_id: 'test-module',
  version: '0.0.1',
  hash: '' as ModuleHash,
  capability_descriptors: [
    {
      module_id: 'test-module',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params_schema: { path: 'string' },
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'test-module',
      capability_id: 'fs.write',
      type: CapabilityType.FsWrite,
      tier: RiskTier.T2,
      params_schema: { path: 'string' },
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'test-module',
      capability_id: 'net.fetch.http',
      type: CapabilityType.NetFetchHttp,
      tier: RiskTier.T1,
      params_schema: { url: 'string' },
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'test-module',
      capability_id: 'exec.run',
      type: CapabilityType.ExecRun,
      tier: RiskTier.T3,
      params_schema: { command: 'string' },
      ack_required: true,
      default_enabled: false,
      hazards: [],
    },
  ],
};

// All capabilities declared in TEST_MANIFEST, all enabled.
const ALL_CAPABILITIES: ReadonlyArray<CapabilityType> = [
  CapabilityType.FsRead,
  CapabilityType.FsWrite,
  CapabilityType.NetFetchHttp,
  CapabilityType.ExecRun,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const engine = new ValidationEngine();
const builder = new SnapshotBuilder();

/**
 * Build a minimal snapshot with the given resource config.
 * All four capability types are enabled (capability-level I1 not the concern here).
 */
function buildSnapshotWithConfig(resourceConfig: ResourceConfig) {
  return builder.build(
    [TEST_MANIFEST],
    ALL_CAPABILITIES,
    [],
    ENGINE_VERSION,
    '',
    TEST_PROJECT,
    FIXED_CLOCK,
    0,
    resourceConfig,
  );
}

// ---------------------------------------------------------------------------
// Reusable action fixtures
// ---------------------------------------------------------------------------

const FS_READ: CapabilityInstance = {
  project_id: TEST_PROJECT,
  module_id: 'test-module',
  capability_id: 'fs.read',
  type: CapabilityType.FsRead,
  tier: RiskTier.T1,
  params: { path: '/workspace/file.txt' },
};

const FS_WRITE: CapabilityInstance = {
  project_id: TEST_PROJECT,
  module_id: 'test-module',
  capability_id: 'fs.write',
  type: CapabilityType.FsWrite,
  tier: RiskTier.T2,
  params: { path: '/workspace/output.txt' },
};

const NET_FETCH: CapabilityInstance = {
  project_id: TEST_PROJECT,
  module_id: 'test-module',
  capability_id: 'net.fetch.http',
  type: CapabilityType.NetFetchHttp,
  tier: RiskTier.T1,
  params: { url: 'https://api.example.com/data' },
};

const EXEC_RUN: CapabilityInstance = {
  project_id: TEST_PROJECT,
  module_id: 'test-module',
  capability_id: 'exec.run',
  type: CapabilityType.ExecRun,
  tier: RiskTier.T3,
  params: { command: 'ls' },
};

// ---------------------------------------------------------------------------
// I1: FS Root Enforcement
// ---------------------------------------------------------------------------

describe('P5: I1 — FS root boundary enforcement', () => {
  it('empty fs_roots → FS actions skip root check (backward compat)', () => {
    // Pre-P5 projects have EMPTY_RESOURCE_CONFIG; no roots = no FS boundary check.
    const snapshot = buildSnapshotWithConfig(EMPTY_RESOURCE_CONFIG);
    const result = engine.evaluate(FS_READ, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('path inside rw root → permit read', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'workspace', path: '/workspace', perm: 'rw' }],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(FS_READ, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
    expect(result.triggered_rules).toHaveLength(0);
  });

  it('path inside rw root → permit write', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'workspace', path: '/workspace', perm: 'rw' }],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(FS_WRITE, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('path outside all roots → deny (fs_path_outside_roots)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'workspace', path: '/workspace', perm: 'rw' }],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const action: CapabilityInstance = { ...FS_READ, params: { path: '/etc/passwd' } };
    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('fs_path_outside_roots');
  });

  it('path traversal attempt outside root → deny (fs_path_outside_roots)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'workspace', path: '/workspace', perm: 'rw' }],
    };
    const snapshot = buildSnapshotWithConfig(config);
    // /workspace/../etc/passwd normalizes to /etc/passwd → outside root
    const action: CapabilityInstance = {
      ...FS_READ,
      params: { path: '/workspace/../etc/passwd' },
    };
    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('fs_path_outside_roots');
  });

  it('path inside ro root → permit read', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'data', path: '/workspace', perm: 'ro' }],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(FS_READ, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('fs.write inside ro root → deny (fs_write_to_readonly_root)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'data', path: '/workspace', perm: 'ro' }],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(FS_WRITE, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('fs_write_to_readonly_root');
  });

  it('missing path param → deny (fs_path_missing)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'workspace', path: '/workspace', perm: 'rw' }],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const action: CapabilityInstance = { ...FS_READ, params: {} };
    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('fs_path_missing');
  });

  it('path exactly equal to root path → permit (boundary case)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'workspace', path: '/workspace', perm: 'ro' }],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const action: CapabilityInstance = { ...FS_READ, params: { path: '/workspace' } };
    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('multiple roots: path matches one → permit', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [
        { id: 'data', path: '/data', perm: 'ro' },
        { id: 'workspace', path: '/workspace', perm: 'rw' },
      ],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(FS_READ, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });
});

// ---------------------------------------------------------------------------
// I1: Net Allowlist Enforcement
// ---------------------------------------------------------------------------

describe('P5: I1 — Net allowlist enforcement', () => {
  it('empty allowlist → deny all net.* actions (net_no_allowlist)', () => {
    // EMPTY_RESOURCE_CONFIG.net_allowlist is []; deny all is the spec default.
    const snapshot = buildSnapshotWithConfig(EMPTY_RESOURCE_CONFIG);
    const result = engine.evaluate(NET_FETCH, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('net_no_allowlist');
  });

  it('hostname exactly in allowlist → permit', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      net_allowlist: ['api.example.com'],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(NET_FETCH, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('hostname not in allowlist → deny (net_host_not_allowlisted)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      net_allowlist: ['other.example.com'],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(NET_FETCH, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('net_host_not_allowlisted');
  });

  it('wildcard *.example.com matches api.example.com (subdomain)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      net_allowlist: ['*.example.com'],
    };
    const snapshot = buildSnapshotWithConfig(config);
    // NET_FETCH has url: 'https://api.example.com/data'
    const result = engine.evaluate(NET_FETCH, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('wildcard *.example.com does NOT match apex example.com', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      net_allowlist: ['*.example.com'],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const apexAction: CapabilityInstance = {
      ...NET_FETCH,
      params: { url: 'https://example.com/data' },
    };
    const result = engine.evaluate(apexAction, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('net_host_not_allowlisted');
  });

  it('wildcard *.example.com matches deep subdomain a.b.example.com', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      net_allowlist: ['*.example.com'],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const deepAction: CapabilityInstance = {
      ...NET_FETCH,
      params: { url: 'https://a.b.example.com/path' },
    };
    const result = engine.evaluate(deepAction, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('invalid URL → deny (net_invalid_url)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      net_allowlist: ['api.example.com'],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const badAction: CapabilityInstance = {
      ...NET_FETCH,
      params: { url: 'not-a-valid-url' },
    };
    const result = engine.evaluate(badAction, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('net_invalid_url');
  });

  it('missing url and host params → deny (net_host_missing)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      net_allowlist: ['api.example.com'],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const noHostAction: CapabilityInstance = {
      ...NET_FETCH,
      params: {},
    };
    const result = engine.evaluate(noHostAction, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('net_host_missing');
  });
});

// ---------------------------------------------------------------------------
// I1: Exec CWD Enforcement
// ---------------------------------------------------------------------------

describe('P5: I1 — Exec CWD enforcement', () => {
  it('empty fs_roots → exec actions skip CWD check (backward compat)', () => {
    // Pre-P5 projects have no roots; no CWD enforcement applies.
    const snapshot = buildSnapshotWithConfig(EMPTY_RESOURCE_CONFIG);
    const result = engine.evaluate(EXEC_RUN, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('workspace root present, exec_cwd_root_id null → permit (workspace default CWD)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'workspace', path: '/workspace', perm: 'rw' }],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(EXEC_RUN, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('non-workspace roots only, exec_cwd_root_id null → deny (exec_no_cwd_configured)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      // root id 'data', not 'workspace' — no workspace fallback
      fs_roots: [{ id: 'data', path: '/data', perm: 'ro' }],
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(EXEC_RUN, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('exec_no_cwd_configured');
  });

  it('explicit exec_cwd_root_id exists in fs_roots → permit', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'scripts', path: '/scripts', perm: 'rw' }],
      exec_cwd_root_id: 'scripts',
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(EXEC_RUN, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('explicit exec_cwd_root_id not in fs_roots → deny (exec_cwd_root_not_found)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'workspace', path: '/workspace', perm: 'rw' }],
      exec_cwd_root_id: 'nonexistent',
    };
    const snapshot = buildSnapshotWithConfig(config);
    const result = engine.evaluate(EXEC_RUN, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('exec_cwd_root_not_found');
  });
});

// ---------------------------------------------------------------------------
// I4: Resource config included in snapshot hash
// ---------------------------------------------------------------------------

describe('P5: I4 — resource_config changes → different RS_hash', () => {
  it('same resource config → same hash (determinism)', () => {
    const config: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'workspace', path: '/workspace', perm: 'rw' }],
    };
    const s1 = buildSnapshotWithConfig(config);
    const s2 = buildSnapshotWithConfig(config);
    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });

  it('adding fs_root changes hash', () => {
    const s1 = buildSnapshotWithConfig(EMPTY_RESOURCE_CONFIG);
    const config2: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [{ id: 'workspace', path: '/workspace', perm: 'rw' }],
    };
    const s2 = buildSnapshotWithConfig(config2);
    expect(builder.hash(s1)).not.toBe(builder.hash(s2));
  });

  it('adding net_allowlist entry changes hash', () => {
    const s1 = buildSnapshotWithConfig(EMPTY_RESOURCE_CONFIG);
    const config2: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      net_allowlist: ['api.example.com'],
    };
    const s2 = buildSnapshotWithConfig(config2);
    expect(builder.hash(s1)).not.toBe(builder.hash(s2));
  });

  it('incrementing secrets_epoch changes hash', () => {
    const s1 = buildSnapshotWithConfig(EMPTY_RESOURCE_CONFIG);
    const config2: ResourceConfig = { ...EMPTY_RESOURCE_CONFIG, secrets_epoch: 1 };
    const s2 = buildSnapshotWithConfig(config2);
    expect(builder.hash(s1)).not.toBe(builder.hash(s2));
  });

  it('fs_roots canonical ordering: different insertion order → same hash', () => {
    const rootA = { id: 'a', path: '/a', perm: 'rw' } as const;
    const rootB = { id: 'b', path: '/b', perm: 'ro' } as const;
    const config1: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [rootA, rootB],
    };
    const config2: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      fs_roots: [rootB, rootA],
    };
    // Builder sorts roots by id before hashing.
    const s1 = buildSnapshotWithConfig(config1);
    const s2 = buildSnapshotWithConfig(config2);
    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });

  it('net_allowlist canonical ordering: different insertion order → same hash', () => {
    const config1: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      net_allowlist: ['api.example.com', 'data.example.com'],
    };
    const config2: ResourceConfig = {
      ...EMPTY_RESOURCE_CONFIG,
      net_allowlist: ['data.example.com', 'api.example.com'],
    };
    // Builder sorts allowlist alphabetically before hashing.
    const s1 = buildSnapshotWithConfig(config1);
    const s2 = buildSnapshotWithConfig(config2);
    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });
});
