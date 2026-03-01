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
 * StaticKernelService — realistic static data for the first-pass TUI.
 *
 * Project: sentinel-build · T2 · RS: f8a9b0c1 · epoch 6
 * All data matches archon-cli-visual.html.
 */
export class StaticKernelService implements IKernelService {
  async getStatus(): Promise<KernelStatus> {
    return {
      rsHash: 'f8a9b0c1',
      engineVersion: '0.1.0',
      ackEpoch: 6,
      tier: 'T2',
      moduleCount: 5,
      capabilityCount: 7,
      restrictionCount: 14,
      decisionsToday: 249,
      decisionsPermit: 243,
      decisionsDeny: 4,
      decisionsEscalate: 2,
      drift: 'none',
      portability: true,
    }
  }

  async listModules(): Promise<ModuleEntry[]> {
    return [
      {
        moduleId: 'module-filesystem',
        moduleName: 'module-filesystem',
        version: '0.1.0',
        tier: 'T2',
        enabled: true,
        ackRequired: false,
      },
      {
        moduleId: 'module-exec',
        moduleName: 'module-exec',
        version: '0.1.0',
        tier: 'T3',
        enabled: true,
        ackRequired: true,
      },
      {
        moduleId: 'module-agent-spawn',
        moduleName: 'module-agent-spawn',
        version: '0.1.0',
        tier: 'T2',
        enabled: true,
        ackRequired: false,
      },
      {
        moduleId: 'module-net-egress',
        moduleName: 'module-net-egress',
        version: '0.1.0',
        tier: 'T3',
        enabled: false,
        ackRequired: false,
      },
      {
        moduleId: 'module-secrets',
        moduleName: 'module-secrets',
        version: '0.1.0',
        tier: 'T3',
        enabled: false,
        ackRequired: false,
      },
    ]
  }

  async listCapabilities(): Promise<CapabilityEntry[]> {
    return [
      { type: 'fs.read', tier: 'T1', enabled: true },
      { type: 'fs.write', tier: 'T2', enabled: true },
      { type: 'fs.list', tier: 'T1', enabled: true },
      { type: 'fs.delete', tier: 'T3', enabled: false },
      { type: 'exec.run', tier: 'T3', enabled: true },
      { type: 'net.fetch.http', tier: 'T2', enabled: true },
      { type: 'net.egress.raw', tier: 'T3', enabled: false },
      { type: 'agent.spawn', tier: 'T2', enabled: true },
      { type: 'agent.message', tier: 'T1', enabled: true },
      { type: 'secrets.use', tier: 'T3', enabled: false },
      { type: 'secrets.inject_env', tier: 'T3', enabled: false },
      { type: 'llm.infer', tier: 'T1', enabled: true },
    ]
  }

  async listProposals(filter?: { status?: string }): Promise<ProposalSummary[]> {
    const all: ProposalSummary[] = [
      {
        id: 'a1b2c3d4-0000-0000-0000-000000000000',
        shortId: 'a1b2c3d4',
        status: 'pending',
        kind: 'enable_capability',
        changeSummary: 'fs.write → T2',
        createdById: 'architect-agent',
        createdAt: '09:14:22',
      },
      {
        id: 'e5f6a7b8-0000-0000-0000-000000000000',
        shortId: 'e5f6a7b8',
        status: 'applied',
        kind: 'enable_module',
        changeSummary: 'module-agent-spawn',
        createdById: 'architect-agent',
        createdAt: '09:12:05',
      },
      {
        id: 'c9d0e1f2-0000-0000-0000-000000000000',
        shortId: 'c9d0e1f2',
        status: 'rejected',
        kind: 'enable_capability',
        changeSummary: 'net.egress.raw → T3',
        createdById: 'architect-agent',
        createdAt: '09:10:31',
      },
    ]

    if (filter?.status !== undefined) {
      return all.filter(p => p.status === filter.status)
    }
    return all
  }

