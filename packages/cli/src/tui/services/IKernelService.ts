/**
 * IKernelService — the single boundary between the TUI and the kernel.
 *
 * All data the shell displays comes through this interface.
 * No component, store, hook, or output function may import from
 * @archon/kernel, @archon/runtime-host, or @archon/module-loader directly.
 */

export interface KernelStatus {
  rsHash: string
  engineVersion: string
  ackEpoch: number
  tier: string
  moduleCount: number
  capabilityCount: number
  restrictionCount: number
  decisionsToday: number
  decisionsPermit: number
  decisionsDeny: number
  decisionsEscalate: number
  drift: 'none' | 'unknown' | 'conflict'
  portability: boolean
}

export interface ModuleEntry {
  moduleId: string
  moduleName: string
  version: string
  tier: string
  enabled: boolean
  ackRequired: boolean
}

export interface CapabilityEntry {
  type: string
  tier: string
  enabled: boolean
}

export interface ProposalSummary {
  id: string
  shortId: string       // first 8 chars
  status: 'pending' | 'applied' | 'rejected' | 'failed'
  kind: string
  changeSummary: string
  createdById: string
  createdAt: string
}

export interface ProposalDetail extends ProposalSummary {
  requiresTypedAck: boolean
  requiredAckPhrase?: string
  hazardsTriggered: Array<[string, string]>
}

export interface ProjectInfo {
  id: string
  name: string
  isActive: boolean
}

export interface DriftStatus {
  status: 'none' | 'unknown' | 'conflict'
  reasons: string[]
}

export interface PortabilityStatus {
  portable: boolean
  reasonCodes: string[]
}

export interface DecisionLogEntry {
  timestamp: string
  outcome: 'Permit' | 'Deny' | 'Escalate'
  action: string
  agentId: string
}

export interface AgentRecord {
  agentId: string
  tier: string
  status: 'active' | 'idle' | 'terminated'
  decisionsToday: number
  lastAction: string | null
  pendingProposals: number
}

export interface IKernelService {
  getStatus(): Promise<KernelStatus>
  listModules(): Promise<ModuleEntry[]>
  listCapabilities(): Promise<CapabilityEntry[]>
  listProposals(filter?: { status?: string }): Promise<ProposalSummary[]>
  getProposal(id: string): Promise<ProposalDetail | null>
  listProjects(): Promise<ProjectInfo[]>
  getActiveProject(): Promise<ProjectInfo | null>
  getDriftStatus(): Promise<DriftStatus>
  getPortabilityStatus(): Promise<PortabilityStatus>
  getDecisionLog(limit?: number): Promise<DecisionLogEntry[]>
  getAgents(): Promise<AgentRecord[]>
}
