/**
 * Archon Module Loader — Capability Governance APIs
 *
 * Implements configuration-time governance enforcement for capability enablement:
 *   - Typed acknowledgment for T3 capabilities (Invariant I5)
 *   - Hazard matrix enforcement (formal_governance.md §8)
 *
 * Two-step API (used by CLI and desktop):
 *   1. previewEnableCapability() — inspect what requirements must be satisfied
 *   2. applyEnableCapability()   — validate + record + enable atomically
 *
 * Both steps are pure except for applyEnableCapability's side effects:
 *   - appendAckEvent() if T3
 *   - appendHazardAckEvent() for each triggered pair
 *   - capabilityRegistry.enableCapability() to update enabled set
 *
 * The kernel decides what is enforced (HAZARD_MATRIX, TYPED_ACK_REQUIRED_TIERS).
 * This file applies the enforcement at the module-loader boundary.
 *
 * @see docs/specs/formal_governance.md §5 (I5: typed acknowledgment)
 * @see docs/specs/formal_governance.md §8 (hazard composition model)
 */

import { randomUUID } from 'node:crypto';
import {
  HAZARD_MATRIX,
  TYPED_ACK_REQUIRED_TIERS,
  buildExpectedAckPhrase,
  RiskTier,
} from '@archon/kernel';
import type { HazardMatrixEntry } from '@archon/kernel';
import type { CapabilityType } from '@archon/kernel';
import type { ModuleRegistry } from './registry.js';
import type { CapabilityRegistry } from './capability-registry.js';
import {
  appendAckEvent,
  appendHazardAckEvent,
  getAckEpoch,
} from './ack-store.js';

// ---------------------------------------------------------------------------
// Preview Result
// ---------------------------------------------------------------------------

/**
 * A hazard pair that would be triggered by enabling the target capability.
 *
 * "Triggered" means the partner capability is currently enabled, so co-enabling
 * the target would create a declared hazard combination.
 */
export interface ActiveHazardPair {
  /** The full hazard matrix entry. */
  readonly entry: HazardMatrixEntry;
  /**
   * The capability type that is the partner in this pair
   * (i.e. the already-enabled member of the pair).
   */
  readonly partnerType: CapabilityType;
}

/**
 * The result of previewing a capability enable operation.
 *
 * Callers (CLI, desktop) use this to determine what prompts to present
 * to the operator before calling applyEnableCapability().
 */
export interface PreviewResult {
  /** The capability type being previewed. */
  readonly capabilityType: CapabilityType;
  /** Risk tier of the capability. */
  readonly tier: RiskTier;
  /**
   * Whether a typed acknowledgment phrase is required.
   * True iff tier is in TYPED_ACK_REQUIRED_TIERS (currently: T3 only).
   */
  readonly requiresTypedAck: boolean;
  /**
   * The exact phrase the operator must type, or null if not required.
   * Format: "I ACCEPT {tier} RISK ({capabilityType})"
   */
  readonly expectedPhrase: string | null;
  /**
   * Hazard pairs that would be triggered by enabling this capability.
   *
   * Empty if no currently-enabled capability partners with the target type
   * in the hazard matrix.
   */
  readonly activeHazardPairs: ReadonlyArray<ActiveHazardPair>;
}

// ---------------------------------------------------------------------------
// Apply Result
// ---------------------------------------------------------------------------

/**
 * The result of applying a capability enable operation.
 *
 * On success: capability is enabled, ack events are recorded, ack_epoch
 * reflects the new state.
 *
 * On failure: capability is NOT enabled. No state is changed. The error
 * field describes the exact reason.
 */
export interface ApplyResult {
  /** Whether the capability was successfully enabled. */
  readonly applied: boolean;
  /**
   * The ack_epoch value after this operation.
   *
   * On success (applied=true): the new epoch (incremented if T3 was acknowledged).
   * On failure (applied=false): the unchanged epoch before the operation.
   *
   * Pass this value to SnapshotBuilder.build() as the ackEpoch parameter
   * to ensure RS_hash reflects the new ack state.
   */
  readonly ackEpoch: number;
  /**
   * The error description if applied=false.
   * Undefined when applied=true.
   */
  readonly error?: string | undefined;
  /**
   * The id of the T3 ack event written to acknowledgments.json.
   *
   * Present only when applied=true and a T3 ack was recorded.
   * Pass to patchAckEventRsHash(id, rsHashAfter) after computing the
   * post-apply RS_hash to complete the audit event record.
   */
  readonly ackEventId?: string | undefined;
  /**
   * The ids of the hazard ack events written to hazard-acks.json.
   *
   * Present only when applied=true and one or more hazard pairs were confirmed.
   * Pass each id to patchHazardAckEventRsHash(id, rsHashAfter) after computing
   * the post-apply RS_hash to complete the audit event records.
   */
  readonly hazardEventIds?: ReadonlyArray<string> | undefined;
}

