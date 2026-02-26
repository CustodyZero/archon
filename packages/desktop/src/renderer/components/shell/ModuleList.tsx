import { useKernelStore } from '@/stores/useKernelStore';
import { ModuleItem } from './ModuleItem';

export function ModuleList() {
  const modules = useKernelStore((s) => s.modules);

  if (modules.status !== 'loaded') return null;

  return (
    <div
      style={{
        padding: '0.75rem 0',
        flex: 1,
        overflowY: 'auto',
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
        <span>Modules</span>
        <button
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            lineHeight: 1,
            padding: 0,
            transition: 'color 0.15s',
            fontFamily: 'var(--font-mono)',
          }}
          title="Manage modules"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--blue)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)';
          }}
        >
          ⊕
        </button>
      </div>

      {modules.data.map((m) => (
        <ModuleItem key={m.module_id} module={m} />
      ))}
    </div>
  );
}
