/**
 * Archon Desktop — Preload Script
 *
 * Runs in a privileged context before the renderer page is loaded.
 * Exposes a restricted set of IPC-backed APIs to the renderer via
 * contextBridge.exposeInMainWorld.
 *
 * Security model:
 * - The renderer (web content) has no access to Node.js APIs
 * - All kernel operations pass through ipcRenderer.invoke()
 * - Only the APIs explicitly exposed here are available to the renderer
 * - contextIsolation: true ensures renderer JS cannot access this scope
 *
 * @see docs/specs/architecture.md §4 (validation flow)
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  Proposal,
  ProposalSummary,
  ProposalStatus,
  ProposalChange,
  ApproveResult,
  RiskTier,
} from '@archon/kernel';
import type { DriftStatus, PortabilityStatus, ProjectRecord } from '@archon/runtime-host';

// ---------------------------------------------------------------------------
// Archon API surface exposed to the renderer
// ---------------------------------------------------------------------------

/** Kernel status summary returned by kernel:status. */
export interface KernelStatus {
  rsHash: string;
  engineVersion: string;
  ackEpoch: number;
  moduleCount: number;
  capabilityCount: number;
  restrictionCount: number;
}

/** Module summary returned by kernel:modules:list. */
export interface ModuleSummary {
  module_id: string;
  module_name: string;
  version: string;
  description: string;
  status: string;
}

/** Capability entry returned by kernel:capabilities:list. */
export interface CapabilityEntry {
  type: string;
  tier: RiskTier;
  enabled: boolean;
  ackRequired: boolean;
}

/**
 * The window.archon API exposed to renderer scripts via contextBridge.
 *
 * All methods return Promises that resolve to typed values or reject with
 * an Error. The renderer must not assume any specific timing.
 */
export interface ArchonApi {
  /**
   * Kernel status — RS_hash, engine version, ack epoch, and entity counts.
   */
  status(): Promise<KernelStatus>;

  proposals: {
    /**
     * List proposals, optionally filtered by status.
     * Returns ProposalSummary[] sorted by createdAt descending.
     */
    list(filter?: { status?: ProposalStatus }): Promise<ProposalSummary[]>;

    /**
     * Get a full Proposal by ID.
     * Returns null if not found.
     */
    get(id: string): Promise<Proposal | null>;

    /**
     * Approve and apply a pending proposal.
     * Returns ApproveResult — the caller should check applied === true.
     */
    approve(id: string, opts: {
      typedAckPhrase?: string;
      hazardConfirmedPairs?: ReadonlyArray<readonly [string, string]>;
    }): Promise<ApproveResult>;

    /**
     * Reject a pending proposal.
     * Returns true on success, false if not found or not pending.
     */
    reject(id: string, reason?: string): Promise<boolean>;

    /**
     * Submit a new governance change proposal for operator review.
     * Returns the newly created Proposal.
     */
    propose(
      change: ProposalChange,
      createdBy: { kind: 'human' | 'agent' | 'cli' | 'ui'; id: string },
    ): Promise<Proposal>;
  };

  /** Module registry — list all registered modules. */
  modules: {
    list(): Promise<ModuleSummary[]>;
  };

  /** Capability registry — list all capability types with tier and status. */
  capabilities: {
    list(): Promise<CapabilityEntry[]>;
  };

  /** Restriction registry — list all active Dynamic Restriction Rules. */
  restrictions: {
    list(): Promise<unknown[]>;
  };

  /** Project management. */
  projects: {
    list(): Promise<ProjectRecord[]>;
    current(): Promise<ProjectRecord | null>;
    create(name: string): Promise<ProjectRecord>;
    select(id: string): Promise<void>;
  };

  /** P6: Drift detection — sync conflict signal status for the active project. */
  drift: {
    /**
     * Compute drift status from the active project's log files.
     * Returns DriftStatus with level ('none' | 'unknown' | 'conflict'),
     * reason codes, and raw metrics.
     */
    status(): Promise<DriftStatus>;
  };

  /** P6: Portability status — per-project portability contract. */
  portability: {
    /**
     * Compute portability status for the active project.
     * Returns PortabilityStatus with portable flag, reason codes, and details.
     */
    status(): Promise<PortabilityStatus>;
  };
}

// Expose the API to the renderer.
contextBridge.exposeInMainWorld('archon', {
  status: (): Promise<KernelStatus> =>
    ipcRenderer.invoke('kernel:status'),

  proposals: {
    list: (filter?: { status?: ProposalStatus }): Promise<ProposalSummary[]> =>
      ipcRenderer.invoke('kernel:proposals:list', filter),

    get: (id: string): Promise<Proposal | null> =>
      ipcRenderer.invoke('kernel:proposals:get', id),

    approve: (id: string, opts: {
      typedAckPhrase?: string;
      hazardConfirmedPairs?: ReadonlyArray<readonly [string, string]>;
    }): Promise<ApproveResult> =>
      ipcRenderer.invoke('kernel:proposals:approve', id, opts),

    reject: (id: string, reason?: string): Promise<boolean> =>
      ipcRenderer.invoke('kernel:proposals:reject', id, reason),

    propose: (
      change: ProposalChange,
      createdBy: { kind: 'human' | 'agent' | 'cli' | 'ui'; id: string },
    ): Promise<Proposal> =>
      ipcRenderer.invoke('kernel:proposals:propose', change, createdBy),
  },

  modules: {
    list: (): Promise<ModuleSummary[]> =>
      ipcRenderer.invoke('kernel:modules:list'),
  },

  capabilities: {
    list: (): Promise<CapabilityEntry[]> =>
      ipcRenderer.invoke('kernel:capabilities:list'),
  },

  restrictions: {
    list: (): Promise<unknown[]> =>
      ipcRenderer.invoke('kernel:restrictions:list'),
  },

  projects: {
    list: (): Promise<ProjectRecord[]> =>
      ipcRenderer.invoke('kernel:projects:list'),

    current: (): Promise<ProjectRecord | null> =>
      ipcRenderer.invoke('kernel:projects:current'),

    create: (name: string): Promise<ProjectRecord> =>
      ipcRenderer.invoke('kernel:projects:create', name),

    select: (id: string): Promise<void> =>
      ipcRenderer.invoke('kernel:projects:select', id),
  },

  drift: {
    status: (): Promise<DriftStatus> =>
      ipcRenderer.invoke('kernel:drift:status'),
  },

  portability: {
    status: (): Promise<PortabilityStatus> =>
      ipcRenderer.invoke('kernel:portability:status'),
  },
} satisfies ArchonApi);
