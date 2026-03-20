/**
 * archon propose — Submit a governance proposal for human review
 *
 * Subcommands:
 *   archon propose enable capability <type>   [--as-agent <id>]
 *   archon propose enable module <module-id>  [--as-agent <id>]
 *   archon propose disable capability <type>  [--as-agent <id>]
 *   archon propose disable module <module-id> [--as-agent <id>]
 *   archon propose set restrictions --file <path> [--as-agent <id>]
 *   archon propose set fs-roots <id> <path> <perm> [--as-agent <id>]
 *   archon propose set net-allowlist <hostname...> [--as-agent <id>]
 *   archon propose set exec-root <root-id>    [--as-agent <id>]
 *   archon propose set secret <key> <value>   [--as-agent <id>]
 *   archon propose delete secret <key>         [--as-agent <id>]
 *   archon propose set secret-mode <mode>     [--passphrase <p>] [--as-agent <id>]
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
import { resolve } from 'node:path';
import { Command } from 'commander';
import { CapabilityType, compileDSL } from '@archon/kernel';
import type { ProposedBy, FsRoot, FsRootPerm } from '@archon/kernel';
import { ProposalQueue } from '@archon/module-loader';
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
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, projectId, resourceConfigStore } = buildRuntime();
    const { hash } = buildSnapshot(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId, resourceConfigStore);
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

    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

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
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const manifest = registry.get(moduleId);
    if (manifest === undefined) {
      process.stderr.write(`[archon propose] Module not registered: ${moduleId}\n`);
      process.exit(1);
    }

    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

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

    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

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
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const manifest = registry.get(moduleId);
    if (manifest === undefined) {
      process.stderr.write(`[archon propose] Module not registered: ${moduleId}\n`);
      process.exit(1);
    }

    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

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
  .description('Propose setting restrictions, resource config, or secrets');

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
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const ruleId = restrictionRegistry.nextId();

    const rule = {
      id: ruleId,
      capabilityType: compiled.capabilityType,
      effect: compiled.effect,
      conditions: [...compiled.conditions],
    };

    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

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
// archon propose set fs-roots
// ---------------------------------------------------------------------------

proposeSetCommand
  .command('fs-roots')
  .description(
    'Propose setting filesystem roots for the active project.\n' +
    'Each root is specified as: <id> <path> <perm>\n' +
    'Repeat the triplet for multiple roots.\n' +
    'Example: archon propose set fs-roots workspace /home/user/work rw docs /docs ro',
  )
  .argument('<roots...>', 'Root triplets: <id> <path> <perm> (repeated)')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((rootArgs: string[], options: { asAgent?: string }) => {
    if (rootArgs.length % 3 !== 0) {
      process.stderr.write('[archon propose] fs-roots requires triplets: <id> <path> <perm>\n');
      process.stderr.write(`  Got ${String(rootArgs.length)} args (not divisible by 3).\n`);
      process.stderr.write('  Example: archon propose set fs-roots workspace /home/user/work rw\n');
      process.exit(1);
    }

    const validPerms = new Set<string>(['ro', 'rw']);
    const roots: FsRoot[] = [];
    for (let i = 0; i < rootArgs.length; i += 3) {
      const id = rootArgs[i]!;
      const rawPath = rootArgs[i + 1]!;
      const perm = rootArgs[i + 2]!;

      if (!validPerms.has(perm)) {
        process.stderr.write(`[archon propose] Invalid perm '${perm}' for root '${id}'. Must be 'ro' or 'rw'.\n`);
        process.exit(1);
      }

      // Resolve to absolute path — FsRoot.path must be absolute.
      const absPath = resolve(rawPath);
      roots.push({ id, path: absPath, perm: perm as FsRootPerm });
    }

    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

    const proposal = queue.propose(
      { kind: 'set_project_fs_roots', roots },
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
// archon propose set net-allowlist
// ---------------------------------------------------------------------------

proposeSetCommand
  .command('net-allowlist')
  .description(
    'Propose setting the network hostname allowlist for the active project.\n' +
    'Specify one or more hostnames. Empty list = deny all network operations.\n' +
    'Example: archon propose set net-allowlist api.anthropic.com api.openai.com',
  )
  .argument('<hostnames...>', 'Hostnames to allow (e.g. api.anthropic.com)')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((hostnames: string[], options: { asAgent?: string }) => {
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

    const proposal = queue.propose(
      { kind: 'set_project_net_allowlist', allowlist: hostnames },
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
// archon propose set exec-root
// ---------------------------------------------------------------------------

proposeSetCommand
  .command('exec-root')
  .description(
    'Propose setting the exec working directory root for the active project.\n' +
    'The root-id must match an existing FsRoot ID, or "null" to reset to default.\n' +
    'Example: archon propose set exec-root workspace',
  )
  .argument('<root-id>', 'FsRoot ID to use as exec cwd (or "null" to reset)')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((rootId: string, options: { asAgent?: string }) => {
    const resolvedRootId = rootId === 'null' ? null : rootId;

    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

    const proposal = queue.propose(
      { kind: 'set_project_exec_root', rootId: resolvedRootId },
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
// archon propose set secret
// ---------------------------------------------------------------------------

proposeSetCommand
  .command('secret')
  .description(
    'Propose setting an encrypted secret in the project SecretStore.\n' +
    'The value is redacted from the proposal record and must be re-supplied\n' +
    'at approval time via --secret-value on the approve command.\n' +
    'Example: archon propose set secret ANTHROPIC_API_KEY sk-ant-...',
  )
  .argument('<key>', 'Secret key identifier')
  .argument('<value>', 'Secret value (redacted from proposal record)')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((key: string, value: string, options: { asAgent?: string }) => {
    if (key === '') {
      process.stderr.write('[archon propose] Secret key must be non-empty.\n');
      process.exit(1);
    }

    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

    const proposal = queue.propose(
      { kind: 'set_secret', key, value },
      proposer,
    );

    // eslint-disable-next-line no-console
    console.log(`\nProposal created: ${proposal.id}`);
    // eslint-disable-next-line no-console
    console.log(`  Change:   ${proposal.preview.changeSummary}`);
    // eslint-disable-next-line no-console
    console.log(`  Status:   pending`);
    // eslint-disable-next-line no-console
    console.log(`\n  NOTE: The secret value has been redacted from the proposal record.`);
    // eslint-disable-next-line no-console
    console.log(`  You must re-supply it at approval time:`);
    // eslint-disable-next-line no-console
    console.log(`    archon proposals approve ${proposal.id} --secret-value <value>`);
    // eslint-disable-next-line no-console
    console.log(`\nTo reject:   archon proposals reject ${proposal.id}`);
  });

// ---------------------------------------------------------------------------
// archon propose set secret-mode
// ---------------------------------------------------------------------------

proposeSetCommand
  .command('secret-mode')
  .description(
    'Propose switching the secret store encryption mode.\n' +
    'Modes: "device" (machine-bound key) or "portable" (passphrase-derived key).\n' +
    'Switching to portable mode requires a passphrase (--passphrase or at approval time).\n' +
    'Example: archon propose set secret-mode portable --passphrase mypass',
  )
  .argument('<mode>', 'Encryption mode: "device" or "portable"')
  .option('--passphrase <passphrase>', 'Passphrase for portable mode (redacted from proposal)')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((mode: string, options: { passphrase?: string; asAgent?: string }) => {
    if (mode !== 'device' && mode !== 'portable') {
      process.stderr.write(`[archon propose] Invalid mode '${mode}'. Must be 'device' or 'portable'.\n`);
      process.exit(1);
    }

    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

    const proposal = queue.propose(
      {
        kind: 'set_secret_mode',
        mode: mode as 'device' | 'portable',
        ...(options.passphrase !== undefined ? { passphrase: options.passphrase } : {}),
      },
      proposer,
    );

    // eslint-disable-next-line no-console
    console.log(`\nProposal created: ${proposal.id}`);
    // eslint-disable-next-line no-console
    console.log(`  Change:   ${proposal.preview.changeSummary}`);
    // eslint-disable-next-line no-console
    console.log(`  Status:   pending`);
    if (mode === 'portable' && options.passphrase === undefined) {
      // eslint-disable-next-line no-console
      console.log(`\n  NOTE: Portable mode requires a passphrase at approval time:`);
      // eslint-disable-next-line no-console
      console.log(`    archon proposals approve ${proposal.id} --secret-passphrase <passphrase>`);
    }
    // eslint-disable-next-line no-console
    console.log(`\nTo approve:  archon proposals approve ${proposal.id}`);
    // eslint-disable-next-line no-console
    console.log(`To reject:   archon proposals reject ${proposal.id}`);
  });

// ---------------------------------------------------------------------------
// archon propose delete
// ---------------------------------------------------------------------------

const proposeDeleteCommand = new Command('delete')
  .description('Propose deleting a secret or module');

proposeDeleteCommand
  .command('secret')
  .description(
    'Propose deleting an encrypted secret from the project SecretStore.\n' +
    'Example: archon propose delete secret ANTHROPIC_API_KEY',
  )
  .argument('<key>', 'Secret key to delete')
  .option('--as-agent <id>', 'Submit proposal as an agent with the given ID')
  .action((key: string, options: { asAgent?: string }) => {
    if (key === '') {
      process.stderr.write('[archon propose] Secret key must be non-empty.\n');
      process.exit(1);
    }

    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, ctx } = buildRuntime();
    const proposer = resolveProposer(options.asAgent);
    const queue = new ProposalQueue(registry, capabilityRegistry, restrictionRegistry, makeSnapshotHashFn(), stateIO, ackStore, ctx);

    const proposal = queue.propose(
      { kind: 'delete_secret', key },
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
  .addCommand(proposeSetCommand)
  .addCommand(proposeDeleteCommand);
