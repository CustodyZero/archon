/**
 * @archon/kernel
 *
 * Archon enforcement kernel — validation engine, execution gate,
 * snapshot builder, decision log, and adapter interfaces.
 *
 * @see docs/specs/architecture.md
 * @see docs/specs/formal_governance.md
 */

// Types
export type {
  CapabilityDescriptor,
  CapabilityInstance,
  CapabilitySet,
  HazardPair,
} from './types/capability.js';

export {
  CapabilityType,
  RISK_TIER_ORDER,
  RiskTier,
} from './types/capability.js';

export type { DecisionLog } from './types/decision.js';
export { DecisionOutcome } from './types/decision.js';

export type {
  ModuleHash,
  ModuleIdentity,
  ModuleManifest,
} from './types/module.js';
export { ModuleStatus } from './types/module.js';

export type {
  Condition,
  RestrictionIR,
  RestrictionPredicate,
  SuggestedProfile,
} from './types/restriction.js';
export { ConditionOperator } from './types/restriction.js';

export type {
  RuleSnapshot,
  RuleSnapshotHash,
  SnapshotBuilder,
} from './types/snapshot.js';

// Adapter interfaces
export type {
  AdapterCallContext,
  ExecAdapter,
  FilesystemAdapter,
  KernelAdapters,
  MessagingAdapter,
  NetworkAdapter,
  SecretsAdapter,
  UIAdapter,
} from './adapters/index.js';

// Implementations
export { ValidationEngine } from './validation/engine.js';
export { ExecutionGate, computeInputHash } from './validation/gate.js';
export { SnapshotBuilder as SnapshotBuilderImpl } from './snapshot/builder.js';
export { DecisionLogger } from './logging/decision-log.js';

// Re-export shared types from restriction-dsl so consumers only need @archon/kernel
export { NotImplementedError } from '@archon/restriction-dsl';
export type {
  ParseError,
  ParseResult,
  ValidationError,
  ValidationResult,
} from '@archon/restriction-dsl';
