import type { ProposalStatus } from '@/types/api';

interface FilterBarProps {
  filter: ProposalStatus | null;
  onFilter: (f: ProposalStatus | null) => void;
}

const FILTERS: Array<{ label: string; value: ProposalStatus | null }> = [
  { label: 'All', value: null },
  { label: 'Pending', value: 'pending' },
  { label: 'Applied', value: 'applied' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Failed', value: 'failed' },
];

export function FilterBar({ filter, onFilter }: FilterBarProps) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
      {FILTERS.map(({ label, value }) => (
        <button
          key={label}
          onClick={() => onFilter(value)}
          style={{
            background: filter === value ? 'var(--blue-glow)' : 'transparent',
            border: '1px solid',
            borderColor: filter === value ? 'var(--blue)' : 'var(--border)',
            color: filter === value ? 'var(--blue)' : 'var(--text-dim)',
            cursor: 'pointer',
            padding: '3px 10px',
            fontSize: 11,
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em',
            transition: 'all 0.1s',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
