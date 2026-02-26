import { useKernelStore } from '@/stores/useKernelStore';
import { useProposalStore } from '@/stores/useProposalStore';

export function StatusBar() {
  const statusState = useKernelStore((s) => s.status);
  const driftState = useKernelStore((s) => s.drift);
  const proposals = useProposalStore((s) => s.proposals);

  const rsHash =
    statusState.status === 'loaded' ? statusState.data.rsHash.slice(0, 8) : '…';

  const moduleCount =
    statusState.status === 'loaded' ? statusState.data.moduleCount : '—';

  const capabilityCount =
    statusState.status === 'loaded' ? statusState.data.capabilityCount : '—';

  const pendingCount =
    proposals.status === 'loaded'
      ? proposals.data.filter((p) => p.status === 'pending').length
      : 0;

  const driftLevel =
    driftState.status === 'loaded' ? driftState.data.status : null;

  const itemStyle: React.CSSProperties = {
    fontSize: '0.58rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    cursor: 'pointer',
    transition: 'color 0.15s',
  };

  return (
    <div
      style={{
        height: 'var(--statusbar-h)',
        background: 'var(--blue-deep)',
        borderTop: '1px solid var(--blue-dim)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 0.8rem',
        gap: '1.5rem',
        flexShrink: 0,
      }}
    >
      {/* ◈ Enforcing — always shown; kernel enforces by design */}
      <div style={{ ...itemStyle, color: 'var(--blue-bright)' }}>
        <span>◈</span>
        <span>Enforcing</span>
      </div>

      {/* RS hash */}
      <div style={itemStyle}>
        <span>RS</span>
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {rsHash}
        </span>
      </div>

      {/* Pending proposals — amber when non-zero */}
      {pendingCount > 0 && (
        <div style={{ ...itemStyle, color: 'var(--amber)' }}>
          <span>{pendingCount} pending</span>
        </div>
      )}

      {/* Drift indicator — only when drift is detected */}
      {driftLevel !== null && driftLevel !== 'none' && (
        <div
          style={{
            ...itemStyle,
            color: driftLevel === 'conflict' ? 'var(--red)' : 'var(--amber)',
          }}
        >
          <span>Drift: {driftLevel}</span>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right side: agents, decisions, license */}
      <div style={itemStyle}>
        <span>{moduleCount} modules</span>
      </div>
      <div style={itemStyle}>
        <span>{capabilityCount} capabilities</span>
      </div>
      <div style={{ ...itemStyle, cursor: 'default' }}>
        <span>Apache 2.0</span>
      </div>
    </div>
  );
}
