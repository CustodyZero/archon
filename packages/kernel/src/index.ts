/**
 * @archon/kernel
 *
 * Archon enforcement kernel — validation engine, execution gate,
 * snapshot builder, decision log, and adapter interfaces.
 *
 * This package is side-effect free. It contains no imports of node:fs,
 * node:child_process, node:net, fetch, or any other I/O API.
 * node:crypto is used for deterministic hashing (pure computation, not I/O).
 *
 * Concrete adapter implementations and state persistence live in
 * @archon/runtime-host.
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

export type { DecisionLog, EvaluationResult } from './types/decision.js';
export { DecisionOutcome } from './types/decision.js';

export type {
  ModuleHash,
  ModuleIdentity,
  ModuleManifest,
} from './types/module.js';
export { ModuleStatus } from './types/module.js';

export type {
  Condition,
  CompiledDRR,
  DRRCondition,
  DRREffect,
  RestrictionIR,
  RestrictionPredicate,
  StructuredRestrictionRule,
  SuggestedProfile,
} from './types/restriction.js';
export { ConditionOperator } from './types/restriction.js';

export type {
  RuleSnapshot,
  RuleSnapshotHash,
  SnapshotBuilder,
} from './types/snapshot.js';

// Adapter interfaces (no implementations — those live in runtime-host)
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

// Log sink interface (implementation lives in runtime-host)
export type { LogSink } from './logging/log-sink.js';

// Implementations
export { ValidationEngine } from './validation/engine.js';
export { ExecutionGate, computeInputHash } from './validation/gate.js';
export type { ModuleHandler } from './validation/gate.js';
export { SnapshotBuilder as SnapshotBuilderImpl } from './snapshot/builder.js';
export { DecisionLogger } from './logging/decision-log.js';

// Re-export shared types and functions from restriction-dsl.
// Consumers of @archon/kernel do not need a direct dependency on restriction-dsl.
export { NotImplementedError } from '@archon/restriction-dsl';
export type {
  ParseError,
  ParseResult,
  ValidationError,
  ValidationResult,
} from '@archon/restriction-dsl';

// DRR compiler functions — exported so module-loader and CLI can compile rules
// without a direct dependency on restriction-dsl.
export { compileDSL, compileStructured, matchesGlob } from '@archon/restriction-dsl';
