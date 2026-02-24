/**
 * Archon Kernel — Configuration-Time Governance Constants
 *
 * Pure, I/O-free constants and helpers for the governance invariants
 * enforced at capability configuration time (not at evaluation time).
 *
 * I5 — Typed acknowledgment on tier elevation:
 *   Enabling a T3 capability requires the operator to type an exact
 *   acknowledgment phrase of the form "I ACCEPT T3 RISK ({capabilityType})".
 *   No near-matches. Exact string equality only.
 *
 * I8 (hazard composition, formal_governance.md §8):
 *   Four capability pairs require explicit operator confirmation when
 *   co-enabled. Confirmation is required at configuration time, before
 *   the capability is added to the enabled set.
 *
 * These constants and helpers are pure — no I/O, no state, no side effects.
 * The concrete enforcement (reading/writing ack events) lives in
 * packages/module-loader/src/ack-store.ts and capability-governance.ts.
 *
 * @see docs/specs/formal_governance.md §5 (I5: typed acknowledgment)
 * @see docs/specs/formal_governance.md §8 (hazard composition model)
 * @see docs/specs/governance.md §2 (hazard matrix)
 */

import { CapabilityType } from '../types/capability.js';
import { RiskTier } from '../types/capability.js';

// ---------------------------------------------------------------------------
// Typed Acknowledgment (I5)
// ---------------------------------------------------------------------------

/**
 * The set of risk tiers that require a typed acknowledgment phrase before
 * the capability may be enabled.
 *
 * Currently: T3 only. T0–T2 require y/N confirmation only.
 *
 * @see docs/specs/formal_governance.md §5 (I5)
 */
export const TYPED_ACK_REQUIRED_TIERS: ReadonlySet<RiskTier> = new Set([RiskTier.T3]);

/**
 * Build the expected typed acknowledgment phrase for a capability.
 *
 * Format: "I ACCEPT {tier} RISK ({capabilityType})"
 * Example: "I ACCEPT T3 RISK (fs.delete)"
 *
 * The phrase is case-sensitive. Exact string equality is required.
 * No near-matches, no trimming beyond what the CLI already applies.
 *
 * @param tier - The risk tier (e.g. RiskTier.T3 = 'T3')
 * @param capabilityType - The capability type string (e.g. 'fs.delete')
 * @returns The exact phrase the operator must type
 *
 * @see docs/specs/formal_governance.md §5 (I5)
 */
export function buildExpectedAckPhrase(tier: RiskTier, capabilityType: CapabilityType): string {
  return `I ACCEPT ${tier} RISK (${capabilityType})`;
}

// ---------------------------------------------------------------------------
// Hazard Matrix (formal_governance.md §8)
// ---------------------------------------------------------------------------

/**
 * A single entry in the hazard matrix.
 *
 * When both capability types are simultaneously enabled, the operator must
 * confirm the pair explicitly at configuration time.
 *
 * Confirmation is separate from tier acknowledgment:
 * - Tier ack: typed phrase, required for T3
 * - Hazard ack: y/N confirmation, required per pair
 *
 * @see docs/specs/formal_governance.md §8
 * @see docs/specs/governance.md §2 (hazard matrix)
 */
export interface HazardMatrixEntry {
  /** The first capability type in the pair (canonical ordering: alphabetically first). */
  readonly type_a: CapabilityType;
  /** The second capability type in the pair. */
  readonly type_b: CapabilityType;
  /** Human-readable description of the hazard. Shown in CLI confirmation prompt. */
  readonly description: string;
}

/**
 * The canonical hazard matrix.
 *
 * Each entry is a pair of capability types that, when both enabled
 * simultaneously, require explicit operator confirmation.
 *
 * Enforcement rule: when enabling capability C, check all pairs where C
 * appears. For each pair where the partner is already enabled, require
 * confirmation before proceeding.
 *
 * These pairs are evaluated at configuration time only. They do not
 * auto-elevate tier. They do not block configuration — they require
 * acknowledgment before configuration proceeds.
 *
 * @see docs/specs/governance.md §2 (hazard matrix)
 * @see docs/specs/formal_governance.md §8 (hazard composition model)
 */
export const HAZARD_MATRIX: ReadonlyArray<HazardMatrixEntry> = [
  {
    type_a: CapabilityType.LlmInfer,
    type_b: CapabilityType.SecretsUse,
    description: 'Inference with credential access: LLM inference co-enabled with secret usage',
  },
  {
    type_a: CapabilityType.LlmInfer,
    type_b: CapabilityType.NetEgressRaw,
    description: 'Inference with raw network egress: LLM inference co-enabled with unbounded outbound network',
  },
  {
    type_a: CapabilityType.ExecRun,
    type_b: CapabilityType.FsRead,
    description: 'Subprocess execution with read access: arbitrary code execution can read local files',
  },
  {
    type_a: CapabilityType.FsWrite,
    type_b: CapabilityType.NetFetchHttp,
    description: 'HTTP fetch with filesystem write: network data can be persisted to disk',
  },
] as const;
