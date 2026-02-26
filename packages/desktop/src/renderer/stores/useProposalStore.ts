import { create } from 'zustand';
import type {
  Proposal,
  ProposalSummary,
  ProposalStatus,
  ProposalChange,
  ApproveResult,
} from '@/types/api';

type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: string };

interface ProposalStore {
  filter: ProposalStatus | null;
  proposals: LoadState<ProposalSummary[]>;
  selectedId: string | null;
  selectedProposal: LoadState<Proposal | null>;
  typedAckPhrase: string;
  // Confirmed hazard pairs — only pairs from the proposal's own hazardsTriggered are ever added.
  // Values are CapabilityType strings (no cast needed — they come from the proposal itself).
  confirmedHazardPairs: ReadonlyArray<readonly [string, string]>;
  lastActionResult: ApproveResult | null;
  actionError: string | null;
  actionInProgress: boolean;

  setFilter: (filter: ProposalStatus | null) => void;
  fetchProposals: () => Promise<void>;
  selectProposal: (id: string) => Promise<void>;
  clearSelection: () => void;
  setTypedAckPhrase: (phrase: string) => void;
  confirmHazardPair: (pair: readonly [string, string]) => void;
  approve: (id: string) => Promise<void>;
  reject: (id: string, reason?: string) => Promise<void>;
  propose: (
    change: ProposalChange,
    createdBy: { kind: 'human' | 'agent' | 'cli' | 'ui'; id: string },
  ) => Promise<void>;
}

export const useProposalStore = create<ProposalStore>((set, get) => ({
  filter: null,
  proposals: { status: 'idle' },
  selectedId: null,
  selectedProposal: { status: 'idle' },
  typedAckPhrase: '',
  confirmedHazardPairs: [],
  lastActionResult: null,
  actionError: null,
  actionInProgress: false,

  setFilter: (filter) => {
    set({ filter, proposals: { status: 'idle' } });
  },

  fetchProposals: async () => {
    const { filter } = get();
    set({ proposals: { status: 'loading' } });
    try {
      const data = await window.archon.proposals.list(
        filter !== null ? { status: filter } : undefined,
      );
      set({ proposals: { status: 'loaded', data } });
    } catch (e) {
      set({ proposals: { status: 'error', error: String(e) } });
    }
  },

  selectProposal: async (id) => {
    set({
      selectedId: id,
      selectedProposal: { status: 'loading' },
      typedAckPhrase: '',
      confirmedHazardPairs: [],
      lastActionResult: null,
      actionError: null,
    });
    try {
      const data = await window.archon.proposals.get(id);
      set({ selectedProposal: { status: 'loaded', data: data ?? null } });
    } catch (e) {
      set({ selectedProposal: { status: 'error', error: String(e) } });
    }
  },

  clearSelection: () => {
    set({
      selectedId: null,
      selectedProposal: { status: 'idle' },
      typedAckPhrase: '',
      confirmedHazardPairs: [],
      lastActionResult: null,
      actionError: null,
    });
  },

  setTypedAckPhrase: (phrase) => set({ typedAckPhrase: phrase }),

  confirmHazardPair: (pair) => {
    const { confirmedHazardPairs } = get();
    // Idempotent — do not add duplicates.
    const already = confirmedHazardPairs.some(
      ([a, b]) => a === pair[0] && b === pair[1],
    );
    if (!already) {
      set({ confirmedHazardPairs: [...confirmedHazardPairs, pair] });
    }
  },

  approve: async (id) => {
    const { typedAckPhrase, confirmedHazardPairs } = get();
    set({ actionInProgress: true, actionError: null, lastActionResult: null });
    try {
      const result = await window.archon.proposals.approve(id, {
        typedAckPhrase: typedAckPhrase !== '' ? typedAckPhrase : undefined,
        // Q6 resolution: values come from proposal.preview.hazardsTriggered which are
        // CapabilityType strings at the kernel level. Safe cast in main process handler.
        hazardConfirmedPairs: confirmedHazardPairs as ReadonlyArray<readonly [string, string]>,
      });
      set({
        lastActionResult: result,
        typedAckPhrase: '',
        confirmedHazardPairs: [],
        actionInProgress: false,
      });
      await get().fetchProposals();
    } catch (e) {
      set({ actionError: String(e), actionInProgress: false });
    }
  },

  reject: async (id, reason) => {
    set({ actionInProgress: true, actionError: null });
    try {
      await window.archon.proposals.reject(id, reason);
      set({ actionInProgress: false });
      get().clearSelection();
      await get().fetchProposals();
    } catch (e) {
      set({ actionError: String(e), actionInProgress: false });
    }
  },

  propose: async (change, createdBy) => {
    await window.archon.proposals.propose(change, createdBy);
    await get().fetchProposals();
  },
}));
