/**
 * archon propose — Submit a governance proposal for human review
 *
 * Subcommands:
 *   archon propose enable capability <type>   [--as-agent <id>]
 *   archon propose enable module <module-id>  [--as-agent <id>]
 *   archon propose disable capability <type>  [--as-agent <id>]
 *   archon propose disable module <module-id> [--as-agent <id>]
 *   archon propose set restrictions --file <path> [--as-agent <id>]
 *
 * Proposals are created in 'pending' status and require human approval
 * via `archon proposals approve <id>` before any state change occurs.
 *
 * Any entity may submit a proposal, including agents (--as-agent).
 * Only human-class entities may approve or reject proposals.
 *
 * @see docs/specs/formal_governance.md §5 (governance invariants)
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { CapabilityType, compileDSL } from '@archon/kernel';
import type { ProposedBy } from '@archon/kernel';
import { ProposalQueue } from '@archon/module-loader';
import { getAckEpoch } from '@archon/module-loader';
import { buildRuntime, buildSnapshot } from './demo.js';

// ---------------------------------------------------------------------------
// Shared factory for buildSnapshotHash
// ---------------------------------------------------------------------------

/**
 * Returns a function that rebuilds the snapshot from current state and
 * returns the RS_hash string. Passed to ProposalQueue as buildSnapshotHash.
 */
function makeSnapshotHashFn(): () => string {
  return () => {
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const { hash } = buildSnapshot(registry, capabilityRegistry, restrictionRegistry, getAckEpoch());
    return hash;
  };
}

// ---------------------------------------------------------------------------
// Resolve proposer identity from --as-agent option
// ---------------------------------------------------------------------------

function resolveProposer(asAgent: string | undefined): ProposedBy {
  if (asAgent !== undefined) {
    return { kind: 'agent', id: asAgent };
  }
  return { kind: 'cli', id: 'operator' };
}

// ---------------------------------------------------------------------------
// Output helper: print proposal created confirmation
// ---------------------------------------------------------------------------

