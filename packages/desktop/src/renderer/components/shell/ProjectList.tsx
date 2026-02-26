import { useProjectStore } from '@/stores/useProjectStore';
import { useNavigationStore } from '@/stores/useNavigationStore';
import { ProjectItem } from './ProjectItem';

export function ProjectList() {
  const { projects, activeProjectId, selectProject } = useProjectStore();
  const setView = useNavigationStore((s) => s.setView);

  if (projects.status !== 'loaded') return null;

  return (
    <div
      style={{
        padding: '0.75rem 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Section label */}
      <div
        style={{
          fontSize: '0.55rem',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
          padding: '0 0.75rem 0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Projects</span>
        <button
          onClick={() => setView('projects')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            lineHeight: 1,
            padding: 0,
            transition: 'color 0.15s',
            fontFamily: 'var(--font-mono)',
          }}
          title="New project"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--blue)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)';
          }}
        >
          +
        </button>
      </div>

      {projects.data.map((p) => (
        <ProjectItem
          key={p.id}
          project={p}
          isActive={p.id === activeProjectId}
          onSelect={() => void selectProject(p.id)}
        />
      ))}
    </div>
  );
}
