import { useEffect } from 'react';
import { useKernelStore } from '@/stores/useKernelStore';
import { ModuleCard } from './ModuleCard';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';

export function ModuleView() {
  const modules = useKernelStore((s) => s.modules);
  const fetchModules = useKernelStore((s) => s.fetchModules);

  useEffect(() => {
    if (modules.status === 'idle') void fetchModules();
  }, [modules.status, fetchModules]);

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
          MODULES
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          Toggle state changes are proposed — operator approval required.
        </div>
      </div>
      {modules.status === 'loading' && <LoadingIndicator />}
      {modules.status === 'error' && (
        <ErrorState message={modules.error} onRetry={() => void fetchModules()} />
      )}
      {modules.status === 'loaded' && modules.data.length === 0 && (
        <EmptyState message="No modules registered" />
      )}
      {modules.status === 'loaded' && modules.data.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          {modules.data.map((m) => (
            <ModuleCard key={m.module_id} module={m} />
          ))}
        </div>
      )}
    </div>
  );
}
