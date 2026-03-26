/**
 * I6 Delegation Non-Escalation — Property Tests
 *
 * These tests prove I6 holds as a property, not just for specific cases.
 * They exercise checkDelegationNonEscalation() directly with generated
 * capability sets to verify the invariant:
 *
 *   For all delegation actions with delegated_capabilities D and
 *   enabled capability set E:
 *     D ⊆ E  ⇒  Permit  (null return)
 *     D ⊄ E  ⇒  Deny    ('I6_DELEGATION_ESCALATION' return)
 *
 * These are exhaustive over the capability taxonomy — every type in
 * CapabilityType is tested as both an enabled and a delegated type.
 *
 * v0.2 extensibility note: checkDelegationNonEscalation takes enabledCapSet
 * as a parameter, not hardcoded to the snapshot global. This means the same
 * function can be called with a per-agent C_eff(S, a_j) set when per-agent
 * capability scoping is introduced.
 *
 * @see docs/specs/formal_governance.md §9 (I6: delegation non-escalation)
 */

import { describe, it, expect } from 'vitest';
import { CapabilityType, RiskTier } from '../src/index.js';
import type { CapabilityInstance } from '../src/index.js';
import { checkDelegationNonEscalation } from '../src/validation/engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All capability types in the taxonomy. */
const ALL_CAPABILITY_TYPES = Object.values(CapabilityType);

/** Build an AgentSpawn action with given delegated_capabilities. */
function makeSpawnAction(delegatedCapabilities: unknown): CapabilityInstance {
  return {
    project_id: 'test-project',
    module_id: 'agent-module',
    capability_id: 'agent.spawn.default',
    type: CapabilityType.AgentSpawn,
    tier: RiskTier.T2,
    params: {
      delegated_capabilities: delegatedCapabilities,
    },
  };
}

// ---------------------------------------------------------------------------
// Property: D ⊆ E ⇒ Permit
// ---------------------------------------------------------------------------

describe('I6 property: delegation within bounds always permits', () => {
  it('permits when delegating a single type that is in the enabled set', () => {
    for (const capType of ALL_CAPABILITY_TYPES) {
      const enabled = new Set<string>([capType]);
      const action = makeSpawnAction([capType]);
      const result = checkDelegationNonEscalation(action, enabled);
      expect(result).toBeNull();
    }
  });

  it('permits when delegating all enabled types', () => {
    const enabled = new Set<string>(ALL_CAPABILITY_TYPES);
    const action = makeSpawnAction([...ALL_CAPABILITY_TYPES]);
    const result = checkDelegationNonEscalation(action, enabled);
    expect(result).toBeNull();
  });

  it('permits when delegating a strict subset of enabled types', () => {
    const enabled = new Set<string>(ALL_CAPABILITY_TYPES);
    // Delegate only the first half
    const subset = ALL_CAPABILITY_TYPES.slice(0, Math.floor(ALL_CAPABILITY_TYPES.length / 2));
    const action = makeSpawnAction(subset);
    const result = checkDelegationNonEscalation(action, enabled);
    expect(result).toBeNull();
  });

  it('permits empty delegation (no capabilities delegated)', () => {
    const enabled = new Set<string>([CapabilityType.FsRead]);
    const action = makeSpawnAction([]);
    const result = checkDelegationNonEscalation(action, enabled);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property: D ⊄ E ⇒ Deny
// ---------------------------------------------------------------------------

describe('I6 property: delegation exceeding bounds always denies', () => {
  it('denies when delegating any single type not in the enabled set', () => {
    for (const capType of ALL_CAPABILITY_TYPES) {
      // Enable everything EXCEPT this type
      const enabled = new Set<string>(ALL_CAPABILITY_TYPES.filter((t) => t !== capType));
      const action = makeSpawnAction([capType]);
      const result = checkDelegationNonEscalation(action, enabled);
      expect(result).toBe('I6_DELEGATION_ESCALATION');
    }
  });

  it('denies when any one of multiple delegated types is not enabled', () => {
    // Enable only FsRead
    const enabled = new Set<string>([CapabilityType.FsRead]);
    // Delegate FsRead + FsWrite (FsWrite not enabled)
    const action = makeSpawnAction([CapabilityType.FsRead, CapabilityType.FsWrite]);
    const result = checkDelegationNonEscalation(action, enabled);
    expect(result).toBe('I6_DELEGATION_ESCALATION');
  });

  it('denies when enabled set is empty but delegation is non-empty', () => {
    const enabled = new Set<string>();
    const action = makeSpawnAction([CapabilityType.FsRead]);
    const result = checkDelegationNonEscalation(action, enabled);
    expect(result).toBe('I6_DELEGATION_ESCALATION');
  });
});

// ---------------------------------------------------------------------------
// Property: missing/malformed delegated_capabilities ⇒ pass-through
// ---------------------------------------------------------------------------

describe('I6 property: missing or non-array delegated_capabilities passes', () => {
  it('passes when params has no delegated_capabilities key', () => {
    const action: CapabilityInstance = {
      project_id: 'test-project',
      module_id: 'agent-module',
      capability_id: 'agent.spawn.default',
      type: CapabilityType.AgentSpawn,
      tier: RiskTier.T2,
      params: {},
    };
    const result = checkDelegationNonEscalation(action, new Set());
    expect(result).toBeNull();
  });

  it('passes when delegated_capabilities is null', () => {
    const action = makeSpawnAction(null);
    const result = checkDelegationNonEscalation(action, new Set());
    expect(result).toBeNull();
  });

  it('passes when delegated_capabilities is a string (not array)', () => {
    const action = makeSpawnAction('fs.read');
    const result = checkDelegationNonEscalation(action, new Set());
    expect(result).toBeNull();
  });

  it('passes when delegated_capabilities is a number', () => {
    const action = makeSpawnAction(42);
    const result = checkDelegationNonEscalation(action, new Set());
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// v0.2 extensibility: enabledCapSet is injectable
// ---------------------------------------------------------------------------

describe('I6 extensibility: enabledCapSet parameter is injectable', () => {
  it('accepts an arbitrary Set<string> as the capability bound', () => {
    // This proves the function does not hardcode the snapshot's global set.
    // In v0.2, callers can pass a per-agent C_eff(S, a_j) set.
    const agentSpecificSet = new Set<string>([CapabilityType.FsRead]);
    const action = makeSpawnAction([CapabilityType.FsRead]);
    const result = checkDelegationNonEscalation(action, agentSpecificSet);
    expect(result).toBeNull();

    // Same agent set but exceeding delegation
    const action2 = makeSpawnAction([CapabilityType.FsRead, CapabilityType.FsWrite]);
    const result2 = checkDelegationNonEscalation(action2, agentSpecificSet);
    expect(result2).toBe('I6_DELEGATION_ESCALATION');
  });
});
