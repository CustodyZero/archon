/**
 * Archon Kernel — Log Sink Interface
 *
 * Defines the injection point for decision log persistence.
 *
 * The kernel owns the contract (this interface) and the DecisionLogger class.
 * Concrete implementations live in the runtime host layer and are injected
 * at construction time — the kernel never writes to disk directly.
 *
 * This separation preserves the kernel's side-effect-free property:
 * the validation engine, snapshot builder, and gate are all pure or
 * deterministic logic. All I/O is pushed to the runtime host boundary.
 *
 * @see docs/specs/architecture.md §6 (logging and replay)
 */

import type { DecisionLog } from '../types/decision.js';

/**
 * A sink that receives and persists decision log entries.
 *
 * The sink append() call must complete (synchronously or asynchronously)
 * before the gate returns — the log entry must be durable before execution
 * proceeds. Implementations must not silently discard entries.
 *
 * The kernel calls append() in a finally block so that it fires regardless
 * of whether the handler succeeds or throws.
 */
export interface LogSink {
  append(entry: DecisionLog): void;
}
