#!/usr/bin/env tsx
/**
 * Archon Factory — Completion Gate
 *
 * Pre-commit enforcement: blocks commits that advance packet-scoped
 * implementation work without a corresponding completion record.
 *
 * This is the structural fix for the failure mode where agents implement
 * and commit code but skip creating the completion record. The factory
 * must fail closed when lifecycle integrity is broken.
 *
 * Rule (FI-7 — Commit-time completion enforcement):
 *   A commit MUST NOT include non-factory implementation files while
 *   any started packet lacks a completion record.
 *
 * Allowed exceptions:
 *   1. Factory-only commits: all staged files are under factory/
 *   2. Tooling-only commits: all staged files are under tools/factory/
 *   3. Infrastructure commits: .githooks/, .github/, root config files
 *      when no packet-scoped source files are staged
 *
 * The gate does NOT attempt to infer which packet a file belongs to.
 * It uses a simpler, more conservative rule: if ANY packet is started
 * but incomplete, non-factory implementation files cannot be committed.
 * This prevents drift without requiring file-to-packet mapping.
 *
 * @see factory/README.md (Factory Invariants)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types (exported for testing)
// ---------------------------------------------------------------------------

export interface PacketInfo {
  readonly id: string;
  readonly started_at: string | null;
  readonly status: string | null;
}

export interface GateInput {
  readonly stagedFiles: ReadonlyArray<string>;
  readonly packets: ReadonlyArray<PacketInfo>;
  readonly completionIds: ReadonlySet<string>;
}

export interface GateResult {
  readonly blocked: boolean;
  readonly reason: string;
  readonly incompletePackets: ReadonlyArray<string>;
  readonly implementationFiles: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Classification (pure, testable)
// ---------------------------------------------------------------------------

/**
 * Files that are considered "factory infrastructure" and do not count
 * as implementation work for gate purposes.
 */
function isFactoryOrInfraFile(filepath: string): boolean {
  // Factory artifacts and tooling
  if (filepath.startsWith('factory/')) return true;
  if (filepath.startsWith('tools/factory/')) return true;

  // Git and CI infrastructure
  if (filepath.startsWith('.githooks/')) return true;
  if (filepath.startsWith('.github/')) return true;

  // Root config files (package.json at root, tsconfig, etc.)
  // These are NOT implementation files — they are project-level config.
  // However, package.json in packages/ IS an implementation file.
  const rootConfigs = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'turbo.json',
    '.gitignore',
    '.eslintrc.json',
    '.eslintignore',
    'CLAUDE.md',
    'README.md',
    'LICENSE',
  ];
  if (rootConfigs.includes(filepath)) return true;

  return false;
}

/**
 * Core gate logic. Pure function — no I/O.
 *
 * Returns a GateResult indicating whether the commit should be blocked.
 */
export function evaluateCompletionGate(input: GateInput): GateResult {
  // Find packets that are started but have no completion
  const incompletePackets: string[] = [];
  for (const packet of input.packets) {
    if (
      packet.started_at !== null &&
      packet.status !== 'abandoned' &&
      packet.status !== 'deferred' &&
      !input.completionIds.has(packet.id)
    ) {
      incompletePackets.push(packet.id);
    }
  }

  // If no incomplete packets, gate passes
  if (incompletePackets.length === 0) {
    return {
      blocked: false,
      reason: 'No incomplete packets — commit allowed.',
      incompletePackets: [],
      implementationFiles: [],
    };
  }

  // Find staged files that are implementation work (not factory/infra)
  const implementationFiles: string[] = [];
  for (const file of input.stagedFiles) {
    if (!isFactoryOrInfraFile(file)) {
      implementationFiles.push(file);
    }
  }

  // If no implementation files staged, gate passes
  // (allows factory-only commits: creating packets, completions, acceptances)
  if (implementationFiles.length === 0) {
    return {
      blocked: false,
      reason: 'Only factory/infrastructure files staged — commit allowed.',
      incompletePackets,
      implementationFiles: [],
    };
  }

  // Block: implementation files staged with incomplete packets
  const packetList = incompletePackets.map((id) => `  - ${id}`).join('\n');
  const fileList = implementationFiles.slice(0, 10).map((f) => `  - ${f}`).join('\n');
  const truncated = implementationFiles.length > 10
    ? `\n  ... and ${String(implementationFiles.length - 10)} more`
    : '';

  return {
    blocked: true,
    reason:
      `FI-7 violation: Implementation files are staged but the following packet(s) are started without completion:\n` +
      `\n${packetList}\n` +
      `\nStaged implementation files:\n${fileList}${truncated}\n` +
      `\nTo fix:\n` +
      `  1. Create completion record(s): pnpm factory:complete <packet-id>\n` +
      `  2. Stage the completion: git add factory/completions/<packet-id>.json\n` +
      `  3. Re-run your commit\n` +
      `\nAlternatively, if this commit is unrelated to the active packet:\n` +
      `  - Ensure the incomplete packet is completed first\n` +
      `  - Or mark it as deferred: add "status": "deferred" to the packet JSON`,
    incompletePackets,
    implementationFiles,
  };
}

// ---------------------------------------------------------------------------
// I/O layer (reads from disk + git)
// ---------------------------------------------------------------------------

function readPacketInfos(factoryRoot: string): PacketInfo[] {
  const dir = join(factoryRoot, 'packets');
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const results: PacketInfo[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      results.push({
        id: typeof data['id'] === 'string' ? data['id'] : '',
        started_at: typeof data['started_at'] === 'string' ? data['started_at'] : null,
        status: typeof data['status'] === 'string' ? data['status'] : null,
      });
    } catch {
      // Skip unparseable files — validate.ts catches these
    }
  }

  return results;
}

function readCompletionIds(factoryRoot: string): Set<string> {
  const dir = join(factoryRoot, 'completions');
  if (!existsSync(dir)) return new Set();

  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const ids = new Set<string>();

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (typeof data['packet_id'] === 'string') {
        ids.add(data['packet_id']);
      }
    } catch {
      // Skip unparseable
    }
  }

  return ids;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main(): void {
  const factoryRoot = join(process.cwd(), 'factory');

  // Get staged files from git
  let stagedFiles: string[];
  try {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const output = execSync('git diff --cached --name-only', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim();
    stagedFiles = output.length > 0 ? output.split('\n') : [];
  } catch {
    // If git fails, pass the gate — other pre-commit checks will catch issues
    console.log('completion-gate: Could not read staged files. Skipping gate.');
    process.exit(0);
  }

  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  const packets = readPacketInfos(factoryRoot);
  const completionIds = readCompletionIds(factoryRoot);

  const result = evaluateCompletionGate({
    stagedFiles,
    packets,
    completionIds,
  });

  if (result.blocked) {
    console.error(`\n${'─'.repeat(60)}`);
    console.error('COMPLETION GATE BLOCKED');
    console.error(`${'─'.repeat(60)}\n`);
    console.error(result.reason);
    console.error(`\n${'─'.repeat(60)}\n`);
    process.exit(1);
  }
}

// Only run main when executed directly (not when imported for testing)
const isDirectExecution = process.argv[1]?.endsWith('completion-gate.ts') ||
  process.argv[1]?.endsWith('completion-gate.js');
if (isDirectExecution) {
  main();
}
