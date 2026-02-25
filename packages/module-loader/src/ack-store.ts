/**
 * Archon Module Loader — Acknowledgment State Store
 *
 * Reads and writes the two acknowledgment state files:
 *   - `.archon/state/acknowledgments.json`  — T3 capability ack events
 *   - `.archon/state/hazard-acks.json`       — hazard pair confirmation events
 *
 * The ack_epoch (count of T3 ack events) is incorporated into the Rule
 * Snapshot hash so RS_hash changes after each T3 capability is acknowledged.
 * This satisfies Invariants I4 (snapshot determinism) and I5 (typed ack).
 *
 * State directory: ARCHON_STATE_DIR env var, or .archon/ in process.cwd()
 * (resolved by readJsonState/writeJsonState from @archon/runtime-host).
 *
 * @see docs/specs/formal_governance.md §5 (I5: typed acknowledgment)
 * @see docs/specs/formal_governance.md §8 (hazard composition model)
 */

import { readJsonState, writeJsonState } from '@archon/runtime-host';
import type { CapabilityType, RiskTier } from '@archon/kernel';

// ---------------------------------------------------------------------------
// Ack Event Shape
// ---------------------------------------------------------------------------

/**
 * A T3 capability acknowledgment event.
 *
 * Appended when the operator provides the correct typed phrase to enable
 * a T3 capability. The phrase is recorded for audit purposes.
 *
 * @see docs/specs/formal_governance.md §5 (I5)
 */
export interface AckEvent {
  /** Unique identifier for this event (UUIDv4). Used for post-apply hash patching. */
  readonly id: string;
  /** ISO 8601 timestamp of the acknowledgment. */
  readonly timestamp: string;
  /** The capability type being acknowledged. */
  readonly capabilityType: CapabilityType;
  /** The risk tier of the acknowledged capability. */
  readonly tier: RiskTier;
  /**
   * The exact phrase typed by the operator. Recorded for audit trail.
   * Validates to buildExpectedAckPhrase(tier, capabilityType) before recording.
   */
  readonly phrase: string;
  /**
   * The RS_hash of the rule snapshot immediately after this event was applied.
   *
   * Set to null at write time; patched by the caller (CLI/desktop) via
   * patchAckEventRsHash() after the post-apply snapshot has been computed.
   * Null means the hash was not yet bound at write time — never omitted.
   */
  readonly rsHashAfter: string | null;
}

/**
 * A hazard pair confirmation event.
 *
 * Appended when the operator confirms co-enablement of a hazard pair
 * (two capability types that together form a declared hazard combination).
 *
 * @see docs/specs/formal_governance.md §8 (hazard composition)
 */
export interface HazardAckEvent {
  /** Unique identifier for this event (UUIDv4). Used for post-apply hash patching. */
  readonly id: string;
  /** ISO 8601 timestamp of the confirmation. */
  readonly timestamp: string;
  /** First capability type in the pair. */
  readonly type_a: CapabilityType;
  /** Second capability type in the pair. */
  readonly type_b: CapabilityType;
  /**
   * The RS_hash of the rule snapshot immediately after this event was applied.
   *
   * Set to null at write time; patched by the caller (CLI/desktop) via
   * patchHazardAckEventRsHash() after the post-apply snapshot has been computed.
   * Null means the hash was not yet bound at write time — never omitted.
   */
  readonly rsHashAfter: string | null;
}

// ---------------------------------------------------------------------------
// Ack Event I/O
// ---------------------------------------------------------------------------

/**
 * Read all T3 acknowledgment events from persisted state.
 *
 * Returns an empty array if the file does not exist.
 */
export function readAckEvents(): ReadonlyArray<AckEvent> {
  return readJsonState<AckEvent[]>('acknowledgments.json', []);
}

/**
 * Append a T3 acknowledgment event to persisted state.
 *
 * Reads the existing array, appends the new event, and writes back.
 * The full array is written on each call (not append-only) to ensure
 * the JSON file remains valid and readable.
 */
export function appendAckEvent(event: AckEvent): void {
  const existing = readJsonState<AckEvent[]>('acknowledgments.json', []);
  writeJsonState('acknowledgments.json', [...existing, event]);
}

/**
 * Read all hazard pair confirmation events from persisted state.
 *
 * Returns an empty array if the file does not exist.
 */
export function readHazardAckEvents(): ReadonlyArray<HazardAckEvent> {
  return readJsonState<HazardAckEvent[]>('hazard-acks.json', []);
}

/**
 * Append a hazard pair confirmation event to persisted state.
 */
export function appendHazardAckEvent(event: HazardAckEvent): void {
  const existing = readJsonState<HazardAckEvent[]>('hazard-acks.json', []);
  writeJsonState('hazard-acks.json', [...existing, event]);
}

/**
 * Patch the rsHashAfter field on a T3 ack event identified by id.
 *
 * Called by the CLI/desktop after computing the post-apply RS_hash.
 * Reads acknowledgments.json, replaces the matching event with rsHashAfter
 * set to the provided hash, and writes back.
 *
 * No-op if no event with the given id exists (safe to call unconditionally).
 */
export function patchAckEventRsHash(id: string, rsHashAfter: string): void {
  const existing = readJsonState<AckEvent[]>('acknowledgments.json', []);
  const patched = existing.map((e) => (e.id === id ? { ...e, rsHashAfter } : e));
  writeJsonState('acknowledgments.json', patched);
}

/**
 * Patch the rsHashAfter field on a hazard ack event identified by id.
 *
 * Called by the CLI/desktop after computing the post-apply RS_hash.
 * Reads hazard-acks.json, replaces the matching event with rsHashAfter
 * set to the provided hash, and writes back.
 *
 * No-op if no event with the given id exists (safe to call unconditionally).
 */
export function patchHazardAckEventRsHash(id: string, rsHashAfter: string): void {
  const existing = readJsonState<HazardAckEvent[]>('hazard-acks.json', []);
  const patched = existing.map((e) => (e.id === id ? { ...e, rsHashAfter } : e));
  writeJsonState('hazard-acks.json', patched);
}

// ---------------------------------------------------------------------------
// Ack Epoch
// ---------------------------------------------------------------------------

/**
 * Return the current ack_epoch: the total count of governance acknowledgment
 * events — T3 capability acknowledgments plus hazard pair confirmations.
 *
 * This value is passed to SnapshotBuilder.build() as the `ackEpoch` parameter
 * so that RS_hash changes after each acknowledgment event of either kind.
 * Both T3 acks (acknowledgments.json) and hazard acks (hazard-acks.json)
 * contribute, ensuring the snapshot hash binds to the full governance record.
 *
 * The epoch is strictly monotonically increasing: each write appends one event
 * to the respective file, incrementing the total count.
 *
 * @returns Count of T3 ack events + hazard ack events (0 if none recorded)
 *
 * @see packages/kernel/src/snapshot/builder.ts (ackEpoch parameter)
 * @see docs/specs/formal_governance.md §5 (I4, I5)
 * @see docs/specs/formal_governance.md §8 (hazard composition model)
 */
export function getAckEpoch(): number {
  return readAckEvents().length + readHazardAckEvents().length;
}
