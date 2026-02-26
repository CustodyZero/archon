import { useEffect } from 'react';
import { useKernelStore } from '@/stores/useKernelStore';
import { RestrictionRuleCard } from './RestrictionRuleCard';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';

export function RestrictionView() {
  const restrictions = useKernelStore((s) => s.restrictions);
  const fetchRestrictions = useKernelStore((s) => s.fetchRestrictions);

  useEffect(() => {
    if (restrictions.status === 'idle') void fetchRestrictions();
  }, [restrictions.status, fetchRestrictions]);

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            letterSpacing: '0.08em',
            color: 'var(--light)',
            marginBottom: 4,
          }}
        >
          RESTRICTIONS
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          Dynamic Restriction Rules (DRR) — compile-time validated. Manage via CLI or proposals.
        </div>
      </div>
      {restrictions.status === 'loading' && <LoadingIndicator />}
      {restrictions.status === 'error' && (
        <ErrorState
          message={restrictions.error}
          onRetry={() => void fetchRestrictions()}
        />
      )}
      {restrictions.status === 'loaded' && restrictions.data.length === 0 && (
        <EmptyState message="No restriction rules active. Use 'archon restrict add' to add rules." />
      )}
      {restrictions.status === 'loaded' && restrictions.data.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {restrictions.data.map((rule, i) => (
            <RestrictionRuleCard
              key={i}
              rule={rule as Record<string, unknown>}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
