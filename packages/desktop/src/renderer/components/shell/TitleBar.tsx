import { useKernelStore } from '@/stores/useKernelStore';
import { useProjectStore } from '@/stores/useProjectStore';

export function TitleBar() {
  const statusState = useKernelStore((s) => s.status);
  const { projects, activeProjectId } = useProjectStore();

  const rsHash =
    statusState.status === 'loaded' ? statusState.data.rsHash.slice(0, 8) : '—';

  const activeProject =
    projects.status === 'loaded'
      ? projects.data.find((p) => p.id === activeProjectId)
      : null;

  return (
    <div
      style={
        {
          height: 'var(--titlebar)',
          background: 'var(--black)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '80px',
          paddingRight: '1rem',
          WebkitAppRegion: 'drag',
          flexShrink: 0,
          userSelect: 'none',
        } as React.CSSProperties
      }
    >
      {/* Left-aligned title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', lineHeight: 1, color: 'var(--blue)', letterSpacing: '0.2em', transform: 'translateY(3px)', display: 'inline-block' }}>ARCHON</span>
        <span style={{ fontSize: '0.65rem', lineHeight: 1, color: 'var(--border2)', margin: '0 0.6rem' }}>—</span>
        {activeProject !== null && activeProject !== undefined && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', lineHeight: 1, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{activeProject.name}</span>
        )}
      </div>

      {/* Drag region spacer */}
      <div style={{ flex: 1 }} />

      {/* RS snapshot hash — right side, no-drag */}
      <div
        style={
          {
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            WebkitAppRegion: 'no-drag',
            fontSize: '0.58rem',
            color: 'var(--blue-dim)',
            letterSpacing: '0.06em',
          } as React.CSSProperties
        }
      >
        <span style={{ color: 'var(--text-dim)' }}>RS</span>
        <span>{rsHash}</span>
      </div>
    </div>
  );
}
