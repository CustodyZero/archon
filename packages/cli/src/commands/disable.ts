/**
 * archon disable — Disable a capability module
 *
 * Requires explicit operator confirmation (Confirm-on-Change).
 *
 * Workflow:
 *   1. Resolve the active project and build runtime registries
 *   2. Verify the module is registered and currently Enabled
 *   3. Display capabilities that will be disabled (toggle diff)
 *   4. Prompt operator for explicit confirmation
 *   5. Call ModuleRegistry.disable(moduleId)
 *   6. Rebuild the Rule Snapshot via buildSnapshotForProject
 *   7. Display confirmation with new RS_hash
 *
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 */

import { Command } from 'commander';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ModuleStatus } from '@archon/kernel';
import { buildRuntime, buildSnapshot } from './demo.js';

export const disableCommand = new Command('disable')
  .description('Disable a capability module (requires operator confirmation)')
  .argument('<module-id>', 'Module ID to disable')
  .action(async (moduleId: string) => {
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, projectId } =
      buildRuntime();

    // Verify the module is registered.
    const manifest = registry.get(moduleId);
    if (manifest === undefined) {
      // eslint-disable-next-line no-console
      console.error(`[archon disable] Module not registered: ${moduleId}`);
      process.exit(1);
    }

    // Verify the module is currently Enabled.
    const status = registry.getStatus(moduleId);
    if (status !== ModuleStatus.Enabled) {
      // eslint-disable-next-line no-console
      console.error(`[archon disable] Module is not enabled: ${moduleId} (status: ${status ?? 'unknown'})`);
      process.exit(1);
    }

    // Display toggle diff: capabilities and tiers that will be disabled.
    // eslint-disable-next-line no-console
    console.log(`\nDisabling module: ${manifest.module_name} (${manifest.module_id})`);
    // eslint-disable-next-line no-console
    console.log('Capabilities that will be disabled:');
    for (const d of manifest.capability_descriptors) {
      // eslint-disable-next-line no-console
      console.log(`  ${d.capability_id}  (${d.type})  tier=${d.tier}${d.ack_required ? '  ack_required' : ''}`);
    }

    // Prompt operator for explicit confirmation (Confirm-on-Change).
    const rl = readline.createInterface({ input, output });
    let answer = '';
    try {
      answer = await rl.question('\nDisable this module? [y/N] ');
    } finally {
      rl.close();
    }

    if (answer.trim().toLowerCase() !== 'y') {
      // eslint-disable-next-line no-console
      console.log('Aborted.');
      return;
    }

    // Apply the disable operation.
    registry.disable(moduleId, { confirmed: true });

    // Rebuild snapshot to reflect the change.
    const { hash } = buildSnapshot(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId);

    // eslint-disable-next-line no-console
    console.log(`Module disabled: ${moduleId}`);
    // eslint-disable-next-line no-console
    console.log(`RS_hash: ${hash}`);
    // eslint-disable-next-line no-console
    console.warn(`[warn] Applied directly — no proposal record. Use 'archon propose' for auditable governance.`);
  });
