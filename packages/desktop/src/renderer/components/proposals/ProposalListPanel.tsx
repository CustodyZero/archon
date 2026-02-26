import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProposalStore } from '@/stores/useProposalStore';
import { FilterBar } from './FilterBar';
import { ProposalListItem } from './ProposalListItem';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';

export function ProposalListPanel() {
  const filter = useProposalStore((s) => s.filter);
  const setFilter = useProposalStore((s) => s.setFilter);
  const proposals = useProposalStore((s) => s.proposals);
  const selectedId = useProposalStore((s) => s.selectedId);
  const fetchProposals = useProposalStore((s) => s.fetchProposals);
  const selectProposal = useProposalStore((s) => s.selectProposal);

  useEffect(() => {
    void fetchProposals();
  }, [filter, fetchProposals]);

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <FilterBar filter={filter} onFilter={setFilter} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {proposals.status === 'loading' && <LoadingIndicator />}
        {proposals.status === 'loaded' && proposals.data.length === 0 && (
          <EmptyState message="No proposals" />
        )}
        {proposals.status === 'loaded' && (
          <AnimatePresence initial={false}>
            {proposals.data.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <ProposalListItem
                  proposal={p}
                  isSelected={p.id === selectedId}
                  onSelect={() => void selectProposal(p.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {proposals.status === 'error' && (
          <ErrorState message={proposals.error} onRetry={() => void fetchProposals()} />
        )}
      </div>
    </div>
  );
}
