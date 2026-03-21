/**
 * Tests for the completion gate — the pure evaluation logic.
 *
 * Tests the core `evaluateCompletionGate()` function which classifies
 * staged files and determines whether a commit should be blocked.
 *
 * Does NOT test git hook integration (that requires manual reproduction).
 */

import { describe, it, expect } from 'vitest';
import { evaluateCompletionGate } from '../completion-gate.js';
import type { GateInput, PacketInfo } from '../completion-gate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePacket(id: string, started_at: string | null = '2026-03-20T00:00:00Z', status: string | null = null): PacketInfo {
  return { id, started_at, status };
}

function makeInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    stagedFiles: overrides.stagedFiles ?? [],
    packets: overrides.packets ?? [],
    completionIds: overrides.completionIds ?? new Set(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evaluateCompletionGate', () => {
  // CG-U1: No packets at all — always passes
  it('CG-U1: passes when no packets exist', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['packages/kernel/src/foo.ts'],
      packets: [],
    }));
    expect(result.blocked).toBe(false);
    expect(result.incompletePackets).toEqual([]);
  });

  // CG-U2: All packets have completions — passes
  it('CG-U2: passes when all started packets have completions', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['packages/kernel/src/foo.ts'],
      packets: [makePacket('s10'), makePacket('s11')],
      completionIds: new Set(['s10', 's11']),
    }));
    expect(result.blocked).toBe(false);
  });

  // CG-U3: Packet missing completion, only factory files staged — passes
  it('CG-U3: passes for factory-only commits even with incomplete packets', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: [
        'factory/packets/s12.json',
        'factory/completions/s10.json',
      ],
      packets: [makePacket('s10')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(false);
    expect(result.implementationFiles).toEqual([]);
  });

  // CG-U4: Packet missing completion, implementation files staged — BLOCKS
  it('CG-U4: blocks when incomplete packet exists and implementation files staged', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['packages/kernel/src/types/module.ts'],
      packets: [makePacket('s10')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(true);
    expect(result.incompletePackets).toContain('s10');
    expect(result.implementationFiles).toContain('packages/kernel/src/types/module.ts');
    expect(result.reason).toContain('FI-7');
    expect(result.reason).toContain('s10');
    expect(result.reason).toContain('factory:complete');
  });

  // CG-U5: Multiple incomplete packets — all listed
  it('CG-U5: lists all incomplete packets when blocking', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['packages/cli/src/commands/foo.ts'],
      packets: [makePacket('s10'), makePacket('s11'), makePacket('s12')],
      completionIds: new Set(['s10']),
    }));
    expect(result.blocked).toBe(true);
    expect(result.incompletePackets).toContain('s11');
    expect(result.incompletePackets).toContain('s12');
    expect(result.incompletePackets).not.toContain('s10');
  });

  // CG-U6: Not-started packets (no started_at) do not block
  it('CG-U6: ignores not-started packets (no started_at)', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['packages/kernel/src/foo.ts'],
      packets: [makePacket('s10', null)], // not started
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(false);
  });

  // CG-U7: Abandoned packets do not block
  it('CG-U7: ignores abandoned packets', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['packages/kernel/src/foo.ts'],
      packets: [makePacket('s10', '2026-03-20T00:00:00Z', 'abandoned')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(false);
  });

  // CG-U8: Deferred packets do not block
  it('CG-U8: ignores deferred packets', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['packages/kernel/src/foo.ts'],
      packets: [makePacket('s10', '2026-03-20T00:00:00Z', 'deferred')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(false);
  });

  // CG-U9: .githooks files are infrastructure, not implementation
  it('CG-U9: .githooks files do not count as implementation', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['.githooks/pre-commit'],
      packets: [makePacket('s10')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(false);
  });

  // CG-U10: .github files are infrastructure
  it('CG-U10: .github files do not count as implementation', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['.github/workflows/ci.yml'],
      packets: [makePacket('s10')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(false);
  });

  // CG-U11: tools/factory files are infrastructure
  it('CG-U11: tools/factory files do not count as implementation', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['tools/factory/status.ts'],
      packets: [makePacket('s10')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(false);
  });

  // CG-U12: Root config files are infrastructure
  it('CG-U12: root config files do not count as implementation', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['package.json', 'pnpm-lock.yaml', 'tsconfig.json'],
      packets: [makePacket('s10')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(false);
  });

  // CG-U13: Package-level package.json IS implementation
  it('CG-U13: package-level package.json counts as implementation', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: ['packages/cli/package.json'],
      packets: [makePacket('s10')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(true);
  });

  // CG-U14: Mixed factory + implementation — blocks on implementation
  it('CG-U14: mixed commit blocks if any implementation files present', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: [
        'factory/packets/s10.json',
        'packages/kernel/src/foo.ts',
      ],
      packets: [makePacket('s10')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(true);
    expect(result.implementationFiles).toEqual(['packages/kernel/src/foo.ts']);
  });

  // CG-U15: Implementation commit WITH completion staged — passes
  it('CG-U15: passes when implementation and completion are both staged', () => {
    // The completion exists on disk, so completionIds includes it
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: [
        'packages/kernel/src/foo.ts',
        'factory/completions/s10.json',
      ],
      packets: [makePacket('s10')],
      completionIds: new Set(['s10']),
    }));
    expect(result.blocked).toBe(false);
  });

  // CG-U16: Empty staged files — passes
  it('CG-U16: passes with no staged files', () => {
    const result = evaluateCompletionGate(makeInput({
      stagedFiles: [],
      packets: [makePacket('s10')],
      completionIds: new Set(),
    }));
    expect(result.blocked).toBe(false);
  });
});
