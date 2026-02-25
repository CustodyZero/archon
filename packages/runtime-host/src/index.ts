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
