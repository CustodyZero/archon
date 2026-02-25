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
export { NodeExecAdapter } from './adapters/exec.js';

// Logging
export { FileLogSink } from './logging/file-log-sink.js';

// StateIO — project-scoped I/O abstraction (P4: Project Scoping)
export type { StateIO } from './state/state-io.js';
export { FileStateIO, MemoryStateIO } from './state/state-io.js';

// Project store — project CRUD, migration, active project resolution (P4)
export type { ProjectRecord, ProjectIndex } from './state/project-store.js';
export {
  getArchonDir,
  projectIndexPath,
  projectDir,
  projectStateIO,
  createProject,
  listProjects,
  getActiveProject,
  getActiveProjectId,
  selectProject,
  getOrCreateDefaultProject,
  migrateLegacyState,
} from './state/project-store.js';

// P5: ARCHON_HOME resolution with precedence chain
export type { ResolveArchonHomeOptions } from './home.js';
export {
  resolveArchonHome,
  getOsConfigPath,
  readArchonHomeFromConfig,
  writeArchonHomeToConfig,
} from './home.js';

// P5: Per-project encrypted secret store (AES-256-GCM; device + portable modes)
export { SecretStore } from './secrets/secret-store.js';

// ULID generator (used as event_id in append-only log entries)
export { ulid } from './logging/ulid.js';

// P6: LogReader — dedupe-on-read for JSONL logs
export type { LogEvent, LogReadStats, LogReadResult } from './logging/log-reader.js';
export { readLog } from './logging/log-reader.js';

// P6: DriftDetector — sync conflict signal detection
export type { DriftStatusLevel, DriftReason, DriftMetrics, DriftStatus } from './logging/drift-detector.js';
export { DRIFT_REASONS, detectDrift } from './logging/drift-detector.js';

// P6: PortabilityStatus — per-project portability contract
export type {
  SecretsMode,
  SuggestedSync,
  PortabilityReason,
  PortabilityDetails,
  PortabilityInput,
  PortabilityStatus,
} from './portability/portability.js';
export { PORTABILITY_REASONS, getPortabilityStatus } from './portability/portability.js';
