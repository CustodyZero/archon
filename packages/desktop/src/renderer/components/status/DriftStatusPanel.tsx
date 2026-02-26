import { useKernelStore } from '@/stores/useKernelStore';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';

const DRIFT_COLORS: Record<string, string> = {
  none: 'var(--green)',
  unknown: 'var(--amber)',
  conflict: 'var(--red)',
};

export function DriftStatusPanel() {
  const driftState = useKernelStore((s) => s.drift);
  const fetchDrift = useKernelStore((s) => s.fetchDrift);

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
          Drift Status
        </div>
        <button
          onClick={() => void fetchDrift()}
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
      {driftState.status === 'loading' && <LoadingIndicator />}
      {driftState.status === 'loaded' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 12,
              padding: '10px 14px',
              background: 'var(--mid)',
              border: '1px solid var(--border)',
              borderRadius: 4,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: DRIFT_COLORS[driftState.data.status] ?? 'var(--text-dim)',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: DRIFT_COLORS[driftState.data.status] ?? 'var(--text)',
                letterSpacing: '0.04em',
              }}
            >
              {driftState.data.status}
            </span>
          </div>
          {driftState.data.reasons.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
              <div
                style={{
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontSize: 10,
                }}
              >
                Reasons
              </div>
              {driftState.data.reasons.map((r) => (
                <div
                  key={r}
                  style={{
                    color: 'var(--amber)',
                    fontFamily: 'var(--font-mono)',
                    marginBottom: 3,
                  }}
                >
                  \u00b7 {r}
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              fontSize: 11,
            }}
          >
            {Object.entries(driftState.data.metrics).map(([key, val]) => (
              <div
                key={key}
                style={{
                  background: 'var(--dark)',
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                  padding: '8px 10px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    color: 'var(--text)',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 16,
                    marginBottom: 3,
                  }}
                >
                  {val}
                </div>
                <div
                  style={{
                    color: 'var(--text-dim)',
                    fontSize: 10,
                    letterSpacing: '0.04em',
                  }}
                >
                  {key.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
