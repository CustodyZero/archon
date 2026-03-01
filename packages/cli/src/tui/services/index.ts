import type { IKernelService } from './IKernelService.js'
import { StaticKernelService } from './StaticKernelService.js'

/**
 * kernelService — the single service instance used by the entire TUI.
 *
 * This is the only line that changes when switching to live kernel data:
 *   export const kernelService: IKernelService = new LiveKernelService()
 *
 * Nothing else in the TUI references StaticKernelService or LiveKernelService directly.
 */
export const kernelService: IKernelService = new StaticKernelService()

export type {
  IKernelService,
  KernelStatus,
  ModuleEntry,
  CapabilityEntry,
  ProposalSummary,
  ProposalDetail,
  ProjectInfo,
  DriftStatus,
  PortabilityStatus,
  DecisionLogEntry,
  AgentRecord,
} from './IKernelService.js'
