/**
 * archon rules — List and manage Dynamic Restriction Rules (DRR)
 *
 * Subcommands:
 *   archon rules list              — list active rules
 *   archon rules add <file>        — add a restriction rule from file
 *   archon rules remove <rule-id>  — remove an active rule
 */

import { Command } from 'commander';

export const rulesCommand = new Command('rules')
  .description('List and manage dynamic restriction rules');

rulesCommand
  .command('list')
  .description('List all active dynamic restriction rules')
  .option('--json', 'Output as JSON')
  .action((_options: { json?: boolean }) => {
    // TODO: retrieve DRR from active Rule Snapshot — see packages/kernel/src/types/snapshot.ts
    // TODO: display rule IDs, capability types, conditions, and compiled hashes
    // TODO: include active snapshot hash in output for auditability
    // eslint-disable-next-line no-console
    console.log('[stub] archon rules list — implementation pending');
    // eslint-disable-next-line no-console
    console.log('  active rules: []');
  });

rulesCommand
  .command('add')
  .description('Add a dynamic restriction rule from a JSON/YAML file')
  .argument('<file>', 'Path to restriction rule file (JSON or YAML)')
  .action((file: string) => {
    // TODO: read and parse rule file (JSON or YAML)
    // TODO: validate rule against DRR schema
    // TODO: canonicalize rule content
    // TODO: display rule diff and tier impact
    // TODO: prompt for confirm-on-change operator confirmation
    //   see authority_and_composition_spec.md §11
    // TODO: compile rule to IR via restriction-dsl
    //   see packages/restriction-dsl/src/compiler.ts
    // TODO: rebuild Rule Snapshot with new rule included
    //   see packages/kernel/src/snapshot/builder.ts
    // eslint-disable-next-line no-console
    console.log(`[stub] archon rules add ${file} — implementation pending`);
  });

rulesCommand
  .command('remove')
  .description('Remove an active dynamic restriction rule')
  .argument('<rule-id>', 'Rule ID to remove')
  .action((ruleId: string) => {
    // TODO: verify rule exists in active snapshot
    // TODO: display rule removal diff
    // TODO: prompt for confirm-on-change operator confirmation
    // TODO: rebuild Rule Snapshot without the removed rule
    // eslint-disable-next-line no-console
    console.log(`[stub] archon rules remove ${ruleId} — implementation pending`);
  });
