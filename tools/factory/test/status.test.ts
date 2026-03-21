/**
 * Tests for factory status derivation — the pure logic.
 *
 * Tests the `deriveFactoryStatus()` function which reconstructs
 * workflow state from factory artifacts and determines the next action.
 */

import { describe, it, expect } from 'vitest';
import { deriveFactoryStatus } from '../status.js';
import type { StatusInput } from '../status.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePacket(
  id: string,
  overrides: Partial<{
    title: string;
    change_class: string;
    started_at: string | null;
    dependencies: string[];
  }> = {},
) {
  return {
    id,
    title: overrides.title ?? `Packet ${id}`,
    change_class: overrides.change_class ?? 'local',
    started_at: overrides.started_at !== undefined ? overrides.started_at : '2026-03-20T00:00:00Z',
    dependencies: overrides.dependencies ?? [],
  };
}

function makeCompletion(packetId: string, allPass = true) {
  return {
    packet_id: packetId,
    verification: {
      tests_pass: allPass,
      build_pass: allPass,
      lint_pass: allPass,
      ci_pass: allPass,
    },
  };
}

function makeAcceptance(packetId: string) {
  return { packet_id: packetId };
}

function makeInput(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    packets: overrides.packets ?? [],
    completions: overrides.completions ?? [],
    acceptances: overrides.acceptances ?? [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveFactoryStatus', () => {
  // FS-U1: No packets at all — all clear
  it('FS-U1: all clear with no packets', () => {
    const status = deriveFactoryStatus(makeInput());
    expect(status.summary.total).toBe(0);
    expect(status.next_action.kind).toBe('all_clear');
    expect(status.incomplete).toEqual([]);
  });

  // FS-U2: All packets accepted — all clear
  it('FS-U2: all clear when all packets are accepted', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [makePacket('s1'), makePacket('s2')],
      completions: [makeCompletion('s1'), makeCompletion('s2')],
    }));
    expect(status.summary.accepted).toBe(2);
    expect(status.next_action.kind).toBe('all_clear');
  });

  // FS-U3: Packet missing completion — next action is complete_packet
  it('FS-U3: incomplete packet produces complete_packet next action', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [makePacket('s1'), makePacket('s2')],
      completions: [makeCompletion('s1')],
    }));
    expect(status.incomplete).toHaveLength(1);
    expect(status.incomplete[0]!.id).toBe('s2');
    expect(status.next_action.kind).toBe('complete_packet');
    expect(status.next_action.packet_id).toBe('s2');
    expect(status.next_action.command).toContain('factory:complete s2');
  });

  // FS-U4: Architectural packet needs human acceptance
  it('FS-U4: architectural packet awaiting human acceptance', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [makePacket('s1', { change_class: 'architectural' })],
      completions: [makeCompletion('s1')],
    }));
    expect(status.awaiting_acceptance).toHaveLength(1);
    expect(status.next_action.kind).toBe('accept_packet');
    expect(status.next_action.packet_id).toBe('s1');
  });

  // FS-U5: Cross-cutting auto-accepts with audit flag
  it('FS-U5: cross-cutting with passing verification is accepted with audit flag', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [makePacket('s1', { change_class: 'cross_cutting' })],
      completions: [makeCompletion('s1')],
    }));
    expect(status.summary.accepted).toBe(1);
    expect(status.audit_pending).toHaveLength(1);
    expect(status.audit_pending[0]!.id).toBe('s1');
    // Audit pending is non-blocking — next action should be all_clear
    expect(status.next_action.kind).toBe('all_clear');
  });

  // FS-U6: Cross-cutting with human acceptance clears audit flag
  it('FS-U6: cross-cutting with human acceptance clears audit', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [makePacket('s1', { change_class: 'cross_cutting' })],
      completions: [makeCompletion('s1')],
      acceptances: [makeAcceptance('s1')],
    }));
    expect(status.audit_pending).toHaveLength(0);
    expect(status.next_action.kind).toBe('all_clear');
  });

  // FS-U7: Not-started packets are not incomplete
  it('FS-U7: not-started packets are not listed as incomplete', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [makePacket('s1', { started_at: null })],
    }));
    expect(status.incomplete).toHaveLength(0);
    expect(status.summary.not_started).toBe(1);
  });

  // FS-U8: Multiple incomplete — oldest first
  it('FS-U8: oldest incomplete packet is recommended first', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [
        makePacket('s2', { started_at: '2026-03-20T02:00:00Z' }),
        makePacket('s1', { started_at: '2026-03-20T01:00:00Z' }),
      ],
    }));
    expect(status.next_action.packet_id).toBe('s1');
  });

  // FS-U9: Incomplete prioritized over awaiting acceptance
  it('FS-U9: incomplete packet takes priority over acceptance debt', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [
        makePacket('s1', { change_class: 'architectural' }),
        makePacket('s2'),
      ],
      completions: [makeCompletion('s1')],
    }));
    expect(status.next_action.kind).toBe('complete_packet');
    expect(status.next_action.packet_id).toBe('s2');
  });

  // FS-U10: Verification failure means not auto-accepted
  it('FS-U10: failing verification prevents auto-acceptance for local', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [makePacket('s1')],
      completions: [makeCompletion('s1', false)],
    }));
    expect(status.summary.completed).toBe(1);
    expect(status.summary.accepted).toBe(0);
  });

  // FS-U11: Summary counts are correct across mixed states
  it('FS-U11: summary counts across mixed states', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [
        makePacket('p1', { started_at: null }),        // not_started
        makePacket('p2'),                                // in_progress (no completion)
        makePacket('p3', { change_class: 'architectural' }), // completed (no acceptance)
        makePacket('p4'),                                // accepted (auto)
      ],
      completions: [makeCompletion('p3'), makeCompletion('p4')],
    }));
    expect(status.summary.not_started).toBe(1);
    expect(status.summary.in_progress).toBe(1);
    expect(status.summary.completed).toBe(1);
    expect(status.summary.accepted).toBe(1);
    expect(status.summary.total).toBe(4);
  });

  // FS-U12: Command includes packet ID
  it('FS-U12: next action command includes correct packet ID', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [makePacket('s14-some-work')],
    }));
    expect(status.next_action.command).toBe('pnpm factory:complete s14-some-work');
  });

  // FS-U13: Feature filter scopes to feature packets
  it('FS-U13: feature filter scopes status to feature packets only', () => {
    const status = deriveFactoryStatus({
      packets: [makePacket('p1'), makePacket('p2'), makePacket('p3')],
      completions: [makeCompletion('p1')],
      acceptances: [],
      featureFilter: 'my-feature',
      features: [{ id: 'my-feature', intent: 'test', status: 'approved', packets: ['p1', 'p2'] }],
    });
    // Should only see p1 and p2, not p3
    expect(status.summary.total).toBe(2);
    expect(status.feature_filter).toBe('my-feature');
  });

  // FS-U14: No feature filter shows all packets
  it('FS-U14: no feature filter shows all packets', () => {
    const status = deriveFactoryStatus(makeInput({
      packets: [makePacket('p1'), makePacket('p2')],
    }));
    expect(status.summary.total).toBe(2);
    expect(status.feature_filter).toBeNull();
  });
});
