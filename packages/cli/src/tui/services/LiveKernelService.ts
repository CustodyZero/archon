import type {
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

/**
 * LiveKernelService — specification document for the next implementation pass.
 *
 * Every method documents exactly which kernel call it will make.
 * All method bodies throw until wired in the next pass.
 *
 * To activate: change services/index.ts to export new LiveKernelService().
 */
export class LiveKernelService implements IKernelService {
  // buildRuntime() → buildSnapshot(rt) → snapshot.rsHash + ackEpoch + enabled modules/capabilities
  async getStatus(): Promise<KernelStatus> {
    throw new Error('LiveKernelService.getStatus: not yet implemented')
  }

  // buildRuntime() → rt.registry.listModules()
  async listModules(): Promise<ModuleEntry[]> {
    throw new Error('LiveKernelService.listModules: not yet implemented')
  }

  // buildRuntime() → rt.capabilityRegistry.listCapabilities()
  async listCapabilities(): Promise<CapabilityEntry[]> {
    throw new Error('LiveKernelService.listCapabilities: not yet implemented')
  }

  // buildRuntime() → new ProposalQueue(rt.stateIO).listProposals(filter)
  async listProposals(_filter?: { status?: string }): Promise<ProposalSummary[]> {
    throw new Error('LiveKernelService.listProposals: not yet implemented')
  }

  // buildRuntime() → new ProposalQueue(rt.stateIO).getProposal(id)
  async getProposal(_id: string): Promise<ProposalDetail | null> {
    throw new Error('LiveKernelService.getProposal: not yet implemented')
  }

  // listProjects(getArchonDir())
  async listProjects(): Promise<ProjectInfo[]> {
    throw new Error('LiveKernelService.listProjects: not yet implemented')
  }

  // getActiveProject(getArchonDir())
  async getActiveProject(): Promise<ProjectInfo | null> {
    throw new Error('LiveKernelService.getActiveProject: not yet implemented')
  }

  // buildRuntime() → rt.stateIO.readLogRaw('decisions.jsonl') → detectDrift(readLog(raw))
  async getDriftStatus(): Promise<DriftStatus> {
    throw new Error('LiveKernelService.getDriftStatus: not yet implemented')
  }

  // buildRuntime() → getPortabilityStatus(rt.stateIO, getArchonDir())
  async getPortabilityStatus(): Promise<PortabilityStatus> {
    throw new Error('LiveKernelService.getPortabilityStatus: not yet implemented')
  }

  // buildRuntime() → new DecisionLogger(rt.stateIO).query({ limit })
  async getDecisionLog(_limit?: number): Promise<DecisionLogEntry[]> {
    throw new Error('LiveKernelService.getDecisionLog: not yet implemented')
  }

  // buildRuntime() → rt.stateIO.readJsonState('agents.json') (agent registry, not yet implemented in kernel)
  async getAgents(): Promise<AgentRecord[]> {
    throw new Error('LiveKernelService.getAgents: not yet implemented')
  }
}
