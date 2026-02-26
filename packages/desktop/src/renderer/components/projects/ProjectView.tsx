import { useEffect } from 'react';
import { useProjectStore } from '@/stores/useProjectStore';
import { ProjectCard } from './ProjectCard';
import { NewProjectForm } from './NewProjectForm';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorState } from '@/components/common/ErrorState';

export function ProjectView() {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const selectProject = useProjectStore((s) => s.selectProject);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  useEffect(() => {
    if (projects.status === 'idle') void fetchProjects();
  }, [projects.status, fetchProjects]);

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
          PROJECTS
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          Each project has isolated state, restrictions, and resource configuration.
        </div>
      </div>
      {projects.status === 'loading' && <LoadingIndicator />}
      {projects.status === 'error' && (
        <ErrorState message={projects.error} onRetry={() => void fetchProjects()} />
      )}
      {projects.status === 'loaded' && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
              marginBottom: 4,
            }}
          >
            {projects.data.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                isActive={p.id === activeProjectId}
                onSelect={() => void selectProject(p.id)}
              />
            ))}
          </div>
          <NewProjectForm />
        </>
      )}
    </div>
  );
}
