/**
 * archon restrict — Manage Dynamic Restriction Rules
 *
 * Subcommands:
 *   archon restrict add --capability <type> --allow-path <glob>
 *   archon restrict add --capability <type> --deny-path <glob>
 *   archon restrict add-dsl "<dsl source>"
 *   archon restrict list
 *   archon restrict clear --capability <type>
 *
 * Adding a rule rebuilds the snapshot and prints the new RS_hash.
 *
 * Allowlist policy: if any allow rules exist for a capability type, the
 * action must satisfy at least one allow rule to proceed (I2).
 *
 * @see docs/specs/formal_governance.md §5 (I2: restriction monotonicity)
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Command } from 'commander';
import { CapabilityType, compileDSL } from '@archon/kernel';
import { buildRuntime, buildSnapshot } from './demo.js';

export const restrictCommand = new Command('restrict')
  .description('Manage dynamic restriction rules (I2: restriction monotonicity)');

// ---------------------------------------------------------------------------
// restrict add
// ---------------------------------------------------------------------------

restrictCommand
  .command('add')
  .description(
    'Add a path-glob restriction rule.\n' +
    '  --allow-path: only permit actions matching this glob (allowlist).\n' +
    '  --deny-path:  deny actions matching this glob.',
  )
  .requiredOption(
    '-c, --capability <type>',
    `Capability type to restrict (e.g. fs.read)`,
  )
  .option('--allow-path <glob>', 'Glob pattern for allowed paths (allowlist)')
  .option('--deny-path <glob>', 'Glob pattern for denied paths')
  .action(async (options: { capability: string; allowPath?: string; denyPath?: string }) => {
    const { capability, allowPath, denyPath } = options;

    if (allowPath === undefined && denyPath === undefined) {
      process.stderr.write('Error: must provide --allow-path or --deny-path\n');
      process.exit(1);
    }
    if (allowPath !== undefined && denyPath !== undefined) {
      process.stderr.write('Error: --allow-path and --deny-path are mutually exclusive\n');
      process.exit(1);
    }

    // Validate capability type.
    const validTypes = new Set<string>(Object.values(CapabilityType));
    if (!validTypes.has(capability)) {
      process.stderr.write(`Error: unknown capability type: ${capability}\n`);
      process.stderr.write(`  Valid types: ${[...validTypes].sort().join(', ')}\n`);
      process.exit(1);
    }

    const effect = allowPath !== undefined ? 'allow' : 'deny';
    const glob = (allowPath ?? denyPath)!;

    // Show rule summary and confirm.
    // eslint-disable-next-line no-console
    console.log('\n─── Restriction Rule Preview ────────────────────────');
    // eslint-disable-next-line no-console
    console.log(`  Capability: ${capability}`);
    // eslint-disable-next-line no-console
    console.log(`  Effect:     ${effect}`);
    // eslint-disable-next-line no-console
    console.log(`  Condition:  capability.params.path matches "${glob}"`);
    // eslint-disable-next-line no-console
    console.log('─────────────────────────────────────────────────────\n');

    const confirmed = await confirmPrompt('Add this restriction rule? [y/N] ');
    if (!confirmed) {
      // eslint-disable-next-line no-console
      console.log('Aborted.');
      return;
    }

    const { registry, capabilityRegistry, restrictionRegistry, ackStore, projectId } = buildRuntime();
    const id = restrictionRegistry.nextId();

    restrictionRegistry.addRule(
      {
        id,
        capabilityType: capability as CapabilityType,
        effect,
        conditions: [{ field: 'capability.params.path', op: 'matches', value: glob }],
      },
      { confirmed: true },
    );

    // Rebuild snapshot and print new RS_hash.
    const { hash } = buildSnapshot(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId);

    // eslint-disable-next-line no-console
    console.log(`\nRestriction rule added: ${id}`);
    // eslint-disable-next-line no-console
    console.log(`New RS_hash: ${hash}`);
  });

// ---------------------------------------------------------------------------
// restrict add-dsl
// ---------------------------------------------------------------------------

restrictCommand
  .command('add-dsl')
  .description(
    'Add a restriction rule from minimal DSL text.\n' +
    '  DSL format: allow|deny <capability_type> where <field> matches "<glob>"',
  )
  .argument('<source>', 'DSL text (e.g. \'allow fs.read where capability.params.path matches "./docs/**"\')')
  .action(async (source: string) => {
    // Compile to validate before prompting.
    const idPlaceholder = 'drr:preview';
    let compiled;
    try {
      compiled = compileDSL(idPlaceholder, source);
    } catch (err) {
      process.stderr.write(`Error: ${String(err)}\n`);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log('\n─── Restriction Rule Preview (DSL) ──────────────────');
    // eslint-disable-next-line no-console
    console.log(`  Capability: ${compiled.capabilityType}`);
    // eslint-disable-next-line no-console
    console.log(`  Effect:     ${compiled.effect}`);
    for (const cond of compiled.conditions) {
      // eslint-disable-next-line no-console
      console.log(`  Condition:  ${cond.field} ${cond.op} "${cond.value}"`);
    }
    // eslint-disable-next-line no-console
    console.log(`  IR hash:    ${compiled.ir_hash}`);
    // eslint-disable-next-line no-console
    console.log('─────────────────────────────────────────────────────\n');

    const confirmed = await confirmPrompt('Add this restriction rule? [y/N] ');
    if (!confirmed) {
      // eslint-disable-next-line no-console
      console.log('Aborted.');
      return;
    }

    const { registry, capabilityRegistry, restrictionRegistry, ackStore, projectId } = buildRuntime();
    const id = restrictionRegistry.nextId();

    // Re-compile with the real id.
    const finalCompiled = compileDSL(id, source);

    restrictionRegistry.addRule(
      {
        id,
        capabilityType: finalCompiled.capabilityType,
        effect: finalCompiled.effect,
        conditions: [...finalCompiled.conditions],
      },
      { confirmed: true },
    );

    const { hash } = buildSnapshot(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId);

    // eslint-disable-next-line no-console
    console.log(`\nRestriction rule added: ${id}`);
    // eslint-disable-next-line no-console
    console.log(`New RS_hash: ${hash}`);
  });

// ---------------------------------------------------------------------------
// restrict list
// ---------------------------------------------------------------------------

restrictCommand
  .command('list')
  .description('List all active restriction rules')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const { restrictionRegistry } = buildRuntime();
    const rules = restrictionRegistry.listRules();

    if (options.json === true) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(rules, null, 2));
      return;
    }

    if (rules.length === 0) {
      // eslint-disable-next-line no-console
      console.log('No active restriction rules.');
      return;
    }

    // eslint-disable-next-line no-console
    console.log('\n─── Active Restriction Rules ────────────────────────');
    for (const rule of rules) {
      // eslint-disable-next-line no-console
      console.log(`  ${rule.id}  ${rule.effect}  ${rule.capabilityType}`);
      for (const cond of rule.conditions) {
        // eslint-disable-next-line no-console
        console.log(`    where ${cond.field} ${cond.op} "${cond.value}"`);
      }
    }
    // eslint-disable-next-line no-console
    console.log('─────────────────────────────────────────────────────\n');
  });

// ---------------------------------------------------------------------------
// restrict clear
// ---------------------------------------------------------------------------

restrictCommand
  .command('clear')
  .description('Remove all restriction rules for a capability type (or all rules)')
  .option('-c, --capability <type>', 'Capability type to clear (omit to clear all)')
  .action(async (options: { capability?: string }) => {
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, projectId } = buildRuntime();
    const allRules = restrictionRegistry.listRules();

    let toRemove: ReadonlyArray<{ id: string; capabilityType: string }>;
    if (options.capability !== undefined) {
      toRemove = allRules.filter((r) => r.capabilityType === options.capability);
      if (toRemove.length === 0) {
        // eslint-disable-next-line no-console
        console.log(`No rules for capability type: ${options.capability}`);
        return;
      }
    } else {
      toRemove = allRules;
      if (toRemove.length === 0) {
        // eslint-disable-next-line no-console
        console.log('No active restriction rules to clear.');
        return;
      }
    }

    // eslint-disable-next-line no-console
    console.log('\n─── Rules to Remove ─────────────────────────────────');
    for (const r of toRemove) {
      // eslint-disable-next-line no-console
      console.log(`  ${r.id}  ${r.capabilityType}`);
    }
    // eslint-disable-next-line no-console
    console.log('─────────────────────────────────────────────────────\n');

    const confirmed = await confirmPrompt(`Remove ${toRemove.length} rule(s)? [y/N] `);
    if (!confirmed) {
      // eslint-disable-next-line no-console
      console.log('Aborted.');
      return;
    }

    if (options.capability !== undefined) {
      restrictionRegistry.clearRules(options.capability as CapabilityType, { confirmed: true });
    } else {
      restrictionRegistry.clearAll({ confirmed: true });
    }

    const { hash } = buildSnapshot(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId);

    // eslint-disable-next-line no-console
    console.log(`\n${toRemove.length} rule(s) removed.`);
    // eslint-disable-next-line no-console
    console.log(`New RS_hash: ${hash}`);
  });

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Display a y/N prompt and return true if the user confirms.
 *
 * @internal
 */
async function confirmPrompt(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}
