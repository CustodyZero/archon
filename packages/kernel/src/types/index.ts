/**
 * Archon Kernel — Type Exports
 *
 * Re-exports all kernel types from a single entry point.
 * No logic lives in this file.
 */

export type {
  CapabilityDescriptor,
  CapabilityInstance,
  CapabilitySet,
  HazardPair,
} from './capability.js';

export { CapabilityType, RISK_TIER_ORDER, RiskTier } from './capability.js';

export type { DecisionLog } from './decision.js';
export { DecisionOutcome } from './decision.js';

export type { ModuleHash, ModuleIdentity, ModuleManifest } from './module.js';
export { ModuleStatus } from './module.js';

export type {
  Condition,
  RestrictionIR,
  RestrictionPredicate,
  SuggestedProfile,
} from './restriction.js';

export { ConditionOperator } from './restriction.js';

export type {
  RuleSnapshot,
  RuleSnapshotHash,
  SnapshotBuilder,
} from './snapshot.js';

export type {
  ApproveResult,
  DeleteSecretChange,
  DisableCapabilityChange,
  DisableModuleChange,
  EnableCapabilityChange,
  EnableModuleChange,
  Proposal,
  ProposalChange,
  ProposalKind,
  ProposalPreview,
  ProposalStatus,
  ProposalSummary,
  ProposedBy,
  ProposerKind,
  SetProjectExecRootChange,
  SetProjectFsRootsChange,
  SetProjectNetAllowlistChange,
  SetRestrictionsChange,
  SetSecretChange,
  SetSecretModeChange,
} from './proposal.js';

export type { FsRoot, FsRootPerm, ResourceConfig } from './resource.js';
export { EMPTY_RESOURCE_CONFIG } from './resource.js';
