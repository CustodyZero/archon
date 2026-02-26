import type { ProjectRecord } from '@/types/api';

interface ProjectCardProps {
  project: ProjectRecord;
  isActive: boolean;
  onSelect: () => void;
}

export function ProjectCard({ project, isActive, onSelect }: ProjectCardProps) {
  const createdAt = project.createdAt.substring(0, 10);

  return (
    <div
      style={{
        background: isActive ? 'var(--blue-glow)' : 'var(--mid)',
        border: `1px solid ${isActive ? 'var(--panel-border)' : 'var(--border)'}`,
        borderRadius: 4,
        padding: '14px 16px',
        borderLeft: `2px solid ${isActive ? 'var(--blue)' : 'var(--border)'}`,
        transition: 'all 0.1s',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{ fontSize: 13, color: 'var(--light)', fontWeight: 500, marginBottom: 3 }}
          >
            {project.name}
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.03em',
            }}
          >
            {project.id.slice(0, 16)}\u2026
          </div>
        </div>
        {isActive && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--blue)',
              border: '1px solid var(--panel-border)',
              padding: '2px 8px',
              borderRadius: 10,
              letterSpacing: '0.06em',
            }}
          >
            ACTIVE
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        Created {createdAt}
      </div>
      {!isActive && (
        <button
          onClick={onSelect}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            padding: '4px 12px',
            fontSize: 11,
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
            transition: 'all 0.1s',
          }}
        >
          Select
        </button>
      )}
    </div>
  );
}
