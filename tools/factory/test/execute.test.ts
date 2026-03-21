/**
 * Tests for factory execute — the stateless action resolver.
 *
 * Tests the pure `resolveExecuteAction()` function which reads
 * feature + packet + completion state and determines what to spawn.
 */

import { describe, it, expect } from 'vitest';
import { resolveExecuteAction } from '../execute.js';
import type { Feature, ExecuteInput } from '../execute.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: overrides.id ?? 'test-feature',
    intent: overrides.intent ?? 'Test feature',
    status: overrides.status ?? 'approved',
    packets: overrides.packets ?? [],
    created_by: overrides.created_by ?? { kind: 'human', id: 'operator' },
    approved_at: overrides.approved_at ?? '2026-03-21T00:00:00Z',
  };
}

function makePacket(id: string, deps: string[] = [], started_at: string | null = null) {
  return {
    id,
    title: `Packet ${id}`,
    change_class: 'local' as const,
    dependencies: deps,
    started_at,
  };
}

function makeInput(overrides: Partial<ExecuteInput> = {}): ExecuteInput {
  return {
    feature: overrides.feature ?? makeFeature(),
    packets: overrides.packets ?? [],
    completionIds: overrides.completionIds ?? new Set(),
    acceptanceIds: overrides.acceptanceIds ?? new Set(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveExecuteAction', () => {
  // EX-U1: Feature not approved — cannot execute
  it('EX-U1: rejects feature in draft status', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ status: 'draft', packets: ['p1'] }),
    }));
    expect(action.kind).toBe('not_approved');
    expect(action.message).toContain('draft');
  });

  // EX-U2: Empty feature — all complete immediately
  it('EX-U2: empty feature is immediately all_complete', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: [] }),
    }));
    expect(action.kind).toBe('all_complete');
  });

  // EX-U3: Single packet, no deps, not started — ready to spawn
  it('EX-U3: single ready packet produces spawn_packets', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1'] }),
      packets: [makePacket('p1')],
    }));
    expect(action.kind).toBe('spawn_packets');
    expect(action.ready_packets).toEqual(['p1']);
  });

  // EX-U4: Single packet completed — all complete
  it('EX-U4: all packets completed produces all_complete', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1'] }),
      packets: [makePacket('p1')],
      completionIds: new Set(['p1']),
    }));
    expect(action.kind).toBe('all_complete');
    expect(action.completed_packets).toEqual(['p1']);
  });

  // EX-U5: Two independent packets — both ready
  it('EX-U5: independent packets are all ready for parallel spawn', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1', 'p2'] }),
      packets: [makePacket('p1'), makePacket('p2')],
    }));
    expect(action.kind).toBe('spawn_packets');
    expect(action.ready_packets).toEqual(['p1', 'p2']);
  });

  // EX-U6: Sequential deps — only first is ready
  it('EX-U6: dependent packet is blocked until dependency completes', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1', 'p2'] }),
      packets: [makePacket('p1'), makePacket('p2', ['p1'])],
    }));
    expect(action.kind).toBe('spawn_packets');
    expect(action.ready_packets).toEqual(['p1']);
    expect(action.blocked_packets).toHaveLength(1);
    expect(action.blocked_packets[0]!.id).toBe('p2');
    expect(action.blocked_packets[0]!.blocked_by).toContain('p1');
  });

  // EX-U7: First dep completed — second becomes ready
  it('EX-U7: completing dependency unblocks dependent packet', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1', 'p2'] }),
      packets: [makePacket('p1'), makePacket('p2', ['p1'])],
      completionIds: new Set(['p1']),
    }));
    expect(action.kind).toBe('spawn_packets');
    expect(action.ready_packets).toEqual(['p2']);
    expect(action.completed_packets).toEqual(['p1']);
  });

  // EX-U8: Diamond dependency graph — correct parallelism
  it('EX-U8: diamond graph resolves parallelism correctly', () => {
    //   p1
    //  / \
    // p2  p3
    //  \ /
    //   p4
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1', 'p2', 'p3', 'p4'] }),
      packets: [
        makePacket('p1'),
        makePacket('p2', ['p1']),
        makePacket('p3', ['p1']),
        makePacket('p4', ['p2', 'p3']),
      ],
    }));
    expect(action.ready_packets).toEqual(['p1']);

    // After p1 completes
    const action2 = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1', 'p2', 'p3', 'p4'] }),
      packets: [
        makePacket('p1'),
        makePacket('p2', ['p1']),
        makePacket('p3', ['p1']),
        makePacket('p4', ['p2', 'p3']),
      ],
      completionIds: new Set(['p1']),
    }));
    expect(action2.ready_packets).toEqual(['p2', 'p3']);
    expect(action2.blocked_packets).toHaveLength(1);
    expect(action2.blocked_packets[0]!.id).toBe('p4');

    // After p2 and p3 complete
    const action3 = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1', 'p2', 'p3', 'p4'] }),
      packets: [
        makePacket('p1'),
        makePacket('p2', ['p1']),
        makePacket('p3', ['p1']),
        makePacket('p4', ['p2', 'p3']),
      ],
      completionIds: new Set(['p1', 'p2', 'p3']),
    }));
    expect(action3.ready_packets).toEqual(['p4']);
  });

  // EX-U9: In-progress packet — reported correctly
  it('EX-U9: in-progress packet is reported as in_progress', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1'] }),
      packets: [makePacket('p1', [], '2026-03-21T00:00:00Z')],
    }));
    expect(action.kind).toBe('spawn_packets');
    expect(action.in_progress_packets).toEqual(['p1']);
    expect(action.ready_packets).toEqual([]);
  });

  // EX-U10: All blocked, nothing in progress — blocked state
  it('EX-U10: all packets blocked produces blocked action', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1'] }),
      packets: [makePacket('p1', ['external-dep'])],
    }));
    expect(action.kind).toBe('blocked');
    expect(action.blocked_packets).toHaveLength(1);
  });

  // EX-U11: Feature in executing status — allowed
  it('EX-U11: executing status is allowed', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ status: 'executing', packets: ['p1'] }),
      packets: [makePacket('p1')],
    }));
    expect(action.kind).toBe('spawn_packets');
  });

  // EX-U12: Feature in completed status — not allowed
  it('EX-U12: completed status is not allowed for execution', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ status: 'completed', packets: ['p1'] }),
    }));
    expect(action.kind).toBe('not_approved');
  });

  // EX-U13: Progress message includes counts
  it('EX-U13: message includes progress counts', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ packets: ['p1', 'p2', 'p3'] }),
      packets: [makePacket('p1'), makePacket('p2'), makePacket('p3', ['p1', 'p2'])],
      completionIds: new Set(['p1']),
    }));
    expect(action.message).toContain('1/3');
    expect(action.ready_packets).toEqual(['p2']);
  });

  // EX-U14: All complete message suggests QA report
  it('EX-U14: all_complete message suggests QA report', () => {
    const action = resolveExecuteAction(makeInput({
      feature: makeFeature({ id: 'my-feature', packets: ['p1'] }),
      packets: [makePacket('p1')],
      completionIds: new Set(['p1']),
    }));
    expect(action.message).toContain('factory:report my-feature');
  });
});
