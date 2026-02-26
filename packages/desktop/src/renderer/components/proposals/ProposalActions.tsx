import type { CSSProperties } from 'react';

interface ProposalActionsProps {
  canApprove: boolean;
  inProgress: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function ProposalActions({ canApprove, inProgress, onApprove, onReject }: ProposalActionsProps) {
  const baseBtn: CSSProperties = {
    padding: '8px 20px',
    borderRadius: 3,
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    border: '1px solid',
    transition: 'all 0.15s',
  };

  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
      <button
        onClick={onApprove}
        disabled={!canApprove || inProgress}
        style={{
          ...baseBtn,
          background: canApprove && !inProgress ? 'rgba(129,199,132,0.12)' : 'transparent',
          borderColor: canApprove && !inProgress ? 'var(--green)' : 'var(--border)',
          color: canApprove && !inProgress ? 'var(--green)' : 'var(--text-dim)',
          opacity: canApprove ? 1 : 0.5,
        }}
      >
        {inProgress ? 'Applying\u2026' : 'Approve & Apply'}
      </button>
      <button
        onClick={onReject}
        disabled={inProgress}
        style={{
          ...baseBtn,
          background: 'transparent',
          borderColor: inProgress ? 'var(--border)' : 'rgba(207,102,121,0.4)',
          color: inProgress ? 'var(--text-dim)' : 'var(--red)',
          opacity: inProgress ? 0.4 : 1,
        }}
      >
        Reject
      </button>
    </div>
  );
}
