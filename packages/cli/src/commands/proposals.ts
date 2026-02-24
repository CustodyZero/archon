/**
 * archon proposals — Review and act on governance proposals
 *
 * Subcommands:
 *   archon proposals list   [--status <status>] [--json]
 *   archon proposals show   <id> [--json]
 *   archon proposals approve <id> [--ack "<phrase>"] [--confirm-hazards]
 *   archon proposals reject  <id> [--reason "<reason>"]
 *
 * Proposals must be in 'pending' status to be approved or rejected.
 * Only human-class entities (kind: human, cli, ui) may approve or reject.
 * Agents may only submit proposals via `archon propose`.
 *
 * @see docs/specs/formal_governance.md §5 (governance invariants)
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 */

import { Command } from 'commander';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { CapabilityType } from '@archon/kernel';
import type { ProposedBy } from '@archon/kernel';
import { ProposalQueue } from '@archon/module-loader';
import { getAckEpoch } from '@archon/module-loader';
import { buildRuntime, buildSnapshot } from './demo.js';

// ---------------------------------------------------------------------------
// Shared factory for buildSnapshotHash
// ---------------------------------------------------------------------------

function makeSnapshotHashFn(): () => string {
  return () => {
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const { hash } = buildSnapshot(registry, capabilityRegistry, restrictionRegistry, getAckEpoch());
    return hash;
  };
}

/** Human (cli) approver identity for all interactive approval actions. */
const CLI_APPROVER: ProposedBy = { kind: 'cli', id: 'operator' };

// ---------------------------------------------------------------------------
// archon proposals list
// ---------------------------------------------------------------------------

const proposalsListCommand = new Command('list')
  .description('List governance proposals')
  .option('--status <status>', 'Filter by status: pending, applied, rejected, failed')
  .option('--json', 'Output as JSON')
  .action((options: { status?: string; json?: boolean }) => {
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn());

    const validStatuses = new Set(['pending', 'applied', 'rejected', 'failed']);
    if (options.status !== undefined && !validStatuses.has(options.status)) {
      process.stderr.write(`[archon proposals] Unknown status: ${options.status}\n`);
      process.stderr.write(`  Valid: ${Array.from(validStatuses).join(', ')}\n`);
      process.exit(1);
    }

    const filter = options.status !== undefined
      ? { status: options.status as 'pending' | 'applied' | 'rejected' | 'failed' }
      : undefined;

    const proposals = queue.listProposals(filter);

    if (options.json === true) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(proposals, null, 2));
      return;
    }

    if (proposals.length === 0) {
      // eslint-disable-next-line no-console
      console.log(options.status !== undefined
        ? `No ${options.status} proposals.`
        : 'No proposals found.');
      return;
    }

    // eslint-disable-next-line no-console
    console.log('\n─── Governance Proposals ────────────────────────────');
    for (const p of proposals) {
      const createdAt = p.createdAt.substring(0, 19).replace('T', ' ');
      const proposerTag = p.createdBy.kind === 'agent' ? ` [agent:${p.createdBy.id}]` : '';
      // eslint-disable-next-line no-console
      console.log(`  ${p.id.substring(0, 8)}…  ${p.status.padEnd(8)}  ${createdAt}${proposerTag}`);
      // eslint-disable-next-line no-console
      console.log(`             ${p.changeSummary}`);
    }
    // eslint-disable-next-line no-console
    console.log('─────────────────────────────────────────────────────\n');
    // eslint-disable-next-line no-console
    console.log(`Showing ${proposals.length} proposal(s). Use 'archon proposals show <id>' for details.`);
  });

// ---------------------------------------------------------------------------
// archon proposals show <id>
// ---------------------------------------------------------------------------

