/**
 * Archon Kernel — I6 Delegation Non-Escalation Tests
 *
 * Verifies Invariant I6: an agent may not cause another agent to execute
 * capabilities it does not itself possess. Delegation does not expand authority.
 *
 * Test categories:
 * - I6/agent.spawn: spawn with delegated capabilities within/exceeding bounds
 * - I6/agent.delegation.grant: grant with delegated capabilities within/exceeding bounds
 * - I6/no-delegated-capabilities: actions without delegated_capabilities param pass I6
 * - I6/non-delegation-types: non-delegation action types skip I6 check entirely
 * - I6/invalid-param-types: non-array or non-string delegated_capabilities
 *
 * These tests are pure: no file I/O, no network, no clock dependency.
 */

import { describe, it, expect } from 'vitest';
import { ValidationEngine } from '../src/validation/engine.js';
import { SnapshotBuilder } from '../src/snapshot/builder.js';
import { DecisionOutcome, CapabilityType, RiskTier } from '../src/index.js';
import type { ModuleManifest, ModuleHash, CapabilityInstance } from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const builder = new SnapshotBuilder();
const engine = new ValidationEngine();

/** Module that declares agent.spawn and agent.delegation.grant capabilities. */
const AGENT_MODULE: ModuleManifest = {
  module_id: 'agent-module',
  module_name: 'Agent Module',
  version: '0.0.1',
  description: 'Module with agent coordination capabilities',
  author: 'test',
  license: 'Apache-2.0',
  hash: '' as ModuleHash,
  capability_descriptors: [
    {
      module_id: 'agent-module',
      capability_id: 'agent.spawn.default',
      type: CapabilityType.AgentSpawn,
      tier: RiskTier.T2,
      params_schema: {},
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'agent-module',
      capability_id: 'agent.delegation.grant.default',
      type: CapabilityType.AgentDelegationGrant,
      tier: RiskTier.T2,
      params_schema: {},
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'agent-module',
      capability_id: 'agent.fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params_schema: {},
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
  ],
  intrinsic_restrictions: [],
  hazard_declarations: [],
  suggested_profiles: [],
};

/** Build a snapshot with agent.spawn, agent.delegation.grant, and fs.read enabled. */
function buildTestSnapshot() {
  return builder.build(
    [AGENT_MODULE],
    [CapabilityType.AgentSpawn, CapabilityType.AgentDelegationGrant, CapabilityType.FsRead],
    [],
    '0.0.1',
    '',
    'test-project',
    () => '2026-01-01T00:00:00.000Z',
  );
}

// ---------------------------------------------------------------------------
// I6/agent.spawn
// ---------------------------------------------------------------------------

describe('I6: delegation non-escalation — agent.spawn', () => {
  it('permits spawn when delegated_capabilities are within enabled set', () => {
    const snapshot = buildTestSnapshot();
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.spawn.default',
      type: CapabilityType.AgentSpawn,
      tier: RiskTier.T2,
      params: {
        delegated_capabilities: [CapabilityType.FsRead],
      },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('denies spawn when delegated_capabilities exceed enabled set', () => {
    const snapshot = buildTestSnapshot();
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.spawn.default',
      type: CapabilityType.AgentSpawn,
      tier: RiskTier.T2,
      params: {
        delegated_capabilities: [CapabilityType.FsRead, CapabilityType.FsWrite],
      },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('I6_DELEGATION_ESCALATION');
  });

  it('denies spawn when a single delegated capability is not enabled', () => {
    const snapshot = buildTestSnapshot();
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.spawn.default',
      type: CapabilityType.AgentSpawn,
      tier: RiskTier.T2,
      params: {
        delegated_capabilities: [CapabilityType.ExecRun],
      },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('I6_DELEGATION_ESCALATION');
  });
});

// ---------------------------------------------------------------------------
// I6/agent.delegation.grant
// ---------------------------------------------------------------------------

describe('I6: delegation non-escalation — agent.delegation.grant', () => {
  it('permits grant when delegated_capabilities are within enabled set', () => {
    const snapshot = buildTestSnapshot();
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.delegation.grant.default',
      type: CapabilityType.AgentDelegationGrant,
      tier: RiskTier.T2,
      params: {
        delegated_capabilities: [CapabilityType.FsRead, CapabilityType.AgentSpawn],
      },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('denies grant when delegated_capabilities exceed enabled set', () => {
    const snapshot = buildTestSnapshot();
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.delegation.grant.default',
      type: CapabilityType.AgentDelegationGrant,
      tier: RiskTier.T2,
      params: {
        delegated_capabilities: [CapabilityType.NetEgressRaw],
      },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('I6_DELEGATION_ESCALATION');
  });
});

// ---------------------------------------------------------------------------
// I6/no-delegated-capabilities
// ---------------------------------------------------------------------------

describe('I6: delegation non-escalation — no delegated_capabilities param', () => {
  it('permits spawn without delegated_capabilities param (I6 check skipped)', () => {
    const snapshot = buildTestSnapshot();
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.spawn.default',
      type: CapabilityType.AgentSpawn,
      tier: RiskTier.T2,
      params: {},
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });

  it('permits delegation grant without delegated_capabilities param', () => {
    const snapshot = buildTestSnapshot();
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.delegation.grant.default',
      type: CapabilityType.AgentDelegationGrant,
      tier: RiskTier.T2,
      params: {},
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });
});

// ---------------------------------------------------------------------------
// I6/non-delegation-types
// ---------------------------------------------------------------------------

describe('I6: non-delegation types skip I6 check', () => {
  it('permits fs.read even if params contain delegated_capabilities', () => {
    const snapshot = buildTestSnapshot();
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: {
        path: '/tmp/test.txt',
        // This field is irrelevant for non-delegation types
        delegated_capabilities: [CapabilityType.ExecRun],
      },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });
});

// ---------------------------------------------------------------------------
// I6/invalid-param-types
// ---------------------------------------------------------------------------

describe('I6: invalid delegated_capabilities param types', () => {
  it('denies when delegated_capabilities contains a non-string element', () => {
    const snapshot = buildTestSnapshot();
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.spawn.default',
      type: CapabilityType.AgentSpawn,
      tier: RiskTier.T2,
      params: {
        delegated_capabilities: [42],
      },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('I6_DELEGATION_ESCALATION');
  });

  it('permits when delegated_capabilities is empty array (no escalation)', () => {
    const snapshot = buildTestSnapshot();
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.spawn.default',
      type: CapabilityType.AgentSpawn,
      tier: RiskTier.T2,
      params: {
        delegated_capabilities: [],
      },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
  });
});
