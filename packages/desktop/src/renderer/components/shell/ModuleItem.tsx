import type { ModuleSummary } from '@/types/api';

interface ModuleItemProps {
  module: ModuleSummary;
}

export function ModuleItem({ module }: ModuleItemProps) {
  const isEnabled = module.status === 'Enabled';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.35rem 0.75rem 0.35rem 1.5rem',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--mid)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {/* Status dot — on: green filled; off: transparent with muted2 border */}
      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          flexShrink: 0,
          background: isEnabled ? 'var(--green)' : 'transparent',
          border: isEnabled ? 'none' : '1px solid var(--muted2)',
        }}
      />
      <span
        style={{
          fontSize: '0.68rem',
          color: isEnabled ? 'var(--text)' : 'var(--text-dim)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {module.module_name}
      </span>
    </div>
  );
}