const proposalsShowCommand = new Command('show')
  .description('Show full details of a proposal')
  .argument('<id>', 'Proposal ID (full UUID or unique prefix)')
  .option('--json', 'Output as JSON')
  .action((id: string, options: { json?: boolean }) => {
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn());

    const proposal = resolveProposalById(queue, id);
    if (proposal === undefined) {
      process.stderr.write(`[archon proposals] Proposal not found: ${id}\n`);
      process.exit(1);
    }

    if (options.json === true) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(proposal, null, 2));
      return;
    }

    // eslint-disable-next-line no-console
    console.log('\n─── Proposal Details ────────────────────────────────');
    // eslint-disable-next-line no-console
    console.log(`  ID:         ${proposal.id}`);
    // eslint-disable-next-line no-console
    console.log(`  Status:     ${proposal.status}`);
    // eslint-disable-next-line no-console
    console.log(`  Kind:       ${proposal.kind}`);
    // eslint-disable-next-line no-console
    console.log(`  Created:    ${proposal.createdAt}`);
    // eslint-disable-next-line no-console
    console.log(`  Created by: ${proposal.createdBy.kind}:${proposal.createdBy.id}`);
    // eslint-disable-next-line no-console
    console.log(`  Change:     ${proposal.preview.changeSummary}`);

    if (proposal.preview.requiresTypedAck) {
      // eslint-disable-next-line no-console
      console.log(`\n  Requires typed ack: "${proposal.preview.requiredAckPhrase ?? ''}"`);
    }
    if (proposal.preview.hazardsTriggered.length > 0) {
      // eslint-disable-next-line no-console
      console.log('\n  Hazard pairs triggered:');
      for (const [a, b] of proposal.preview.hazardsTriggered) {
        // eslint-disable-next-line no-console
        console.log(`    (${a}, ${b})`);
      }
    }

    if (proposal.status === 'applied') {
      // eslint-disable-next-line no-console
      console.log(`\n  Approved by: ${proposal.approvedBy?.kind}:${proposal.approvedBy?.id}`);
      // eslint-disable-next-line no-console
      console.log(`  Applied at:  ${proposal.appliedAt ?? ''}`);
      // eslint-disable-next-line no-console
      console.log(`  RS_hash:     ${proposal.rsHashAfter ?? '(not yet computed)'}`);
    }
    if (proposal.status === 'rejected') {
      // eslint-disable-next-line no-console
      console.log(`\n  Rejected by: ${proposal.rejectedBy?.kind}:${proposal.rejectedBy?.id}`);
      // eslint-disable-next-line no-console
      console.log(`  Rejected at: ${proposal.rejectedAt ?? ''}`);
      if (proposal.rejectionReason !== undefined) {
        // eslint-disable-next-line no-console
        console.log(`  Reason:      ${proposal.rejectionReason}`);
      }
    }
    if (proposal.status === 'failed') {
      // eslint-disable-next-line no-console
      console.log(`\n  Failed at:   ${proposal.failedAt ?? ''}`);
      // eslint-disable-next-line no-console
      console.log(`  Reason:      ${proposal.failureReason ?? ''}`);
    }

    // eslint-disable-next-line no-console
    console.log('─────────────────────────────────────────────────────\n');
  });

// ---------------------------------------------------------------------------
// archon proposals approve <id>
// ---------------------------------------------------------------------------

