import { useKernelStore } from '@/stores/useKernelStore';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';

export function PortabilityStatusPanel() {
  const portabilityState = useKernelStore((s) => s.portability);
  const fetchPortability = useKernelStore((s) => s.fetchPortability);

  return (
    <div>
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
          Portability
        </div>
        <button
          onClick={() => void fetchPortability()}
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
      {portabilityState.status === 'loading' && <LoadingIndicator />}
      {portabilityState.status === 'loaded' && (
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
                background: portabilityState.data.portable ? 'var(--green)' : 'var(--red)',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: portabilityState.data.portable ? 'var(--green)' : 'var(--red)',
              }}
            >
              {portabilityState.data.portable ? 'Portable' : 'Device-bound'}
            </span>
          </div>
          {portabilityState.data.reasonCodes.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {portabilityState.data.reasonCodes.map((r) => (
                <div
                  key={r}
                  style={{
                    fontSize: 11,
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
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            <div style={{ marginBottom: 4 }}>
              Path:{' '}
              <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                {portabilityState.data.details.archonHomePath}
              </span>
            </div>
            {portabilityState.data.details.suggestedSync !== undefined && (
              <div>
                Sync:{' '}
                <span style={{ color: 'var(--text)' }}>
                  {portabilityState.data.details.suggestedSync}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
