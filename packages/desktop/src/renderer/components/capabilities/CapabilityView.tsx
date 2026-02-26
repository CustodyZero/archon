import { useEffect, useState } from 'react';
import type { RiskTier } from '@/types/api';
import { useKernelStore } from '@/stores/useKernelStore';
import { TierFilter } from './TierFilter';
import { CapabilityTable } from './CapabilityTable';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorState } from '@/components/common/ErrorState';

export function CapabilityView() {
  const capabilities = useKernelStore((s) => s.capabilities);
  const fetchCapabilities = useKernelStore((s) => s.fetchCapabilities);
  const [tierFilter, setTierFilter] = useState<RiskTier | null>(null);

  useEffect(() => {
    if (capabilities.status === 'idle') void fetchCapabilities();
  }, [capabilities.status, fetchCapabilities]);

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
          CAPABILITIES
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          19 capability types across 4 risk tiers. Toggle changes are proposed — operator approval
          required.
        </div>
      </div>
      <TierFilter selected={tierFilter} onSelect={setTierFilter} />
      {capabilities.status === 'loading' && <LoadingIndicator />}
      {capabilities.status === 'error' && (
        <ErrorState message={capabilities.error} onRetry={() => void fetchCapabilities()} />
      )}
      {capabilities.status === 'loaded' && (
        <CapabilityTable capabilities={capabilities.data} tierFilter={tierFilter} />
      )}
    </div>
  );
}
