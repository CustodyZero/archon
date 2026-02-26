import { useEffect } from 'react';
import { AppShell } from './components/shell/AppShell.js';
import { useKernelStore } from './stores/useKernelStore.js';
import { useProposalStore } from './stores/useProposalStore.js';
import { useProjectStore } from './stores/useProjectStore.js';

// Polling intervals (Phase 10).
// Proposals: 5s — agents create proposals via CLI; operator must see them promptly.
// Kernel status: 30s — changes only on approve/reject, which reloads proposals anyway.
// No push model in v0.1; polling is the accepted solution until ipcMain.emit is added.
const PROPOSAL_POLL_MS = 5_000;
const KERNEL_STATUS_POLL_MS = 30_000;

export function App() {
  const fetchAll = useKernelStore((s) => s.fetchAll);
  const fetchStatus = useKernelStore((s) => s.fetchStatus);
  const fetchProposals = useProposalStore((s) => s.fetchProposals);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  // Initial data load on mount
  useEffect(() => {
    void fetchAll();
    void fetchProposals();
    void fetchProjects();
  }, [fetchAll, fetchProposals, fetchProjects]);

  // Phase 10: Poll proposals every 5s so agent-submitted proposals surface promptly.
  useEffect(() => {
    const id = setInterval(() => {
      void fetchProposals();
    }, PROPOSAL_POLL_MS);
    return () => clearInterval(id);
  }, [fetchProposals]);

  // Phase 10: Poll kernel status every 30s to keep RS hash and counts fresh.
  useEffect(() => {
    const id = setInterval(() => {
      void fetchStatus();
    }, KERNEL_STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  return <AppShell />;
}
