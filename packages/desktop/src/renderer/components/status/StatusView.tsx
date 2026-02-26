import { useEffect } from 'react';
import { useKernelStore } from '@/stores/useKernelStore';
import { KernelStatusPanel } from './KernelStatusPanel';
import { DriftStatusPanel } from './DriftStatusPanel';
import { PortabilityStatusPanel } from './PortabilityStatusPanel';

export function StatusView() {
  const fetchStatus = useKernelStore((s) => s.fetchStatus);
  const fetchDrift = useKernelStore((s) => s.fetchDrift);
  const fetchPortability = useKernelStore((s) => s.fetchPortability);

  useEffect(() => {
    void fetchStatus();
    void fetchDrift();
    void fetchPortability();
  }, [fetchStatus, fetchDrift, fetchPortability]);

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
          STATUS
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          Kernel state, audit integrity, and portability.
        </div>
      </div>
      <div style={{ maxWidth: 680 }}>
        <KernelStatusPanel />
        <DriftStatusPanel />
        <PortabilityStatusPanel />
      </div>
    </div>
  );
}
