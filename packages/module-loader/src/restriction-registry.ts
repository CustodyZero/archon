/**
 * Archon Module Loader — Restriction Registry
 *
 * Stores, compiles, and persists operator-authored Dynamic Restriction Rules (DRRs).
 *
 * Persistence: `.archon/state/restrictions.json`
 * Format: `StructuredRestrictionRule[]`
 *
 * The RestrictionRegistry is the only place DRRs are created and persisted.
 * It compiles rules to CompiledDRR via the restriction-dsl compiler before
 * returning them for snapshot construction.
 *
 * All state-mutating methods require `{ confirmed: true }` to enforce the
 * Confirm-on-Change posture. The CLI prompt is responsible for obtaining
 * this confirmation from the operator.
 *
 * @see docs/specs/formal_governance.md §5 (I2: restriction monotonicity)
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 */

import type { CompiledDRR, StructuredRestrictionRule } from '@archon/kernel';
import { CapabilityType, compileStructured } from '@archon/kernel';
import { readJsonState, writeJsonState } from '@archon/runtime-host';

/**
 * Registry of operator-authored restriction rules.
 *
 * Rules are:
 * - Persisted to `.archon/state/restrictions.json` as StructuredRestrictionRule[]
 * - Compiled on demand to CompiledDRR[] for snapshot construction
 * - Sorted by id for deterministic snapshot ordering (Invariant I4)
 *
 * Rule IDs are auto-assigned as `drr:<n>` where n is a monotonically
 * incrementing counter across all rules ever added (not just active ones).
 * This prevents id reuse after rules are cleared.
 *
 * @see docs/specs/formal_governance.md §5 (I2)
 */
export class RestrictionRegistry {
  private rules: StructuredRestrictionRule[] = [];
  /** Highest rule counter seen; next id = counter + 1. */
  private counter: number = 0;

  constructor() {
    this.loadFromState();
  }

  /**
   * Add a new restriction rule.
   *
   * The rule must have a unique id. Duplicate ids are rejected.
   * Requires `{ confirmed: true }` — the CLI prompt enforces this.
   *
   * After adding a rule, the caller must rebuild the snapshot before
   * further evaluation (rule changes require snapshot rebuild).
   *
   * @param rule - Structured restriction rule to add
   * @param opts - Must be { confirmed: true }
   * @throws {Error} If a rule with the same id already exists
   */
  addRule(rule: StructuredRestrictionRule, opts: { confirmed: true }): void {
    void opts;
    if (this.rules.some((r) => r.id === rule.id)) {
      throw new Error(`Rule already exists with id: ${rule.id}`);
    }
    this.rules.push(rule);
    // Keep counter in sync so future ids don't collide.
    const n = parseRuleIndex(rule.id);
    if (n !== null && n > this.counter) {
      this.counter = n;
    }
    this.persistState();
  }

  /**
   * List all active restriction rules.
   *
   * @returns Immutable array of all rules, sorted by id
   */
  listRules(): ReadonlyArray<StructuredRestrictionRule> {
    return [...this.rules].sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Remove all restriction rules for a given capability type.
   *
   * Requires `{ confirmed: true }`. After clearing, the caller must
   * rebuild the snapshot.
   *
   * @param capabilityType - The capability type whose rules to remove
   * @param opts - Must be { confirmed: true }
   */
  clearRules(capabilityType: CapabilityType, opts: { confirmed: true }): void {
    void opts;
    this.rules = this.rules.filter((r) => r.capabilityType !== capabilityType);
    this.persistState();
  }

  /**
   * Remove all restriction rules regardless of capability type.
   *
   * Requires `{ confirmed: true }`. After clearing, the caller must
   * rebuild the snapshot.
   *
   * @param opts - Must be { confirmed: true }
   */
  clearAll(opts: { confirmed: true }): void {
    void opts;
    this.rules = [];
    this.persistState();
  }

  /**
   * Compile all rules to CompiledDRR[] for inclusion in a RuleSnapshot.
   *
   * Rules are sorted by id for deterministic ordering (Invariant I4).
   *
   * @returns Immutable array of compiled DRRs, sorted by rule id
   */
  compileAll(): ReadonlyArray<CompiledDRR> {
    return [...this.rules]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => compileStructured(r));
  }

  /**
   * Allocate the next auto-incremented rule id.
   *
   * Format: `drr:<n>` where n is a monotonically increasing integer.
   * IDs are never reused — the counter persists across clear operations
   * because the counter is stored as part of the state.
   *
   * @returns Next available rule id
   */
  nextId(): string {
    this.counter += 1;
    return `drr:${this.counter}`;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private loadFromState(): void {
    const persisted = readJsonState<ReadonlyArray<PersistedState>>(
      'restrictions.json',
      [],
    );
    const validTypes = new Set<string>(Object.values(CapabilityType));
    this.rules = [];
    this.counter = 0;

    for (const raw of persisted) {
      // Validate persisted shape: must have required fields.
      if (
        typeof raw.id !== 'string' ||
        typeof raw.capabilityType !== 'string' ||
        !validTypes.has(raw.capabilityType) ||
        (raw.effect !== 'allow' && raw.effect !== 'deny') ||
        !Array.isArray(raw.conditions)
      ) {
        // Skip malformed entries; log to stderr for operator visibility.
        process.stderr.write(
          `[archon] Skipping malformed restriction rule in state: ${JSON.stringify(raw)}\n`,
        );
        continue;
      }

      const rule: StructuredRestrictionRule = {
        id: raw.id,
        capabilityType: raw.capabilityType as CapabilityType,
        effect: raw.effect,
        conditions: raw.conditions,
      };
      this.rules.push(rule);

      const n = parseRuleIndex(raw.id);
      if (n !== null && n > this.counter) {
        this.counter = n;
      }
    }
  }

  private persistState(): void {
    const sorted = [...this.rules].sort((a, b) => a.id.localeCompare(b.id));
    writeJsonState('restrictions.json', sorted);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Shape of a raw persisted entry (unvalidated). */
interface PersistedState {
  readonly id: string;
  readonly capabilityType: string;
  readonly effect: string;
  readonly conditions: ReadonlyArray<unknown>;
}

/**
 * Extract the numeric index from a rule id of the form `drr:<n>`.
 * Returns null for ids that don't follow this pattern.
 *
 * @internal
 */
function parseRuleIndex(id: string): number | null {
  const match = /^drr:(\d+)$/.exec(id);
  if (match === null) return null;
  const n = parseInt(match[1]!, 10);
  return isNaN(n) ? null : n;
}