const proposalsApproveCommand = new Command('approve')
  .description('Approve and apply a pending proposal')
  .argument('<id>', 'Proposal ID (full UUID or unique prefix)')
  .option('--ack <phrase>', 'Typed acknowledgment phrase for T3 capabilities')
  .option('--confirm-hazards', 'Confirm all triggered hazard pairs', false)
  .action(async (id: string, options: { ack?: string; confirmHazards: boolean }) => {
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn());

    const proposal = resolveProposalById(queue, id);
    if (proposal === undefined) {
      process.stderr.write(`[archon proposals] Proposal not found: ${id}\n`);
      process.exit(1);
    }

    if (proposal.status !== 'pending') {
      process.stderr.write(`[archon proposals] Proposal is not pending (status: ${proposal.status})\n`);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(`\nApproving proposal: ${proposal.id}`);
    // eslint-disable-next-line no-console
    console.log(`  Change: ${proposal.preview.changeSummary}`);

    const rl = readline.createInterface({ input, output });
    let typedAckPhrase: string | undefined;
    let hazardConfirmedPairs: Array<readonly [CapabilityType, CapabilityType]> = [];

    try {
      // T3 typed acknowledgment.
      if (proposal.preview.requiresTypedAck) {
        // eslint-disable-next-line no-console
        console.log(`\nThis capability requires a typed acknowledgment phrase.`);
        // eslint-disable-next-line no-console
        console.log(`  Required phrase: "${proposal.preview.requiredAckPhrase ?? ''}"`);

        if (options.ack !== undefined) {
          typedAckPhrase = options.ack;
          // eslint-disable-next-line no-console
          console.log(`  Typed phrase (from --ack): "${typedAckPhrase}"`);
          const check = await rl.question('Proceed? [y/N] ');
          if (check.trim().toLowerCase() !== 'y') {
            // eslint-disable-next-line no-console
            console.log('Aborted.');
            return;
          }
        } else {
          typedAckPhrase = await rl.question('Type exact phrase to confirm: ');
          typedAckPhrase = typedAckPhrase.trim();
        }
      } else {
        const answer = await rl.question('\nApprove this proposal? [y/N] ');
        if (answer.trim().toLowerCase() !== 'y') {
          // eslint-disable-next-line no-console
          console.log('Aborted.');
          return;
        }
      }

      // Hazard pair confirmation.
      if (proposal.preview.hazardsTriggered.length > 0) {
        if (options.confirmHazards) {
          hazardConfirmedPairs = proposal.preview.hazardsTriggered.map(
            ([a, b]) => [a, b] as const,
          );
        } else {
          // eslint-disable-next-line no-console
          console.log('\nHazard pairs triggered by this proposal:');
          for (const [a, b] of proposal.preview.hazardsTriggered) {
            const hazardAnswer = await rl.question(
              `  Confirm hazard (${a}, ${b})? [y/N] `,
            );
            if (hazardAnswer.trim().toLowerCase() !== 'y') {
              // eslint-disable-next-line no-console
              console.log('Aborted: hazard not confirmed.');
              return;
            }
            hazardConfirmedPairs.push([a, b] as const);
          }
        }
      }
    } finally {
      rl.close();
    }

    const result = queue.approveProposal(
      proposal.id,
      {
        ...(typedAckPhrase !== undefined ? { typedAckPhrase } : {}),
        hazardConfirmedPairs: hazardConfirmedPairs as ReadonlyArray<readonly [CapabilityType, CapabilityType]>,
      },
      CLI_APPROVER,
    );

    if (!result.applied) {
      process.stderr.write(`[archon proposals] Approval failed: ${result.error ?? 'Unknown error'}\n`);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(`\nProposal applied: ${proposal.id}`);
    // eslint-disable-next-line no-console
    console.log(`RS_hash: ${result.rsHashAfter ?? '(not computed)'}`);
    if (proposal.preview.requiresTypedAck) {
      // eslint-disable-next-line no-console
      console.log(`ack_epoch: ${result.ackEpoch}`);
    }
  });

// ---------------------------------------------------------------------------
// archon proposals reject <id>
// ---------------------------------------------------------------------------

const proposalsRejectCommand = new Command('reject')
  .description('Reject a pending proposal')
  .argument('<id>', 'Proposal ID (full UUID or unique prefix)')
  .option('--reason <reason>', 'Reason for rejection (recorded in audit trail)')
  .action(async (id: string, options: { reason?: string }) => {
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn());

    const proposal = resolveProposalById(queue, id);
    if (proposal === undefined) {
      process.stderr.write(`[archon proposals] Proposal not found: ${id}\n`);
      process.exit(1);
    }

    if (proposal.status !== 'pending') {
      process.stderr.write(`[archon proposals] Proposal is not pending (status: ${proposal.status})\n`);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(`\nRejecting proposal: ${proposal.id}`);
    // eslint-disable-next-line no-console
    console.log(`  Change: ${proposal.preview.changeSummary}`);

    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question('\nReject this proposal? [y/N] ');
      if (answer.trim().toLowerCase() !== 'y') {
        // eslint-disable-next-line no-console
        console.log('Aborted.');
        return;
      }
    } finally {
      rl.close();
    }

    const rejected = queue.rejectProposal(proposal.id, CLI_APPROVER, options.reason);
    if (rejected === undefined) {
      process.stderr.write(`[archon proposals] Failed to reject proposal (already resolved?)\n`);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(`\nProposal rejected: ${rejected.id}`);
    if (options.reason !== undefined) {
      // eslint-disable-next-line no-console
      console.log(`  Reason: ${options.reason}`);
    }
  });

// ---------------------------------------------------------------------------
// Parent proposals command
// ---------------------------------------------------------------------------

export const proposalsCommand = new Command('proposals')
  .description('Review and act on governance proposals')
  .addCommand(proposalsListCommand)
  .addCommand(proposalsShowCommand)
  .addCommand(proposalsApproveCommand)
  .addCommand(proposalsRejectCommand);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a proposal by full UUID or unique prefix.
 * Returns undefined if not found or ambiguous.
 */
function resolveProposalById(
  queue: ProposalQueue,
  idOrPrefix: string,
): ReturnType<ProposalQueue['getProposal']> {
  // Try exact match first.
  const exact = queue.getProposal(idOrPrefix);
  if (exact !== undefined) return exact;

  // Try prefix match if the input is shorter than a UUID (36 chars).
  if (idOrPrefix.length < 36) {
    const all = queue.listProposals();
    const matches = all.filter((p) => p.id.startsWith(idOrPrefix));
    if (matches.length === 1 && matches[0] !== undefined) {
      return queue.getProposal(matches[0].id);
    }
    if (matches.length > 1) {
      process.stderr.write(
        `[archon proposals] Ambiguous prefix '${idOrPrefix}' matches ${matches.length} proposals.\n`,
      );
      process.stderr.write('  Provide more characters or use the full UUID.\n');
      process.exit(1);
    }
  }

  return undefined;
}
