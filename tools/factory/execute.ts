#!/usr/bin/env tsx
/**
 * Archon Factory — Execute (Stateless Action Resolver)
 *
 * Reads a feature manifest and factory state, then outputs exactly
 * which packets are ready for execution. Does NOT spawn agents.
 * The LLM reads this output and spawns agents accordingly.
 *
 * This script is designed to be called repeatedly in a loop.
 * Each invocation reads state from disk — no memory between calls.
 * If the LLM dies and a new session starts, running this command
 * reconstructs exactly where execution stands.
 *
 * Usage:
 *   pnpm factory:execute <feature-id>
 *   pnpm factory:execute <feature-id> -- --json
 *
 * Exit codes:
 *   0 — action resolved (ready packets, or all complete, or blocked)
 *   1 — error (feature not found, invalid state)
 *
 * @see factory/README.md (Factory Lifecycle)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types (exported for testing)
// ---------------------------------------------------------------------------

export interface Feature {
  readonly id: string;
  readonly intent: string;
  readonly status: 'draft' | 'planned' | 'approved' | 'executing' | 'completed' | 'delivered';
  readonly packets: ReadonlyArray<string>;
  readonly created_by: { readonly kind: string; readonly id: string };
  readonly approved_at?: string | null;
}

export interface PacketState {
  readonly id: string;
  readonly title: string;
  readonly change_class: string;
  readonly dependencies: ReadonlyArray<string>;
  readonly started_at: string | null;
  readonly has_completion: boolean;
  readonly has_acceptance: boolean;
  readonly is_accepted: boolean;
}

export type ExecuteActionKind =
  | 'spawn_packets'
  | 'all_complete'
  | 'blocked'
  | 'not_approved'
  | 'feature_not_found';

export interface ExecuteAction {
  readonly kind: ExecuteActionKind;
  readonly feature_id: string;
  readonly ready_packets: ReadonlyArray<string>;
  readonly in_progress_packets: ReadonlyArray<string>;
  readonly completed_packets: ReadonlyArray<string>;
  readonly blocked_packets: ReadonlyArray<{ readonly id: string; readonly blocked_by: ReadonlyArray<string> }>;
  readonly total_packets: number;
  readonly message: string;
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

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function readJsonDir<T>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<T>(join(dir, f)))
    .filter((x): x is T => x !== null);
}

// ---------------------------------------------------------------------------
// Core logic (pure, testable)
// ---------------------------------------------------------------------------

export interface ExecuteInput {
  readonly feature: Feature;
  readonly packets: ReadonlyArray<RawPacket>;
  readonly completionIds: ReadonlySet<string>;
  readonly acceptanceIds: ReadonlySet<string>;
}

function isAccepted(
  packet: RawPacket,
  completionMap: ReadonlyMap<string, boolean>,
  acceptanceIds: ReadonlySet<string>,
): boolean {
  if (acceptanceIds.has(packet.id)) return true;
  const passes = completionMap.get(packet.id);
  if (passes === undefined) return false;
  const cc = packet.change_class;
  return (cc === 'trivial' || cc === 'local' || cc === 'cross_cutting') && passes;
}

export function resolveExecuteAction(input: ExecuteInput): ExecuteAction {
  const { feature } = input;

  if (feature.status !== 'approved' && feature.status !== 'executing') {
    return {
      kind: 'not_approved',
      feature_id: feature.id,
      ready_packets: [],
      in_progress_packets: [],
      completed_packets: [],
      blocked_packets: [],
      total_packets: feature.packets.length,
      message: `Feature '${feature.id}' is in status '${feature.status}'. Must be 'approved' or 'executing' to run.`,
    };
  }

  // Build packet map scoped to this feature
  const allPacketMap = new Map<string, RawPacket>();
  for (const p of input.packets) {
    allPacketMap.set(p.id, p);
  }

  // Build completion verification map
  const completionVerifMap = new Map<string, boolean>();
  // We need to reconstruct from raw completions - but we only have IDs here
  // For simplicity, if completionId exists, assume verification passes
  // (factory:complete only writes on pass)
  for (const id of input.completionIds) {
    completionVerifMap.set(id, true);
  }

  const featurePacketIds = new Set(feature.packets);

  // Classify each packet in the feature
  const completedPackets: string[] = [];
  const inProgressPackets: string[] = [];
  const readyPackets: string[] = [];
  const blockedPackets: Array<{ id: string; blocked_by: string[] }> = [];

  for (const packetId of feature.packets) {
    const packet = allPacketMap.get(packetId);
    if (packet === undefined) {
      blockedPackets.push({ id: packetId, blocked_by: [`packet '${packetId}' not found`] });
      continue;
    }

    // Is this packet already done?
    if (input.completionIds.has(packetId)) {
      completedPackets.push(packetId);
      continue;
    }

    // Is this packet in-progress (started but no completion)?
    if (packet.started_at != null) {
      inProgressPackets.push(packetId);
      continue;
    }

    // Check dependencies — only consider deps within the feature scope
    const deps = packet.dependencies ?? [];
    const unmetDeps: string[] = [];
    for (const dep of deps) {
      // Deps outside the feature: check if accepted in global state
      if (!featurePacketIds.has(dep)) {
        if (!isAccepted(
          allPacketMap.get(dep) ?? { id: dep, title: '', change_class: 'local' },
          completionVerifMap,
          input.acceptanceIds,
        )) {
          unmetDeps.push(dep);
        }
        continue;
      }
      // Deps inside the feature: check if completed
      if (!input.completionIds.has(dep)) {
        unmetDeps.push(dep);
      }
    }

    if (unmetDeps.length > 0) {
      blockedPackets.push({ id: packetId, blocked_by: unmetDeps });
    } else {
      readyPackets.push(packetId);
    }
  }

  // Determine action
  if (completedPackets.length === feature.packets.length) {
    return {
      kind: 'all_complete',
      feature_id: feature.id,
      ready_packets: [],
      in_progress_packets: [],
      completed_packets: completedPackets,
      blocked_packets: [],
      total_packets: feature.packets.length,
      message:
        `Feature '${feature.id}': all ${String(feature.packets.length)} packets complete.\n` +
        `  Next: produce QA report with pnpm factory:report ${feature.id}`,
    };
  }

  if (readyPackets.length > 0) {
    return {
      kind: 'spawn_packets',
      feature_id: feature.id,
      ready_packets: readyPackets,
      in_progress_packets: inProgressPackets,
      completed_packets: completedPackets,
      blocked_packets: blockedPackets,
      total_packets: feature.packets.length,
      message:
        `Feature '${feature.id}': ${String(completedPackets.length)}/${String(feature.packets.length)} complete.\n` +
        `  Ready to execute: ${readyPackets.join(', ')}\n` +
        (inProgressPackets.length > 0 ? `  In progress: ${inProgressPackets.join(', ')}\n` : '') +
        (blockedPackets.length > 0 ? `  Blocked: ${blockedPackets.map((b) => b.id).join(', ')}\n` : '') +
        `  Spawn ${String(readyPackets.length)} agent(s) for ready packets.`,
    };
  }

  if (inProgressPackets.length > 0) {
    return {
      kind: 'spawn_packets',
      feature_id: feature.id,
      ready_packets: [],
      in_progress_packets: inProgressPackets,
      completed_packets: completedPackets,
      blocked_packets: blockedPackets,
      total_packets: feature.packets.length,
      message:
        `Feature '${feature.id}': ${String(completedPackets.length)}/${String(feature.packets.length)} complete.\n` +
        `  In progress (awaiting completion): ${inProgressPackets.join(', ')}\n` +
        (blockedPackets.length > 0 ? `  Blocked: ${blockedPackets.map((b) => b.id).join(', ')}\n` : '') +
        `  Wait for in-progress packets to complete, then re-run.`,
    };
  }

  return {
    kind: 'blocked',
    feature_id: feature.id,
    ready_packets: [],
    in_progress_packets: [],
    completed_packets: completedPackets,
    blocked_packets: blockedPackets,
    total_packets: feature.packets.length,
    message:
      `Feature '${feature.id}': BLOCKED. ${String(completedPackets.length)}/${String(feature.packets.length)} complete.\n` +
      `  Blocked packets:\n` +
      blockedPackets.map((b) => `    - ${b.id} → needs: ${b.blocked_by.join(', ')}`).join('\n') +
      `\n  Resolve dependencies or replan.`,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAction(action: ExecuteAction): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  FACTORY EXECUTE');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Feature: ${action.feature_id}`);
  lines.push(`  Progress: ${String(action.completed_packets.length)}/${String(action.total_packets)} packets complete`);
  lines.push('');

  if (action.completed_packets.length > 0) {
    lines.push('  ✓ Completed:');
    for (const id of action.completed_packets) {
      lines.push(`    - ${id}`);
    }
    lines.push('');
  }

  if (action.in_progress_packets.length > 0) {
    lines.push('  ⏳ In progress:');
    for (const id of action.in_progress_packets) {
      lines.push(`    - ${id}`);
    }
    lines.push('');
  }

  if (action.ready_packets.length > 0) {
    lines.push('  → Ready to spawn:');
    for (const id of action.ready_packets) {
      lines.push(`    - ${id}`);
    }
    lines.push('');
  }

  if (action.blocked_packets.length > 0) {
    lines.push('  🚫 Blocked:');
    for (const b of action.blocked_packets) {
      lines.push(`    - ${b.id} → needs: ${b.blocked_by.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  ACTION:');
  lines.push(`    ${action.message.split('\n').join('\n    ')}`);
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main(): void {
  const featureId = process.argv.find((arg) => !arg.startsWith('-') && arg !== '--' && !arg.includes('/'));
  // More robust: find the first non-flag, non-path argument after the script name
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const positional = args.filter((a) => !a.startsWith('-'));
  const resolvedFeatureId = positional[0];

  if (resolvedFeatureId === undefined) {
    console.error('Usage: pnpm factory:execute <feature-id>');
    process.exit(1);
  }

  const factoryRoot = join(process.cwd(), 'factory');
  const featurePath = join(factoryRoot, 'features', `${resolvedFeatureId}.json`);

  if (!existsSync(featurePath)) {
    console.error(`Feature not found: ${featurePath}`);
    console.error(`Available features:`);
    const featDir = join(factoryRoot, 'features');
    if (existsSync(featDir)) {
      const files = readdirSync(featDir).filter((f) => f.endsWith('.json'));
      if (files.length === 0) {
        console.error('  (none)');
      } else {
        for (const f of files) {
          console.error(`  - ${f.replace('.json', '')}`);
        }
      }
    }
    process.exit(1);
  }

  const feature = readJson<Feature>(featurePath);
  if (feature === null) {
    console.error(`Failed to parse feature: ${featurePath}`);
    process.exit(1);
  }

  const packets = readJsonDir<RawPacket>(join(factoryRoot, 'packets'));
  const completions = readJsonDir<RawCompletion>(join(factoryRoot, 'completions'));
  const acceptances = readJsonDir<RawAcceptance>(join(factoryRoot, 'acceptances'));

  const completionIds = new Set(completions.map((c) => c.packet_id));
  const acceptanceIds = new Set(acceptances.map((a) => a.packet_id));

  const action = resolveExecuteAction({
    feature,
    packets,
    completionIds,
    acceptanceIds,
  });

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(action, null, 2) + '\n');
  } else {
    process.stdout.write(renderAction(action));
  }
}

const isDirectExecution = process.argv[1]?.endsWith('execute.ts') ||
  process.argv[1]?.endsWith('execute.js');
if (isDirectExecution) {
  main();
}
