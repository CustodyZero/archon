/**
 * archon status — Show current system state
 *
 * Displays:
 * - Enabled modules and their capability descriptors
 * - Enabled capability types
 * - Active snapshot hash (RS_hash)
 *
 * @see docs/specs/architecture.md §3 (snapshot model)
 */

import { Command } from 'commander';
import { buildRuntime, buildSnapshot } from './demo.js';

export const statusCommand = new Command('status')
  .description('Show current system state: enabled modules, enabled capabilities, snapshot hash')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, projectId } = buildRuntime();
    const { snapshot, hash } = buildSnapshot(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId);

    const enabledModules = registry.listEnabled();
    const enabledCapabilities = capabilityRegistry.listEnabledCapabilities();
    const activeRules = restrictionRegistry.listRules();

    if (options.json === true) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        enabled_modules: enabledModules.map((m) => ({
          module_id: m.module_id,
          version: m.version,
          capabilities: m.capability_descriptors.map((d) => ({
            capability_id: d.capability_id,
            type: d.type,
            tier: d.tier,
          })),
        })),
        enabled_capabilities: enabledCapabilities,
        active_restrictions: activeRules,
        rs_hash: hash,
        constructed_at: snapshot.constructed_at,
      }, null, 2));
      return;
    }

    // Human-readable output.
    // eslint-disable-next-line no-console
    console.log('\n─── Archon Status ───────────────────────────────────');
    // eslint-disable-next-line no-console
    console.log(`RS_hash:  ${hash}`);
    // eslint-disable-next-line no-console
    console.log(`Built at: ${snapshot.constructed_at}`);

    // eslint-disable-next-line no-console
    console.log('\nEnabled modules:');
    if (enabledModules.length === 0) {
      // eslint-disable-next-line no-console
      console.log('  (none)');
    } else {
      for (const m of enabledModules) {
        // eslint-disable-next-line no-console
        console.log(`  ${m.module_id}  v${m.version}`);
        for (const d of m.capability_descriptors) {
          // eslint-disable-next-line no-console
          console.log(`    ${d.capability_id}  (${d.type})  tier=${d.tier}`);
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log('\nEnabled capabilities:');
    if (enabledCapabilities.length === 0) {
      // eslint-disable-next-line no-console
      console.log('  (none)');
    } else {
      for (const c of enabledCapabilities) {
        // eslint-disable-next-line no-console
        console.log(`  ${c}`);
      }
    }

    // eslint-disable-next-line no-console
    console.log('\nActive restrictions:');
    if (activeRules.length === 0) {
      // eslint-disable-next-line no-console
      console.log('  (none)');
    } else {
      for (const rule of activeRules) {
        // eslint-disable-next-line no-console
        console.log(`  ${rule.id}  ${rule.effect}  ${rule.capabilityType}`);
        for (const cond of rule.conditions) {
          // eslint-disable-next-line no-console
          console.log(`    where ${cond.field} ${cond.op} "${cond.value}"`);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('─────────────────────────────────────────────────────\n');
  });