/**
 * Options for applyEnableCapability.
 */
export interface ApplyOptions {
  /**
   * The exact typed acknowledgment phrase entered by the operator.
   *
   * Required when the capability tier is in TYPED_ACK_REQUIRED_TIERS (T3).
   * Must equal buildExpectedAckPhrase(tier, capabilityType) exactly.
   * If absent or incorrect when required, apply returns applied=false.
   */
  readonly typedAckPhrase?: string | undefined;
  /**
   * Hazard pairs that the operator has explicitly confirmed.
   *
   * Each entry is a tuple [type_a, type_b] identifying a hazard pair.
   * Pair matching is order-insensitive: (A, B) matches both (A, B) and (B, A).
   *
   * Required for each triggered pair (partner already enabled).
   * If a triggered pair is not in this list, apply returns applied=false.
   */
  readonly hazardConfirmedPairs?: ReadonlyArray<readonly [CapabilityType, CapabilityType]> | undefined;
}

// ---------------------------------------------------------------------------
// previewEnableCapability
// ---------------------------------------------------------------------------

/**
 * Preview what requirements must be satisfied to enable a capability type.
 *
 * Returns a PreviewResult describing:
 * - The tier (from the declaring module's descriptor)
 * - Whether a typed acknowledgment phrase is required (T3 only)
 * - The expected phrase if required
 * - Which hazard pairs are currently active (partner already enabled)
 *
 * This function has no side effects. It may be called multiple times
 * without consequence.
 *
 * @param type - The capability type to preview
 * @param moduleRegistry - Current module registry (for tier lookup)
 * @param capabilityRegistry - Current capability registry (for hazard partner check)
 * @returns PreviewResult
 */
export function previewEnableCapability(
  type: CapabilityType,
  moduleRegistry: ModuleRegistry,
  capabilityRegistry: CapabilityRegistry,
): PreviewResult {
  const tier = findTier(type, moduleRegistry);

  const requiresTypedAck = TYPED_ACK_REQUIRED_TIERS.has(tier);
  const expectedPhrase = requiresTypedAck ? buildExpectedAckPhrase(tier, type) : null;

  // Find hazard pairs where the partner is currently enabled.
  const enabledTypes = new Set(capabilityRegistry.listEnabledCapabilities());
  const activeHazardPairs: ActiveHazardPair[] = [];
  for (const entry of HAZARD_MATRIX) {
    if (entry.type_a === type && enabledTypes.has(entry.type_b)) {
      activeHazardPairs.push({ entry, partnerType: entry.type_b });
    } else if (entry.type_b === type && enabledTypes.has(entry.type_a)) {
      activeHazardPairs.push({ entry, partnerType: entry.type_a });
    }
  }

  return {
    capabilityType: type,
    tier,
    requiresTypedAck,
    expectedPhrase,
    activeHazardPairs,
  };
}

// ---------------------------------------------------------------------------
// applyEnableCapability
// ---------------------------------------------------------------------------

/**
 * Apply a capability enable operation with governance validation.
 *
 * Atomically validates and, on success, enables the capability. The
 * operation is all-or-nothing: if any check fails, nothing is written.
 *
 * Validation order (matches spec §5 I5, §8):
 *   1. Capability declared by an enabled module (I1 pre-condition)
 *   2. Typed acknowledgment phrase correct (I5, T3 only)
 *   3. All triggered hazard pairs confirmed (formal_governance.md §8)
 *
 * On success:
 *   - Appends AckEvent to acknowledgments.json (T3 only)
 *   - Appends HazardAckEvent for each triggered pair
 *   - Calls capabilityRegistry.enableCapability(type, { confirmed: true })
 *   - Returns { applied: true, ackEpoch: <new count> }
 *
 * On failure:
 *   - Returns { applied: false, ackEpoch: <unchanged count>, error: '...' }
 *   - No state is written
 *
 * @param type - The capability type to enable
 * @param opts - Typed ack phrase and/or hazard pair confirmations
 * @param moduleRegistry - Current module registry
 * @param capabilityRegistry - Current capability registry
 * @returns ApplyResult
 */
