import { useProposalStore } from '@/stores/useProposalStore';
import { ProposalHeader } from './ProposalHeader';
import { ProposalChangeSummary } from './ProposalChangeSummary';
import { HazardWarnings } from './HazardWarnings';
import { TypedAckField } from './TypedAckField';
import { ActionResult } from './ActionResult';
import { ProposalActions } from './ProposalActions';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorState } from '@/components/common/ErrorState';
import { ErrorBanner } from '@/components/common/ErrorBanner';

function SelectionPrompt() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>&#9672;</div>
        Select a proposal to review
      </div>
    </div>
  );
}

export function ProposalDetailPanel() {
  const selectedProposal = useProposalStore((s) => s.selectedProposal);
  const typedAckPhrase = useProposalStore((s) => s.typedAckPhrase);
  const confirmedHazardPairs = useProposalStore((s) => s.confirmedHazardPairs);
  const lastActionResult = useProposalStore((s) => s.lastActionResult);
  const actionError = useProposalStore((s) => s.actionError);
  const actionInProgress = useProposalStore((s) => s.actionInProgress);
  const setTypedAckPhrase = useProposalStore((s) => s.setTypedAckPhrase);
  const confirmHazardPair = useProposalStore((s) => s.confirmHazardPair);
  const approve = useProposalStore((s) => s.approve);
  const reject = useProposalStore((s) => s.reject);

  if (selectedProposal.status === 'idle') return <SelectionPrompt />;
  if (selectedProposal.status === 'loading') return <LoadingIndicator />;
  if (selectedProposal.status === 'error') {
    return <ErrorState message={selectedProposal.error} />;
  }

  const proposal = selectedProposal.data;
  if (proposal === null) return <SelectionPrompt />;

  const isPending = proposal.status === 'pending';
  const preview = proposal.preview;
  const requiresAck = preview.requiresTypedAck;
  const requiredPhrase = preview.requiredAckPhrase;
  const hazards = preview.hazardsTriggered;
  const requiresHazardConfirm = preview.requiresHazardConfirm;

  const ackValid = !requiresAck || typedAckPhrase === requiredPhrase;
  const hazardsConfirmed =
    !requiresHazardConfirm ||
    hazards.every(([a, b]) =>
      confirmedHazardPairs.some(([ca, cb]) => ca === a && cb === b),
    );
  const canApprove = isPending && ackValid && hazardsConfirmed && !actionInProgress;

  const handleReject = () => {
    const reason = window.prompt('Rejection reason (optional):') ?? undefined;
    void reject(proposal.id, reason || undefined);
  };

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ProposalHeader proposal={proposal} />
      <ProposalChangeSummary change={proposal.change} />

      {hazards.length > 0 && (
        <HazardWarnings
          hazards={hazards}
          confirmed={confirmedHazardPairs}
          onConfirm={confirmHazardPair}
        />
      )}

      {requiresAck && requiredPhrase !== undefined && (
        <TypedAckField
          requiredPhrase={requiredPhrase}
          value={typedAckPhrase}
          onChange={setTypedAckPhrase}
          isValid={ackValid}
        />
      )}

      {lastActionResult !== null && <ActionResult result={lastActionResult} />}
      {actionError !== null && <ErrorBanner message={actionError} />}

      {isPending && (
        <ProposalActions
          canApprove={canApprove}
          inProgress={actionInProgress}
          onApprove={() => void approve(proposal.id)}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
