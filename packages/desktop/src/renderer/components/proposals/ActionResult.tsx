import type { ApproveResult } from '@/types/api';

interface ActionResultProps { result: ApproveResult }

export function ActionResult({ result }: ActionResultProps) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 4,
        marginBottom: 12,
        background: result.applied ? 'rgba(129,199,132,0.08)' : 'rgba(207,102,121,0.08)',
        border: `1px solid ${result.applied ? 'rgba(129,199,132,0.3)' : 'rgba(207,102,121,0.3)'}`,
        fontSize: 12,
        color: result.applied ? 'var(--green)' : 'var(--red)',
      }}
    >
      {result.applied ? '✓ Proposal applied successfully' : `✗ ${result.error ?? 'Approval failed'}`}
    </div>
  );
}
