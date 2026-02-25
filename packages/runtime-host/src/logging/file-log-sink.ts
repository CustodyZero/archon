/**
 * Archon Runtime Host — File-backed Decision Log Sink
 *
 * Implements the LogSink interface from @archon/kernel by appending JSONL
 * entries to the active project's `logs/decisions.jsonl`.
 *
 * The kernel owns the LogSink interface and DecisionLogger class.
 * The runtime host owns this concrete implementation — the only place
 * in the system that writes decision log entries to disk.
 *
 * Decision logs are project-scoped (P4): each project writes to its own
 * `<projectDir>/logs/decisions.jsonl` via the injected StateIO. Logs from
 * different projects never intermix.
 *
 * This sink is synchronous: the write completes before the call returns,
 * guaranteeing the log entry is durable before execution proceeds.
 *
 * @see docs/specs/architecture.md §6 (logging and replay)
 */

import type { LogSink, DecisionLog } from '@archon/kernel';
import type { StateIO } from '../state/state-io.js';
import { ulid } from './ulid.js';

/**
 * Appends each decision log entry as a single JSONL line to the project's
 * `logs/decisions.jsonl` via the injected project-scoped StateIO.
 */
export class FileLogSink implements LogSink {
  constructor(private readonly stateIO: StateIO) {}

  append(entry: DecisionLog): void {
    const line = JSON.stringify({
      event_id: ulid(),
      timestamp: entry.timestamp,
      agentId: entry.agent_id,
      capabilityType: entry.proposed_action.type,
      decision: entry.decision,
      reason: entry.triggered_rules.join(', ') || 'none',
      rs_hash: entry.rs_hash,
      input_hash: entry.input_hash,
    });
    this.stateIO.appendLine('decisions.jsonl', line);
  }
}
