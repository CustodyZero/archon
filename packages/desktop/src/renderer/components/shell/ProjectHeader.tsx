import { useProjectStore } from '@/stores/useProjectStore';
import { useKernelStore } from '@/stores/useKernelStore';
import { useProposalStore } from '@/stores/useProposalStore';
import { useNavigationStore } from '@/stores/useNavigationStore';

const metaItemStyle: React.CSSProperties = {
  fontSize: '0.6rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
};

const labelStyle: React.CSSProperties = { color: 'var(--text-dim)' };

const sepStyle: React.CSSProperties = {
  width: 1,
  height: 16,
  background: 'var(--border2)',
};

const headerBtnStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  background: 'transparent',
  border: '1px solid var(--border2)',
  color: 'var(--text-dim)',
  padding: '0.3rem 0.75rem',
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  ...headerBtnStyle,
  borderColor: 'var(--blue-dim)',
  color: 'var(--blue)',
  background: 'rgba(79,195,247,0.05)',
};

export function ProjectHeader() {
  const { projects, activeProjectId } = useProjectStore();
  const statusState = useKernelStore((s) => s.status);
  const driftState = useKernelStore((s) => s.drift);
  const proposals = useProposalStore((s) => s.proposals);
  const setView = useNavigationStore((s) => s.setView);

  const activeProject =
    projects.status === 'loaded'
      ? projects.data.find((p) => p.id === activeProjectId)
      : null;

  const moduleCount =
    statusState.status === 'loaded' ? statusState.data.moduleCount : '—';

  const pendingCount =
    proposals.status === 'loaded'
      ? proposals.data.filter((p) => p.status === 'pending').length
      : 0;

  const driftLevel =
    driftState.status === 'loaded' ? driftState.data.status : 'none';

  const driftColor =
    driftLevel === 'conflict'
      ? 'var(--red)'
      : driftLevel === 'unknown'
        ? 'var(--amber)'
        : 'var(--green)';

  const projectName = activeProject?.name ?? 'No project';

  return (
    <div
      style={{
        height: 'var(--header-h)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 1.2rem',
        gap: '1.5rem',
        flexShrink: 0,
        background: 'var(--dark)',
      }}
    >
      {/* Project name — Bebas Neue */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.1rem',
          letterSpacing: '0.1em',
          color: 'var(--white)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 180,
        }}
      >
        {projectName}
      </div>

      <div style={sepStyle} />

      {/* Meta items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={metaItemStyle}>
          <span style={labelStyle}>Modules</span>
          <span style={{ color: 'var(--blue)' }}>{moduleCount}</span>
        </div>
        <div style={metaItemStyle}>
          <span style={labelStyle}>Pending</span>
          <span style={{ color: pendingCount > 0 ? 'var(--amber)' : 'var(--text)' }}>
            {pendingCount}
          </span>
        </div>
        <div style={metaItemStyle}>
          <span style={labelStyle}>Drift</span>
          <span style={{ color: driftColor }}>
            {driftLevel === 'none' ? 'None' : driftLevel}
          </span>
        </div>
      </div>

      {/* Right-side actions */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
        <button
          style={headerBtnStyle}
          onClick={() => setView('status')}
          onMouseEnter={(e) => {
            Object.assign((e.currentTarget as HTMLElement).style, {
              borderColor: 'var(--blue-dim)',
              color: 'var(--blue)',
            });
          }}
          onMouseLeave={(e) => {
            Object.assign((e.currentTarget as HTMLElement).style, {
              borderColor: 'var(--border2)',
              color: 'var(--text-dim)',
            });
          }}
        >
          Status
        </button>
        <button
          style={headerBtnStyle}
          onClick={() => setView('modules')}
          onMouseEnter={(e) => {
            Object.assign((e.currentTarget as HTMLElement).style, {
              borderColor: 'var(--blue-dim)',
              color: 'var(--blue)',
            });
          }}
          onMouseLeave={(e) => {
            Object.assign((e.currentTarget as HTMLElement).style, {
              borderColor: 'var(--border2)',
              color: 'var(--text-dim)',
            });
          }}
        >
          Modules
        </button>
        <button
          style={primaryBtnStyle}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              'rgba(79,195,247,0.12)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              'rgba(79,195,247,0.05)';
          }}
        >
          + Agent
        </button>
      </div>
    </div>
  );
}
