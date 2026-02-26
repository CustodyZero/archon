import { ProposalListPanel } from './ProposalListPanel';
import { ProposalDetailPanel } from './ProposalDetailPanel';

export function ProposalView() {
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <ProposalListPanel />
      <ProposalDetailPanel />
    </div>
  );
}
