import type { Proposal } from '@/types/api';

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending: { bg: 'rgba(212,136,10,0.12)', border: 'rgba(212,136,10,0.3)', text: 'var(--amber)' },
  applied: { bg: 'rgba(129,199,132,0.12)', border: 'rgba(129,199,132,0.3)', text: 'var(--green)' },
  rejected: { bg: 'rgba(207,102,121,0.12)', border: 'rgba(207,102,121,0.3)', text: 'var(--red)' },
  failed:   { bg: 'rgba(207,102,121,0.08)', border: 'rgba(207,102,121,0.2)', text: 'var(--red)' },
};

interface ProposalHeaderProps { proposal: Proposal }

export function ProposalHeader({ proposal }: ProposalHeaderProps) {
  const colors = STATUS_COLORS[proposal.status] ?? STATUS_COLORS['pending']!;
  const createdAt = proposal.createdAt.substring(0, 19).replace('T', ' ');

  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.text,
            padding: '2px 10px',
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {proposal.status}
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11, letterSpacing: '0.04em' }}>
          {proposal.kind}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>ID: <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{proposal.id.slice(0, 20)}…</span></span>
        <span>By: <span style={{ color: 'var(--text)' }}>{proposal.createdBy.kind}:{proposal.createdBy.id}</span></span>
        <span>At: <span style={{ color: 'var(--text)' }}>{createdAt}</span></span>
      </div>
    </div>
  );
}