  async getProposal(id: string): Promise<ProposalDetail | null> {
    const proposals: ProposalDetail[] = [
      {
        id: 'a1b2c3d4-0000-0000-0000-000000000000',
        shortId: 'a1b2c3d4',
        status: 'pending',
        kind: 'enable_capability',
        changeSummary: 'fs.write → T2',
        createdById: 'architect-agent',
        createdAt: '09:14:22',
        requiresTypedAck: false,
        hazardsTriggered: [],
      },
      {
        id: 'e5f6a7b8-0000-0000-0000-000000000000',
        shortId: 'e5f6a7b8',
        status: 'applied',
        kind: 'enable_module',
        changeSummary: 'module-agent-spawn',
        createdById: 'architect-agent',
        createdAt: '09:12:05',
        requiresTypedAck: false,
        hazardsTriggered: [],
      },
      {
        id: 'c9d0e1f2-0000-0000-0000-000000000000',
        shortId: 'c9d0e1f2',
        status: 'rejected',
        kind: 'enable_capability',
        changeSummary: 'net.egress.raw → T3',
        createdById: 'architect-agent',
        createdAt: '09:10:31',
        requiresTypedAck: true,
        requiredAckPhrase: 'I ACCEPT T3 RISK (net.egress.raw)',
        hazardsTriggered: [['llm.infer', 'net.egress.raw']],
      },
    ]

    // Match by full ID or 8-char prefix
    return (
      proposals.find(p => p.id === id || p.shortId === id) ?? null
    )
  }

  async listProjects(): Promise<ProjectInfo[]> {
    return [
      {
        id: 'sentinel-build',
        name: 'sentinel-build',
        isActive: true,
      },
    ]
  }

  async getActiveProject(): Promise<ProjectInfo | null> {
    return {
      id: 'sentinel-build',
      name: 'sentinel-build',
      isActive: true,
    }
  }

  async getDriftStatus(): Promise<DriftStatus> {
    return {
      status: 'none',
      reasons: [],
    }
  }

  async getPortabilityStatus(): Promise<PortabilityStatus> {
    return {
      portable: true,
      reasonCodes: [],
    }
  }

  async getDecisionLog(_limit?: number): Promise<DecisionLogEntry[]> {
    return [
      {
        timestamp: '09:18:51',
        outcome: 'Permit',
        action: 'exec.run → /usr/bin/tsc --build',
        agentId: 'architect-agent',
      },
      {
        timestamp: '09:18:47',
        outcome: 'Permit',
        action: 'fs.write → /src/kernel/validation/engine.ts',
        agentId: 'architect-agent',
      },
      {
        timestamp: '09:18:44',
        outcome: 'Permit',
        action: 'fs.read → /docs/spec/formal_governance.md',
        agentId: 'spec-agent',
      },
      {
        timestamp: '09:17:31',
        outcome: 'Deny',
        action: 'net.egress.raw → api.github.com',
        agentId: 'architect-agent',
      },
      {
        timestamp: '09:16:02',
        outcome: 'Permit',
        action: 'agent.spawn → spec-agent (T1 profile)',
        agentId: 'operator',
      },
      {
        timestamp: '09:16:01',
        outcome: 'Permit',
        action: 'agent.spawn → architect-agent (T2 profile)',
        agentId: 'operator',
      },
    ]
  }

  async getAgents(): Promise<AgentRecord[]> {
    return [
      {
        agentId: 'architect-agent',
        tier: 'T2',
        status: 'active',
        decisionsToday: 186,
        lastAction: 'exec.run → /usr/bin/tsc --build',
        pendingProposals: 1,
      },
      {
        agentId: 'spec-agent',
        tier: 'T1',
        status: 'active',
        decisionsToday: 63,
        lastAction: 'fs.read → /docs/spec/formal_governance.md',
        pendingProposals: 0,
      },
    ]
  }
}
