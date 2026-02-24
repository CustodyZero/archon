/**
 * Archon Runtime Host — State Persistence Store
 *
 * This is the only place in the runtime host permitted to read/write
 * `.archon/state/*.json` and `.archon/logs/decisions.jsonl`.
 *
 * State directory resolution:
 * - ARCHON_STATE_DIR env var, if set
 * - Otherwise `.archon/` relative to process.cwd()
 *
 * Uses synchronous fs for CLI simplicity. Creates directories on first write.
 * Module adapters use the FsAdapter (packages/runtime-host/src/adapters/fs.ts).
 * State persistence is a separate concern from module I/O.
 *
 * @see docs/specs/architecture.md §3 (snapshot model)
 */

import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Decision Log Entry Shape (for JSONL output)
// ---------------------------------------------------------------------------

export interface DecisionLogEntry {
  readonly timestamp: string;
  readonly agentId: string;
  readonly capabilityType: string;
  readonly decision: string;
  readonly reason: string;
  readonly rs_hash: string;
  readonly input_hash: string;
}

// ---------------------------------------------------------------------------
// State Directory
// ---------------------------------------------------------------------------

/**
 * Returns the resolved state directory path.
 *
 * Reads ARCHON_STATE_DIR from the environment. If unset, defaults to
 * `.archon/` in process.cwd(). All state files live under this directory.
 */
export function getStateDir(): string {
  return process.env['ARCHON_STATE_DIR'] ?? join(process.cwd(), '.archon');
}

// ---------------------------------------------------------------------------
// JSON State I/O
// ---------------------------------------------------------------------------

/**
 * Read a JSON state file from the state directory.
 *
 * Returns `fallback` if the file does not exist or cannot be parsed.
 * Type parameter T is trusted — callers are responsible for schema
 * compatibility of the persisted JSON.
 *
 * @param filename - Filename within the state directory (e.g. 'enabled-modules.json')
 * @param fallback - Value to return if file is absent or unreadable
 */
export function readJsonState<T>(filename: string, fallback: T): T {
  const stateDir = getStateDir();
  const filePath = join(stateDir, 'state', filename);
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    // ENOENT (file not found) and SyntaxError (corrupted JSON) are recoverable —
    // the state file simply does not exist yet or is unparseable; return fallback.
    // All other errors (e.g., EACCES — permission denied) are rethrown because
    // they indicate a real environment problem that the operator must address.
    if (err instanceof SyntaxError || isNodeError(err, 'ENOENT')) {
      return fallback;
    }
    throw err;
  }
}

/**
 * Write a JSON state file to the state directory.
 *
 * Creates the state subdirectory if it does not exist.
 * Writes canonical JSON (sorted keys for reproducibility).
 *
 * @param filename - Filename within the state directory (e.g. 'enabled-modules.json')
 * @param value - Value to serialize and persist
 */
export function writeJsonState<T>(filename: string, value: T): void {
  const stateDir = getStateDir();
  const subDir = join(stateDir, 'state');
  mkdirSync(subDir, { recursive: true });
  const filePath = join(subDir, filename);
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Narrow an unknown error to a Node.js errno exception with a specific code. */
function isNodeError(err: unknown, code: string): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === code
  );
}

// ---------------------------------------------------------------------------
// Decision Log (JSONL append)
// ---------------------------------------------------------------------------

/**
 * Append a single decision log entry to `.archon/logs/decisions.jsonl`.
 *
 * Each entry is one JSON object per line (JSONL format).
 * Creates the logs directory if it does not exist.
 * Writes are synchronous to guarantee the log entry is durable before
 * the gate returns.
 *
 * @param entry - The decision log entry to append
 */
export function appendDecisionLog(entry: DecisionLogEntry): void {
  const stateDir = getStateDir();
  const logsDir = join(stateDir, 'logs');
  mkdirSync(logsDir, { recursive: true });
  const logPath = join(logsDir, 'decisions.jsonl');
  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Proposal Event Log (JSONL append)
// ---------------------------------------------------------------------------

/**
 * Shape of a proposal lifecycle event written to proposal-events.jsonl.
 *
 * Each event records a single state transition (created, applied, rejected,
 * failed). The `proposalId` ties the event to the full proposal record in
 * proposals.json.
 */
export interface ProposalEventEntry {
  /** ISO 8601 timestamp of this event. */
  readonly timestamp: string;
  /** UUIDv4 of the proposal. */
  readonly proposalId: string;
  /** State transition: created | applied | rejected | failed */
  readonly event: 'created' | 'applied' | 'rejected' | 'failed';
  /** Kind of change in the proposal (for quick scanning). */
  readonly kind: string;
  /** Actor who triggered this event. */
  readonly actorKind: string;
  readonly actorId: string;
  /** RS_hash after apply (present only for event='applied'). */
  readonly rsHashAfter?: string | null;
  /** Error message (present only for event='failed'). */
  readonly error?: string;
}

/**
 * Append a single proposal lifecycle event to `.archon/logs/proposal-events.jsonl`.
 *
 * Each entry is one JSON object per line (JSONL format).
 * Creates the logs directory if it does not exist.
 * Writes are synchronous to guarantee the log entry is durable.
 *
 * @param entry - The proposal event entry to append
 */
export function appendProposalEvent(entry: ProposalEventEntry): void {
  const stateDir = getStateDir();
  const logsDir = join(stateDir, 'logs');
  mkdirSync(logsDir, { recursive: true });
  const logPath = join(logsDir, 'proposal-events.jsonl');
  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
}
