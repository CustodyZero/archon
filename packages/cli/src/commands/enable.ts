/**
 * archon enable — Enable a module or capability
 *
 * Subcommands:
 *   archon enable module <module-id>
 *   archon enable capability <capability-type> [--ack "<phrase>"] [--confirm-hazards]
 *
 * Both require explicit operator confirmation (Confirm-on-Change).
 * Enabling T3 capabilities requires typed acknowledgment phrase (I5).
 * Co-enabling hazard pairs requires hazard confirmation (formal_governance.md §8).
 *
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 * @see docs/specs/formal_governance.md §5 (I1, I3, I5)
 * @see docs/specs/formal_governance.md §8 (hazard composition model)
 */

import { Command } from 'commander';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { CapabilityType } from '@archon/kernel';
import {
  previewEnableCapability,
  applyEnableCapability,
  getAckEpoch,
  patchAckEventRsHash,
  patchHazardAckEventRsHash,
} from '@archon/module-loader';
import type { ApplyOptions } from '@archon/module-loader';
import { buildRuntime, buildSnapshot } from './demo.js';

// ---------------------------------------------------------------------------
// First-party module catalog
// ---------------------------------------------------------------------------

/**
 * The first-party module catalog for P0.
 * Maps module_id to the registered manifest already in the registry.
 * For P0 the catalog is hardcoded — buildRuntime() registers all manifests.
 */
const FIRST_PARTY_MODULE_IDS = new Set<string>(['filesystem']);

// ---------------------------------------------------------------------------
// archon enable module <module-id>
// ---------------------------------------------------------------------------

