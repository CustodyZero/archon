/**
 * @archon/module-loader
 *
 * Archon module loader — manifest validation, hash verification, and
 * module registry.
 *
 * @see docs/specs/module_api.md
 * @see docs/specs/formal_governance.md §12 (taxonomy soundness)
 */

export type { LoadResult } from './loader.js';
export { ModuleLoader, computeManifestHash } from './loader.js';

export { ModuleRegistry } from './registry.js';
export { ModuleValidator } from './validator.js';
export { CapabilityRegistry } from './capability-registry.js';
export { RestrictionRegistry } from './restriction-registry.js';

// Acknowledgment state store — project-scoped via AckStore class (P4)
export type { AckEvent, HazardAckEvent } from './ack-store.js';
export { AckStore } from './ack-store.js';

// Governance APIs — previewEnableCapability, applyEnableCapability
export type {
  ActiveHazardPair,
  ApplyOptions,
  ApplyResult,
  PreviewResult,
} from './capability-governance.js';
export {
  previewEnableCapability,
  applyEnableCapability,
} from './capability-governance.js';

// Proposal Queue — human-approval workflow for governance operations
export type { SecretStoreApplier } from './proposal-queue.js';
export { ProposalQueue } from './proposal-queue.js';

// P5: Resource configuration store — per-project FS roots, net allowlist, exec root, secrets epoch
export { ResourceConfigStore } from './resource-config-store.js';

// P8.1: Snapshot factory — single call site for snapshot construction from registry state
export type { SnapshotForProjectParams } from './snapshot-factory.js';
export { buildSnapshotForProject } from './snapshot-factory.js';

// P8.1: GateExecutionSurface — concrete ExecutionSurface implementation using ExecutionGate
export { GateExecutionSurface } from './execution-surface.js';

// S6: Composition graph validation — set-level acyclicity and referential integrity checks
export type { CompositionValidationResult } from './composition-validator.js';
export { validateCompositionGraph } from './composition-validator.js';