export function applyEnableCapability(
  type: CapabilityType,
  opts: ApplyOptions,
  moduleRegistry: ModuleRegistry,
  capabilityRegistry: CapabilityRegistry,
): ApplyResult {
  // Step 1: Confirm at least one enabled module declares this capability type.
  const enabledModules = moduleRegistry.listEnabled();
  let tier: RiskTier | null = null;
  for (const mod of enabledModules) {
    const d = mod.capability_descriptors.find((desc) => desc.type === type);
    if (d !== undefined) {
      tier = d.tier;
      break;
    }
  }
  if (tier === null) {
    return {
      applied: false,
      ackEpoch: getAckEpoch(),
      error:
        `Cannot enable capability '${type}': no enabled module declares this capability type. ` +
        `Enable a module that declares '${type}' first.`,
    };
  }

  // Step 2: Typed acknowledgment for T3 (Invariant I5).
  if (TYPED_ACK_REQUIRED_TIERS.has(tier)) {
    const expectedPhrase = buildExpectedAckPhrase(tier, type);
    if (opts.typedAckPhrase !== expectedPhrase) {
      return {
        applied: false,
        ackEpoch: getAckEpoch(),
        error:
          `${tier} typed acknowledgment required. ` +
          `Expected exact phrase: "${expectedPhrase}". ` +
          `Got: "${opts.typedAckPhrase ?? ''}"`,
      };
    }
  }

  // Step 3: Hazard matrix enforcement (formal_governance.md §8).
  const enabledTypes = new Set(capabilityRegistry.listEnabledCapabilities());
  const triggeredPairs: HazardMatrixEntry[] = [];
  for (const entry of HAZARD_MATRIX) {
    if (
      (entry.type_a === type && enabledTypes.has(entry.type_b)) ||
      (entry.type_b === type && enabledTypes.has(entry.type_a))
    ) {
      triggeredPairs.push(entry);
    }
  }

  const confirmedPairs = opts.hazardConfirmedPairs ?? [];
  for (const pair of triggeredPairs) {
    const isConfirmed = confirmedPairs.some(
      ([a, b]) =>
        (a === pair.type_a && b === pair.type_b) ||
        (a === pair.type_b && b === pair.type_a),
    );
    if (!isConfirmed) {
      return {
        applied: false,
        ackEpoch: getAckEpoch(),
        error:
          `Hazard pair (${pair.type_a}, ${pair.type_b}) must be confirmed before enabling '${type}'. ` +
          `Hazard: "${pair.description}". ` +
          `Pass this pair in hazardConfirmedPairs or use --confirm-hazards.`,
      };
    }
  }

  // All checks passed. Commit side effects atomically.
  const now = new Date().toISOString();

  // Write T3 ack event (if applicable).
  let ackEventId: string | undefined;
  if (TYPED_ACK_REQUIRED_TIERS.has(tier)) {
    ackEventId = randomUUID();
    appendAckEvent({
      id: ackEventId,
      timestamp: now,
      capabilityType: type,
      tier,
      phrase: opts.typedAckPhrase ?? '',
      rsHashAfter: null,
    });
  }

  // Write hazard ack events for each triggered pair.
  const hazardEventIds: string[] = [];
  for (const pair of triggeredPairs) {
    const hazardId = randomUUID();
    hazardEventIds.push(hazardId);
    appendHazardAckEvent({
      id: hazardId,
      timestamp: now,
      type_a: pair.type_a,
      type_b: pair.type_b,
      rsHashAfter: null,
    });
  }

  // Enable the capability (persists to enabled-capabilities.json).
  capabilityRegistry.enableCapability(type, { confirmed: true });

  return {
    applied: true,
    ackEpoch: getAckEpoch(),
    ...(ackEventId !== undefined ? { ackEventId } : {}),
    ...(hazardEventIds.length > 0 ? { hazardEventIds } : {}),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the risk tier for a capability type, checking enabled modules first,
 * then all registered modules.
 *
 * Returns T1 as a safe default if the type is undeclared. The apply step
 * will reject with a descriptive error in that case.
 *
 * @internal
 */
function findTier(type: CapabilityType, moduleRegistry: ModuleRegistry): RiskTier {
  // Prefer enabled modules for accuracy.
  for (const mod of moduleRegistry.listEnabled()) {
    const d = mod.capability_descriptors.find((desc) => desc.type === type);
    if (d !== undefined) return d.tier;
  }
  // Fall back to all registered modules for preview purposes.
  for (const mod of moduleRegistry.list()) {
    const d = mod.capability_descriptors.find((desc) => desc.type === type);
    if (d !== undefined) return d.tier;
  }
  // Undeclared — safe default for preview display only.
  return RiskTier.T1;
}
