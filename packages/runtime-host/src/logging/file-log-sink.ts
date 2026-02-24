/**
 * Archon Runtime Host — File-backed Decision Log Sink
 *
 * Implements the LogSink interface from @archon/kernel by appending JSONL
 * entries to `.archon/logs/decisions.jsonl`.
 *
 * The kernel owns the LogSink interface and DecisionLogger class.
 * The runtime host owns this concrete implementation — the only place
 * in the system that writes decision log entries to disk.
 *
 * This sink is synchronous: the write completes before the call returns,
 * guaranteeing the log entry is durable before execution proceeds.
 *
 * @see docs/specs/architecture.md §6 (logging and replay)
 */

import type { LogSink, DecisionLog } from '@archon/kernel';
import { appendDecisionLog } from '../state/store.js';

/**
 * Appends each decision log entry as a single JSONL line to
 * `.archon/logs/decisions.jsonl`.
 *
 * The file path and directory creation are handled by appendDecisionLog()
 * in the state store.
 */
export class FileLogSink implements LogSink {
  append(entry: DecisionLog): void {
    appendDecisionLog({
      timestamp: entry.timestamp,
      agentId: entry.agent_id,
      capabilityType: entry.proposed_action.type,
      decision: entry.decision,
      reason: entry.triggered_rules.join(', ') || 'none',
      rs_hash: entry.rs_hash,
      input_hash: entry.input_hash,
    });
  }
}
