import type { ProposalSummary } from '@/types/api';

interface ProposalListItemProps {
  proposal: ProposalSummary;
  isSelected: boolean;
  onSelect: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--amber)',
  applied: 'var(--green)',
  rejected: 'var(--red)',
  failed: 'var(--red)',
};

export function ProposalListItem({ proposal, isSelected, onSelect }: ProposalListItemProps) {
  const statusColor = STATUS_COLORS[proposal.status] ?? 'var(--text-dim)';
  const createdAt = proposal.createdAt.substring(0, 16).replace('T', ' ');

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '10px 16px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border)',
        background: isSelected ? 'var(--blue-glow)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--blue)' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span style={{ color: statusColor, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          {proposal.status}
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>·</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.04em' }}>
          {proposal.kind}
        </span>
      </div>
      <div style={{ color: 'var(--text)', fontSize: 12, marginBottom: 4, lineHeight: 1.3 }}>
        {proposal.changeSummary}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>
          {proposal.createdBy.kind}:{proposal.createdBy.id}
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{createdAt}</span>
      </div>
    </div>
  );
}
