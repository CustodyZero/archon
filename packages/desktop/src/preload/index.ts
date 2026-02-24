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
  ApproveResult,
} from '@archon/kernel';

// ---------------------------------------------------------------------------
// Archon API surface exposed to the renderer
// ---------------------------------------------------------------------------

/**
 * The window.archon API exposed to renderer scripts via contextBridge.
 *
 * All methods return Promises that resolve to typed values or reject with
 * an Error. The renderer must not assume any specific timing.
 */
export interface ArchonApi {
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
  };
}

// Expose the API to the renderer.
contextBridge.exposeInMainWorld('archon', {
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
  },
} satisfies ArchonApi);
