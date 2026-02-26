import { create } from 'zustand';
import type { KernelStatus, ModuleSummary, CapabilityEntry, DriftStatus, PortabilityStatus } from '@/types/api';

type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: string };

interface KernelStore {
  status: LoadState<KernelStatus>;
  modules: LoadState<ModuleSummary[]>;
  capabilities: LoadState<CapabilityEntry[]>;
  restrictions: LoadState<unknown[]>;
  drift: LoadState<DriftStatus>;
  portability: LoadState<PortabilityStatus>;

  fetchAll: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchModules: () => Promise<void>;
  fetchCapabilities: () => Promise<void>;
  fetchRestrictions: () => Promise<void>;
  fetchDrift: () => Promise<void>;
  fetchPortability: () => Promise<void>;
}

export const useKernelStore = create<KernelStore>((set) => ({
  status: { status: 'idle' },
  modules: { status: 'idle' },
  capabilities: { status: 'idle' },
  restrictions: { status: 'idle' },
  drift: { status: 'idle' },
  portability: { status: 'idle' },

  fetchAll: async () => {
    const store = useKernelStore.getState();
    await Promise.all([
      store.fetchStatus(),
      store.fetchModules(),
      store.fetchCapabilities(),
      store.fetchRestrictions(),
      store.fetchDrift(),
      store.fetchPortability(),
    ]);
  },

  fetchStatus: async () => {
    set({ status: { status: 'loading' } });
    try {
      const data = await window.archon.status();
      set({ status: { status: 'loaded', data } });
    } catch (e) {
      set({ status: { status: 'error', error: String(e) } });
    }
  },

  fetchModules: async () => {
    set({ modules: { status: 'loading' } });
    try {
      const data = await window.archon.modules.list();
      set({ modules: { status: 'loaded', data } });
    } catch (e) {
      set({ modules: { status: 'error', error: String(e) } });
    }
  },

  fetchCapabilities: async () => {
    set({ capabilities: { status: 'loading' } });
    try {
      const data = await window.archon.capabilities.list();
      set({ capabilities: { status: 'loaded', data } });
    } catch (e) {
      set({ capabilities: { status: 'error', error: String(e) } });
    }
  },

  fetchRestrictions: async () => {
    set({ restrictions: { status: 'loading' } });
    try {
      const data = await window.archon.restrictions.list();
      set({ restrictions: { status: 'loaded', data } });
    } catch (e) {
      set({ restrictions: { status: 'error', error: String(e) } });
    }
  },

  fetchDrift: async () => {
    set({ drift: { status: 'loading' } });
    try {
      const data = await window.archon.drift.status();
      set({ drift: { status: 'loaded', data } });
    } catch (e) {
      set({ drift: { status: 'error', error: String(e) } });
    }
  },

  fetchPortability: async () => {
    set({ portability: { status: 'loading' } });
    try {
      const data = await window.archon.portability.status();
      set({ portability: { status: 'loaded', data } });
    } catch (e) {
      set({ portability: { status: 'error', error: String(e) } });
    }
  },
}));
