import { create } from 'zustand';

export type ActiveView =
  | 'proposals'
  | 'modules'
  | 'capabilities'
  | 'restrictions'
  | 'projects'
  | 'status';

interface NavigationState {
  activeView: ActiveView;
  setView: (view: ActiveView) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeView: 'proposals',
  setView: (view) => set({ activeView: view }),
}));
