import { create } from 'zustand';
import type { ProjectRecord } from '@/types/api';

type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: string };

interface ProjectStore {
  projects: LoadState<ProjectRecord[]>;
  activeProjectId: string | null;
  fetchProjects: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  selectProject: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: { status: 'idle' },
  activeProjectId: null,

  fetchProjects: async () => {
    set({ projects: { status: 'loading' } });
    try {
      const [projects, current] = await Promise.all([
        window.archon.projects.list(),
        window.archon.projects.current(),
      ]);
      set({
        projects: { status: 'loaded', data: projects },
        activeProjectId: current?.id ?? null,
      });
    } catch (e) {
      set({ projects: { status: 'error', error: String(e) } });
    }
  },

  createProject: async (name) => {
    await window.archon.projects.create(name);
    await get().fetchProjects();
  },

  selectProject: async (id) => {
    await window.archon.projects.select(id);
    set({ activeProjectId: id });
    await get().fetchProjects();
  },
}));