function printProposalCreated(
  proposalId: string,
  changeSummary: string,
  requiresTypedAck: boolean,
  requiredAckPhrase: string | undefined,
  hazardsTriggered: ReadonlyArray<readonly [unknown, unknown]>,
): void {
  // eslint-disable-next-line no-console
  console.log(`\nProposal created: ${proposalId}`);
  // eslint-disable-next-line no-console
  console.log(`  Change:   ${changeSummary}`);
  // eslint-disable-next-line no-console
  console.log(`  Status:   pending`);
  if (requiresTypedAck) {
    // eslint-disable-next-line no-console
    console.log(`\nThis proposal requires a typed acknowledgment phrase to approve:`);
    // eslint-disable-next-line no-console
    console.log(`  Required phrase: "${requiredAckPhrase ?? ''}"`);
  }
  if (hazardsTriggered.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`\nHazard pairs triggered by this proposal:`);
    for (const [a, b] of hazardsTriggered) {
      // eslint-disable-next-line no-console
      console.log(`  (${String(a)}, ${String(b)})`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\nTo approve:  archon proposals approve ${proposalId}`);
  // eslint-disable-next-line no-console
  console.log(`To reject:   archon proposals reject ${proposalId}`);
}

// ---------------------------------------------------------------------------
// archon propose enable
// ---------------------------------------------------------------------------

const proposeEnableCommand = new Command('enable')
  .description('Propose enabling a capability or module');

proposeEnableCommand
  .command('capability')
  .description('Propose enabling a capability type')
  .argument('<type>', 'Capability type to enable (e.g. fs.read)')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((type: string, options: { asAgent?: string }) => {
    const validTypes = new Set<string>(Object.values(CapabilityType));
    if (!validTypes.has(type)) {
      process.stderr.write(`[archon propose] Unknown capability type: ${type}\n`);
      process.stderr.write(`  Valid types: ${Array.from(validTypes).sort().join(', ')}\n`);
      process.exit(1);
    }

    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn());

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: type as CapabilityType },
      proposer,
    );

    printProposalCreated(
      proposal.id,
      proposal.preview.changeSummary,
      proposal.preview.requiresTypedAck,
      proposal.preview.requiredAckPhrase,
      proposal.preview.hazardsTriggered,
    );
  });

proposeEnableCommand
  .command('module')
  .description('Propose enabling a module')
  .argument('<module-id>', 'Module ID to enable (e.g. filesystem)')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((moduleId: string, options: { asAgent?: string }) => {
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const manifest = registry.get(moduleId);
    if (manifest === undefined) {
      process.stderr.write(`[archon propose] Module not registered: ${moduleId}\n`);
      process.exit(1);
    }

    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn());

    const proposal = queue.propose(
      { kind: 'enable_module', moduleId },
      proposer,
    );

    printProposalCreated(
      proposal.id,
      proposal.preview.changeSummary,
      proposal.preview.requiresTypedAck,
      proposal.preview.requiredAckPhrase,
      proposal.preview.hazardsTriggered,
    );
  });

// ---------------------------------------------------------------------------
// archon propose disable
// ---------------------------------------------------------------------------

const proposeDisableCommand = new Command('disable')
  .description('Propose disabling a capability or module');

proposeDisableCommand
  .command('capability')
  .description('Propose disabling a capability type')
  .argument('<type>', 'Capability type to disable (e.g. fs.read)')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((type: string, options: { asAgent?: string }) => {
    const validTypes = new Set<string>(Object.values(CapabilityType));
    if (!validTypes.has(type)) {
      process.stderr.write(`[archon propose] Unknown capability type: ${type}\n`);
      process.stderr.write(`  Valid types: ${Array.from(validTypes).sort().join(', ')}\n`);
      process.exit(1);
    }

    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn());

    const proposal = queue.propose(
      { kind: 'disable_capability', capabilityType: type as CapabilityType },
      proposer,
    );

    printProposalCreated(
      proposal.id,
      proposal.preview.changeSummary,
      false,
      undefined,
      [],
    );
  });

proposeDisableCommand
  .command('module')
  .description('Propose disabling a module')
  .argument('<module-id>', 'Module ID to disable')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((moduleId: string, options: { asAgent?: string }) => {
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const manifest = registry.get(moduleId);
    if (manifest === undefined) {
      process.stderr.write(`[archon propose] Module not registered: ${moduleId}\n`);
      process.exit(1);
    }

    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn());

    const proposal = queue.propose(
      { kind: 'disable_module', moduleId },
      proposer,
    );

    printProposalCreated(
      proposal.id,
      proposal.preview.changeSummary,
      false,
      undefined,
      [],
    );
  });

// ---------------------------------------------------------------------------
// archon propose set
// ---------------------------------------------------------------------------

const proposeSetCommand = new Command('set')
  .description('Propose setting restrictions');

proposeSetCommand
  .command('restrictions')
  .description(
    'Propose replacing restriction rules for a capability type.\n' +
    'The file must contain a single DSL restriction rule.\n' +
    'This replaces ALL existing rules for the affected capability type.',
  )
  .requiredOption('--file <path>', 'Path to DSL restriction file')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((options: { file: string; asAgent?: string }) => {
    // Read and compile the DSL source.
    let source: string;
    try {
      source = readFileSync(options.file, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[archon propose] Cannot read file: ${msg}\n`);
      process.exit(1);
    }

    // Compile to validate. Use a placeholder id — the real id is assigned by the registry.
    let compiled;
    try {
      compiled = compileDSL('drr:preview', source.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[archon propose] DSL compilation failed: ${msg}\n`);
      process.exit(1);
    }

    // The restriction registry is used only to allocate a new rule id.
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const ruleId = restrictionRegistry.nextId();

    const rule = {
      id: ruleId,
      capabilityType: compiled.capabilityType,
      effect: compiled.effect,
      conditions: [...compiled.conditions],
    };

    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn());

    const proposal = queue.propose(
      { kind: 'set_restrictions', rules: [rule], dslSource: source.trim() },
      proposer,
    );

    printProposalCreated(
      proposal.id,
      proposal.preview.changeSummary,
      false,
      undefined,
      [],
    );
  });

// ---------------------------------------------------------------------------
// Parent propose command
// ---------------------------------------------------------------------------

export const proposeCommand = new Command('propose')
  .description(
    'Submit a governance proposal for human review.\n' +
    'Proposals are created in pending status; use `archon proposals approve <id>` to apply.',
  )
  .addCommand(proposeEnableCommand)
  .addCommand(proposeDisableCommand)
  .addCommand(proposeSetCommand);
