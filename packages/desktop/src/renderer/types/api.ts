/**
 * Renderer-side type re-exports.
 *
 * All type imports for renderer code come from here.
 * Using `import type` ensures these are erased at compile time by Vite/esbuild —
 * no Electron, Node.js, or workspace runtime code is ever bundled into the renderer.
 *
 * Components and stores should import from '@/types/api' (via the '@' alias).
 */
export type {
  KernelStatus,
  ModuleSummary,
  CapabilityEntry,
  ArchonApi,
} from '../../preload/index.js';

export type {
  ProposalSummary,
  Proposal,
  ProposalStatus,
  ProposalChange,
  ApproveResult,
  RiskTier,
} from '@archon/kernel';

export type {
  DriftStatus,
  PortabilityStatus,
  ProjectRecord,
} from '@archon/runtime-host';