const enableModuleCommand = new Command('module')
  .description('Enable a capability module (requires operator confirmation)')
  .argument('<module-id>', 'Module ID to enable (e.g. filesystem)')
  .action(async (moduleId: string) => {
    if (!FIRST_PARTY_MODULE_IDS.has(moduleId)) {
      // eslint-disable-next-line no-console
      console.error(`[archon enable module] Unknown module: ${moduleId}`);
      // eslint-disable-next-line no-console
      console.error(`  Known first-party modules: ${Array.from(FIRST_PARTY_MODULE_IDS).join(', ')}`);
      process.exit(1);
    }

    const { registry } = buildRuntime();
    const manifest = registry.get(moduleId);
    if (manifest === undefined) {
      // eslint-disable-next-line no-console
      console.error(`[archon enable module] Module not registered: ${moduleId}`);
      process.exit(1);
    }

    // Display toggle diff: capabilities and tiers that will be enabled.
    // eslint-disable-next-line no-console
    console.log(`\nEnabling module: ${manifest.module_name} (${manifest.module_id})`);
    // eslint-disable-next-line no-console
    console.log('Capabilities declared:');
    for (const d of manifest.capability_descriptors) {
      // eslint-disable-next-line no-console
      console.log(`  ${d.capability_id}  (${d.type})  tier=${d.tier}${d.ack_required ? '  ack_required' : ''}`);
    }

    const rl = readline.createInterface({ input, output });
    let answer = '';
    try {
      answer = await rl.question('\nEnable this module? [y/N] ');
    } finally {
      rl.close();
    }

    if (answer.trim().toLowerCase() !== 'y') {
      // eslint-disable-next-line no-console
      console.log('Aborted.');
      return;
    }

    registry.enable(moduleId, { confirmed: true });
    const { registry: freshRegistry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const { hash } = buildSnapshot(freshRegistry, capabilityRegistry, restrictionRegistry, getAckEpoch());
    // eslint-disable-next-line no-console
    console.log(`Module enabled: ${moduleId}`);
    // eslint-disable-next-line no-console
    console.log(`RS_hash: ${hash}`);
    // eslint-disable-next-line no-console
    console.warn(`[warn] Applied directly — no proposal record. Use 'archon propose' for auditable governance.`);
  });

// ---------------------------------------------------------------------------
// archon enable capability <capability-type> [--ack "<phrase>"] [--confirm-hazards]
// ---------------------------------------------------------------------------

const enableCapabilityCommand = new Command('capability')
  .description('Enable a capability type (requires operator confirmation)')
  .argument('<capability-type>', 'Capability type to enable (e.g. fs.read)')
  .option(
    '--ack <phrase>',
    'Typed acknowledgment phrase for T3 capabilities (I ACCEPT T3 RISK (<type>))',
  )
  .option(
    '--confirm-hazards',
    'Confirm all hazard pairs triggered by this capability enablement',
    false,
  )
  .action(async (capabilityType: string, options: { ack?: string; confirmHazards: boolean }) => {
    // I7: verify the type is in the canonical taxonomy.
    const validTypes = new Set<string>(Object.values(CapabilityType));
    if (!validTypes.has(capabilityType)) {
      // eslint-disable-next-line no-console
      console.error(`[archon enable capability] Unknown capability type: ${capabilityType}`);
      // eslint-disable-next-line no-console
      console.error(`  Valid types: ${Array.from(validTypes).sort().join(', ')}`);
      process.exit(1);
    }

    const type = capabilityType as CapabilityType;
    const { registry, capabilityRegistry } = buildRuntime();

    // Preview: determine what requirements must be met.
    const preview = previewEnableCapability(type, registry, capabilityRegistry);

    // eslint-disable-next-line no-console
    console.log(`\nEnabling capability: ${capabilityType}  tier=${preview.tier}`);

    // Find declaring module for display.
    const enabledModules = registry.listEnabled();
    const declaringModule = enabledModules.find((m) =>
      m.capability_descriptors.some((d) => d.type === type),
    );
    if (declaringModule === undefined) {
      // eslint-disable-next-line no-console
      console.error(`[archon enable capability] No enabled module declares: ${capabilityType}`);
      // eslint-disable-next-line no-console
      console.error('  Enable the declaring module first (archon enable module <module-id>).');
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(`  Declared by: ${declaringModule.module_id}`);

    if (preview.activeHazardPairs.length > 0) {
      // eslint-disable-next-line no-console
      console.log('\nHazard pairs triggered:');
      for (const { entry } of preview.activeHazardPairs) {
        // eslint-disable-next-line no-console
        console.log(`  (${entry.type_a}, ${entry.type_b}): ${entry.description}`);
      }
    }

    const rl = readline.createInterface({ input, output });
    let typedAckPhrase: string | undefined;
    let hazardConfirmedPairs: Array<readonly [CapabilityType, CapabilityType]> = [];

    try {
      // I5: typed acknowledgment for T3.
      if (preview.requiresTypedAck) {
        // eslint-disable-next-line no-console
        console.log(`\nThis is a ${preview.tier} (high-risk) capability. Typed acknowledgment required.`);
        // eslint-disable-next-line no-console
        console.log(`  Expected phrase: "${preview.expectedPhrase ?? ''}"`);

        if (options.ack !== undefined) {
          // Provided via --ack flag. Still confirm intent interactively.
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
          // Interactive: prompt for typed phrase.
          typedAckPhrase = await rl.question(
            `Type exact phrase to confirm: `,
          );
          typedAckPhrase = typedAckPhrase.trim();
        }
      } else {
        // T0–T2: simple y/N confirmation.
        const answer = await rl.question('\nEnable this capability? [y/N] ');
        if (answer.trim().toLowerCase() !== 'y') {
          // eslint-disable-next-line no-console
          console.log('Aborted.');
          return;
        }
      }

      // Hazard pair confirmation.
      if (preview.activeHazardPairs.length > 0) {
        if (options.confirmHazards) {
          // --confirm-hazards flag confirms all triggered pairs.
          hazardConfirmedPairs = preview.activeHazardPairs.map(({ entry }) => [
            entry.type_a,
            entry.type_b,
          ] as const);
        } else {
          // Interactive: confirm each triggered pair.
          for (const { entry } of preview.activeHazardPairs) {
            const hazardAnswer = await rl.question(
              `\nConfirm hazard (${entry.type_a}, ${entry.type_b}): "${entry.description}"?\n` +
              `Acknowledge this hazard pair? [y/N] `,
            );
            if (hazardAnswer.trim().toLowerCase() !== 'y') {
              // eslint-disable-next-line no-console
              console.log('Aborted: hazard not confirmed.');
              return;
            }
            hazardConfirmedPairs.push([entry.type_a, entry.type_b] as const);
          }
        }
      }
    } finally {
      rl.close();
    }

    // Build opts — only include typedAckPhrase if T3.
    const applyOpts: ApplyOptions = {
      ...(preview.requiresTypedAck ? { typedAckPhrase } : {}),
      hazardConfirmedPairs: hazardConfirmedPairs as ReadonlyArray<readonly [CapabilityType, CapabilityType]>,
    };

    const applyResult = applyEnableCapability(type, applyOpts, registry, capabilityRegistry);

    if (!applyResult.applied) {
      // eslint-disable-next-line no-console
      console.error(`[archon enable capability] ${applyResult.error ?? 'Unknown error'}`);
      process.exit(1);
    }

    // Rebuild snapshot with the new ack_epoch so RS_hash reflects the change.
    const { registry: freshRegistry, capabilityRegistry: freshCapReg, restrictionRegistry: freshRestrReg } = buildRuntime();
    const { hash } = buildSnapshot(freshRegistry, freshCapReg, freshRestrReg, applyResult.ackEpoch);

    // Patch audit events with the post-apply RS_hash (two-phase write for observability).
    if (applyResult.ackEventId !== undefined) {
      patchAckEventRsHash(applyResult.ackEventId, hash);
    }
    if (applyResult.hazardEventIds !== undefined) {
      for (const id of applyResult.hazardEventIds) {
        patchHazardAckEventRsHash(id, hash);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`Capability enabled: ${capabilityType}`);
    // eslint-disable-next-line no-console
    console.log(`RS_hash: ${hash}`);
    if (preview.requiresTypedAck) {
      // eslint-disable-next-line no-console
      console.log(`ack_epoch: ${applyResult.ackEpoch}`);
    }
    // eslint-disable-next-line no-console
    console.warn(`[warn] Applied directly — no proposal record. Use 'archon propose' for auditable governance.`);
  });

// ---------------------------------------------------------------------------
// Parent enable command
// ---------------------------------------------------------------------------

export const enableCommand = new Command('enable')
  .description('Enable a module or capability type')
  .addCommand(enableModuleCommand)
  .addCommand(enableCapabilityCommand);

