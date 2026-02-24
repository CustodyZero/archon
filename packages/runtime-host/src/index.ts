/**
 * @archon/runtime-host
 *
 * Archon runtime host — side-effectful adapter implementations and state
 * persistence. Depends on @archon/kernel (interfaces); implements concrete
 * platform-specific behavior using Node.js built-ins.
 *
 * The kernel package defines interfaces; this package provides implementations.
 * No kernel code imports from this package.
 *
 * @see docs/specs/architecture.md §4 (execution gate — runtime host layer)
 * @see docs/specs/module_api.md §6 (kernel-provided adapters)
 */

// Adapter implementations
export { FsAdapter } from './adapters/fs.js';

// Logging
export { FileLogSink } from './logging/file-log-sink.js';

// State persistence (used by module-loader registries)
export { getStateDir, readJsonState, writeJsonState, appendDecisionLog, appendProposalEvent } from './state/store.js';
export type { DecisionLogEntry, ProposalEventEntry } from './state/store.js';
