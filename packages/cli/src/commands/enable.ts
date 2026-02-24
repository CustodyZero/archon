/**
 * archon enable — Enable a module or capability
 *
 * Subcommands:
 *   archon enable module <module-id>
 *   archon enable capability <capability-type>
 *
 * Both require explicit operator confirmation (Confirm-on-Change).
 * Enabling T3 capabilities requires typed acknowledgment phrase.
 *
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 * @see docs/specs/formal_governance.md §5 (I1, I3, I5)
 */

import { Command } from 'commander';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { CapabilityType, RiskTier } from '@archon/kernel';
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
    const { registry: freshRegistry, capabilityRegistry } = buildRuntime();
    const { hash } = buildSnapshot(freshRegistry, capabilityRegistry);
    // eslint-disable-next-line no-console
    console.log(`Module enabled: ${moduleId}`);
    // eslint-disable-next-line no-console
    console.log(`RS_hash: ${hash}`);
  });

// ---------------------------------------------------------------------------
// archon enable capability <capability-type>
// ---------------------------------------------------------------------------

const enableCapabilityCommand = new Command('capability')
  .description('Enable a capability type (requires operator confirmation)')
  .argument('<capability-type>', 'Capability type to enable (e.g. fs.read)')
  .action(async (capabilityType: string) => {
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

    // Verify at least one enabled module declares this type.
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

    // Determine tier for T3 acknowledgment requirement.
    const descriptor = declaringModule.capability_descriptors.find((d) => d.type === type);
    const tier = descriptor?.tier;

    // eslint-disable-next-line no-console
    console.log(`\nEnabling capability: ${capabilityType}  tier=${tier ?? 'unknown'}`);
    // eslint-disable-next-line no-console
    console.log(`  Declared by: ${declaringModule.module_id}`);

    const rl = readline.createInterface({ input, output });
    let confirmed = false;
    try {
      if (tier === RiskTier.T3) {
        // I5: typed acknowledgment required for T3 capabilities.
        // eslint-disable-next-line no-console
        console.log('\nThis is a T3 (high-risk) capability. Typed acknowledgment required.');
        const phrase = await rl.question('Type "I acknowledge risk" to confirm: ');
        confirmed = phrase.trim() === 'I acknowledge risk';
      } else {
        const answer = await rl.question('\nEnable this capability? [y/N] ');
        confirmed = answer.trim().toLowerCase() === 'y';
      }
    } finally {
      rl.close();
    }

    if (!confirmed) {
      // eslint-disable-next-line no-console
      console.log('Aborted.');
      return;
    }

    try {
      capabilityRegistry.enableCapability(type, { confirmed: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[archon enable capability] ${String(err)}`);
      process.exit(1);
    }

    const { registry: freshRegistry, capabilityRegistry: freshCapReg } = buildRuntime();
    const { hash } = buildSnapshot(freshRegistry, freshCapReg);
    // eslint-disable-next-line no-console
    console.log(`Capability enabled: ${capabilityType}`);
    // eslint-disable-next-line no-console
    console.log(`RS_hash: ${hash}`);
  });

// ---------------------------------------------------------------------------
// Parent enable command
// ---------------------------------------------------------------------------

export const enableCommand = new Command('enable')
  .description('Enable a module or capability type')
  .addCommand(enableModuleCommand)
  .addCommand(enableCapabilityCommand);
