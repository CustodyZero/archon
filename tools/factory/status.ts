#!/usr/bin/env tsx
/**
 * Archon Factory — Status & Next Action
 *
 * Reconstructs workflow state from factory artifacts on disk.
 * Designed for session reconstruction: when context is lost (new session,
 * context compaction), this command tells the agent or operator exactly
 * where things stand and what to do next.
 *
 * This is NOT a planner. It reads artifacts and applies deterministic
 * derivation rules to produce a structured status report.
 *
 * Usage:
 *   pnpm factory:status              # human-readable report
 *   pnpm factory:status -- --json    # machine-readable JSON
 *
 * @see factory/README.md (Factory Lifecycle)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types (exported for testing)
// ---------------------------------------------------------------------------

export type PacketLifecycleStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'accepted'
  | 'environment_pending';

export interface PacketSummary {
  readonly id: string;
  readonly title: string;
  readonly change_class: string;
  readonly status: PacketLifecycleStatus;
  readonly has_completion: boolean;
  readonly has_acceptance: boolean;
  readonly audit_pending: boolean;
  readonly dependencies: ReadonlyArray<string>;
  readonly unmet_dependencies: ReadonlyArray<string>;
  readonly started_at: string | null;
}

export type NextActionKind =
  | 'complete_packet'
  | 'accept_packet'
  | 'resolve_dependency'
  | 'no_active_work'
  | 'all_clear';

export interface NextAction {
  readonly kind: NextActionKind;
  readonly packet_id: string | null;
  readonly message: string;
  readonly command: string | null;
}

export interface FactoryStatus {
  readonly feature_filter: string | null;
  readonly summary: {
    readonly total: number;
    readonly accepted: number;
    readonly completed: number;
    readonly in_progress: number;
    readonly not_started: number;
    readonly audit_pending: number;
  };
  readonly incomplete: ReadonlyArray<PacketSummary>;
  readonly awaiting_acceptance: ReadonlyArray<PacketSummary>;
  readonly audit_pending: ReadonlyArray<PacketSummary>;
  readonly blocked: ReadonlyArray<PacketSummary>;
  readonly next_action: NextAction;
}

// ---------------------------------------------------------------------------
// Artifact reading
// ---------------------------------------------------------------------------

interface RawPacket {
  readonly id: string;
  readonly title: string;
  readonly change_class: string;
  readonly started_at?: string | null;
  readonly status?: string | null;
  readonly dependencies?: ReadonlyArray<string>;
  readonly environment_dependencies?: ReadonlyArray<string>;
}

interface RawCompletion {
  readonly packet_id: string;
  readonly verification: {
    readonly tests_pass: boolean;
    readonly build_pass: boolean;
    readonly lint_pass: boolean;
    readonly ci_pass: boolean;
  };
}

interface RawAcceptance {
  readonly packet_id: string;
}

function readJsonDir<T>(factoryRoot: string, subdir: string): T[] {
  const dir = join(factoryRoot, subdir);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf-8')) as T;
      } catch {
        return null;
      }
    })
    .filter((x): x is T => x !== null);
}

// ---------------------------------------------------------------------------
// Derivation (pure, testable)
// ---------------------------------------------------------------------------

export interface RawFeature {
  readonly id: string;
  readonly intent: string;
  readonly status: string;
  readonly packets: ReadonlyArray<string>;
}

export interface StatusInput {
  readonly packets: ReadonlyArray<RawPacket>;
  readonly completions: ReadonlyArray<RawCompletion>;
  readonly acceptances: ReadonlyArray<RawAcceptance>;
  readonly featureFilter?: string | undefined;
  readonly features?: ReadonlyArray<RawFeature> | undefined;
}

function verificationPasses(v: RawCompletion['verification']): boolean {
  return v.tests_pass && v.build_pass && v.lint_pass && v.ci_pass;
}

function derivePacketLifecycle(
  packet: RawPacket,
  completionMap: ReadonlyMap<string, RawCompletion>,
  acceptanceIds: ReadonlySet<string>,
): PacketLifecycleStatus {
  const completion = completionMap.get(packet.id);
  const hasAcceptance = acceptanceIds.has(packet.id);

  if (completion === undefined) {
    return packet.started_at != null ? 'in_progress' : 'not_started';
  }

  if (hasAcceptance) return 'accepted';

  // Auto-acceptance rules
  const cc = packet.change_class;
  if ((cc === 'trivial' || cc === 'local' || cc === 'cross_cutting') && verificationPasses(completion.verification)) {
    return 'accepted';
  }

  return 'completed';
}

export function deriveFactoryStatus(input: StatusInput): FactoryStatus {
  const completionMap = new Map<string, RawCompletion>();
  for (const c of input.completions) {
    completionMap.set(c.packet_id, c);
  }

  const acceptanceIds = new Set<string>();
  for (const a of input.acceptances) {
    acceptanceIds.add(a.packet_id);
  }

  // Filter packets by feature if specified
  let filteredPackets = input.packets;
  let featureFilter: string | null = null;
  if (input.featureFilter !== undefined) {
    featureFilter = input.featureFilter;
    const feature = (input.features ?? []).find((f) => f.id === input.featureFilter);
    if (feature !== undefined) {
      const featurePacketIds = new Set(feature.packets);
      filteredPackets = input.packets.filter((p) => featurePacketIds.has(p.id));
    }
  }

  // Derive per-packet status
  const allPackets: PacketSummary[] = [];
  const acceptedIds = new Set<string>();

  for (const packet of filteredPackets) {
    const status = derivePacketLifecycle(packet, completionMap, acceptanceIds);
    const hasCompletion = completionMap.has(packet.id);
    const hasAcceptance = acceptanceIds.has(packet.id);

    // Audit pending: cross_cutting, auto-accepted, no human acceptance
    const auditPending = status === 'accepted' &&
      packet.change_class === 'cross_cutting' &&
      !hasAcceptance;

    // Unmet packet dependencies (not environment dependencies)
    const deps = packet.dependencies ?? [];
    const unmetDeps: string[] = [];
    for (const dep of deps) {
      if (!acceptedIds.has(dep)) {
        // Check if dep is accepted
        const depPacket = input.packets.find((p) => p.id === dep);
        if (depPacket !== undefined) {
          const depStatus = derivePacketLifecycle(depPacket, completionMap, acceptanceIds);
          if (depStatus !== 'accepted') {
            unmetDeps.push(dep);
          }
        }
      }
    }

    if (status === 'accepted') {
      acceptedIds.add(packet.id);
    }

    allPackets.push({
      id: packet.id,
      title: packet.title,
      change_class: packet.change_class,
      status,
      has_completion: hasCompletion,
      has_acceptance: hasAcceptance,
      audit_pending: auditPending,
      dependencies: deps,
      unmet_dependencies: unmetDeps,
      started_at: packet.started_at ?? null,
    });
  }

  // Categorize
  const incomplete = allPackets.filter((p) => p.status === 'in_progress');
  const awaitingAcceptance = allPackets.filter((p) =>
    p.status === 'completed' && p.change_class === 'architectural' && !p.has_acceptance,
  );
  const auditPending = allPackets.filter((p) => p.audit_pending);
  const blocked = allPackets.filter((p) => p.unmet_dependencies.length > 0 && p.status !== 'accepted');

  // Summary
  const summary = {
    total: allPackets.length,
    accepted: allPackets.filter((p) => p.status === 'accepted').length,
    completed: allPackets.filter((p) => p.status === 'completed').length,
    in_progress: incomplete.length,
    not_started: allPackets.filter((p) => p.status === 'not_started').length,
    audit_pending: auditPending.length,
  };

  // Determine next action
  const nextAction = deriveNextAction(incomplete, awaitingAcceptance, blocked, allPackets);

  return {
    feature_filter: featureFilter,
    summary,
    incomplete,
    awaiting_acceptance: awaitingAcceptance,
    audit_pending: auditPending,
    blocked,
    next_action: nextAction,
  };
}

function deriveNextAction(
  incomplete: ReadonlyArray<PacketSummary>,
  awaitingAcceptance: ReadonlyArray<PacketSummary>,
  blocked: ReadonlyArray<PacketSummary>,
  _allPackets: ReadonlyArray<PacketSummary>,
): NextAction {
  // Priority 1: Incomplete packets need completion
  if (incomplete.length > 0) {
    // Sort by started_at to pick the oldest first
    const sorted = [...incomplete].sort((a, b) =>
      (a.started_at ?? '').localeCompare(b.started_at ?? ''),
    );
    const first = sorted[0]!;
    return {
      kind: 'complete_packet',
      packet_id: first.id,
      message: `Packet '${first.id}' is in-progress but has no completion record. Create the completion before proceeding.`,
      command: `pnpm factory:complete ${first.id}`,
    };
  }

  // Priority 2: Blocked packets need dependency resolution
  if (blocked.length > 0) {
    const first = blocked[0]!;
    const dep = first.unmet_dependencies[0]!;
    return {
      kind: 'resolve_dependency',
      packet_id: first.id,
      message: `Packet '${first.id}' is blocked by unmet dependency '${dep}'. Resolve the dependency first.`,
      command: null,
    };
  }

  // Priority 3: Packets awaiting human acceptance
  if (awaitingAcceptance.length > 0) {
    const first = awaitingAcceptance[0]!;
    return {
      kind: 'accept_packet',
      packet_id: first.id,
      message: `Packet '${first.id}' (${first.change_class}) is completed and requires human acceptance.`,
      command: null,
    };
  }

  // All clear
  return {
    kind: 'all_clear',
    packet_id: null,
    message: 'All packets are accepted. No active work. Ready for next packet.',
    command: null,
  };
}

// ---------------------------------------------------------------------------
// Rendering (human-readable output)
// ---------------------------------------------------------------------------

function renderStatus(status: FactoryStatus): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');
  if (status.feature_filter !== null) {
    lines.push(`  ARCHON FACTORY STATUS — Feature: ${status.feature_filter}`);
  } else {
    lines.push('  ARCHON FACTORY STATUS');
  }
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');

  // Summary
  lines.push('  Summary:');
  lines.push(`    Total packets:      ${String(status.summary.total)}`);
  lines.push(`    Accepted:           ${String(status.summary.accepted)}`);
  lines.push(`    Completed:          ${String(status.summary.completed)}`);
  lines.push(`    In-progress:        ${String(status.summary.in_progress)}`);
  lines.push(`    Not started:        ${String(status.summary.not_started)}`);
  lines.push(`    Audit pending:      ${String(status.summary.audit_pending)}`);
  lines.push('');

  // Incomplete packets
  if (status.incomplete.length > 0) {
    lines.push('  ⚠ Incomplete packets (started, no completion):');
    for (const p of status.incomplete) {
      lines.push(`    - ${p.id} (${p.change_class})`);
      lines.push(`      "${p.title}"`);
    }
    lines.push('');
  }

  // Awaiting acceptance
  if (status.awaiting_acceptance.length > 0) {
    lines.push('  ⏳ Awaiting human acceptance:');
    for (const p of status.awaiting_acceptance) {
      lines.push(`    - ${p.id} (${p.change_class})`);
    }
    lines.push('');
  }

  // Audit pending
  if (status.audit_pending.length > 0) {
    lines.push('  📋 Audit pending (accepted, review recommended):');
    for (const p of status.audit_pending) {
      lines.push(`    - ${p.id} (${p.change_class})`);
    }
    lines.push('');
  }

  // Blocked
  if (status.blocked.length > 0) {
    lines.push('  🚫 Blocked by unmet dependencies:');
    for (const p of status.blocked) {
      lines.push(`    - ${p.id} → needs: ${p.unmet_dependencies.join(', ')}`);
    }
    lines.push('');
  }

  // Next action
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  NEXT ACTION:');
  lines.push(`    ${status.next_action.message}`);
  if (status.next_action.command !== null) {
    lines.push(`    Command: ${status.next_action.command}`);
  }
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main(): void {
  const factoryRoot = join(process.cwd(), 'factory');

  const packets = readJsonDir<RawPacket>(factoryRoot, 'packets');
  const completions = readJsonDir<RawCompletion>(factoryRoot, 'completions');
  const acceptances = readJsonDir<RawAcceptance>(factoryRoot, 'acceptances');
  const features = readJsonDir<RawFeature>(factoryRoot, 'features');

  // Parse --feature flag
  const featureIdx = process.argv.indexOf('--feature');
  const featureFilter = featureIdx !== -1 ? process.argv[featureIdx + 1] : undefined;

  const status = deriveFactoryStatus({ packets, completions, acceptances, featureFilter, features });

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(status, null, 2) + '\n');
  } else {
    process.stdout.write(renderStatus(status));
  }
}

// Only run main when executed directly
const isDirectExecution = process.argv[1]?.endsWith('status.ts') ||
  process.argv[1]?.endsWith('status.js');
if (isDirectExecution) {
  main();
}
