import type { CSSProperties } from 'react';
import { useKernelStore } from '@/stores/useKernelStore';
import { RSHashDisplay } from './RSHashDisplay';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';

export function KernelStatusPanel() {
  const statusState = useKernelStore((s) => s.status);
  const fetchStatus = useKernelStore((s) => s.fetchStatus);

  const rowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '160px 1fr',
    gap: '4px 12px',
    marginBottom: 8,
    fontSize: 12,
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Kernel Status
        </div>
        <button
          onClick={() => void fetchStatus()}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            padding: '3px 10px',
            fontSize: 10,
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Refresh
        </button>
      </div>
      {statusState.status === 'loading' && <LoadingIndicator />}
      {statusState.status === 'loaded' && (
        <>
          <RSHashDisplay hash={statusState.data.rsHash} />
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-dim)' }}>Engine version</span>
            <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {statusState.data.engineVersion}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-dim)' }}>Ack epoch</span>
            <span
              style={{
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {statusState.data.ackEpoch}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-dim)' }}>Enabled modules</span>
            <span style={{ color: 'var(--text)' }}>{statusState.data.moduleCount}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-dim)' }}>Enabled capabilities</span>
            <span style={{ color: 'var(--text)' }}>{statusState.data.capabilityCount}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-dim)' }}>Active restrictions</span>
            <span style={{ color: 'var(--text)' }}>{statusState.data.restrictionCount}</span>
          </div>
        </>
      )}
    </div>
  );
}
